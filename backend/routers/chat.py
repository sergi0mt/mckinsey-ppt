"""Chat and SSE streaming router — the core interactive endpoint."""
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from ..database import get_db
from ..models.api_models import MessageCreate, MessageResponse, SessionResponse
from ..services.orchestrator import get_stage_prompt, extract_structured_data, STAGE_NAMES
from ..services.ai_service import stream_response
from ..services.web_search import search_web, multi_query_search, multi_lang_search, deep_fetch_results, format_web_results
from ..services.json_cleaner import clean_json_response
from ..services.self_refine import self_refine_loop
from ..services.research_agent import run_research_agent, format_research_brief_for_prompt, persist_research_state, get_persisted_research
from ..services.engagement_templates import get_template

router = APIRouter(tags=["chat"])


@router.get("/projects/{project_id}/session")
async def get_or_create_session(project_id: str) -> SessionResponse:
    """Get the active session for a project, or create one."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
            (project_id,),
        )
        row = await cursor.fetchone()

        if row:
            return SessionResponse(
                id=row["id"],
                project_id=row["project_id"],
                current_stage=row["current_stage"],
                stage_data=json.loads(row["stage_data"] or "{}"),
                created_at=row["created_at"],
            )

        # Create new session
        session_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO sessions (id, project_id, current_stage, stage_data) VALUES (?, ?, 1, '{}')",
            (session_id, project_id),
        )
        await db.commit()
        return SessionResponse(
            id=session_id, project_id=project_id, current_stage=1,
            stage_data={}, created_at=datetime.utcnow().isoformat(),
        )
    finally:
        await db.close()


@router.get("/sessions/{session_id}/messages")
async def list_messages(session_id: str) -> list[MessageResponse]:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [
            MessageResponse(
                id=r["id"], session_id=r["session_id"], role=r["role"],
                content=r["content"], stage=r["stage"],
                metadata=json.loads(r["metadata"] or "{}"), created_at=r["created_at"],
            )
            for r in rows
        ]
    finally:
        await db.close()


@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: str, body: MessageCreate):
    """Send a user message and get an SSE streaming response from the AI orchestrator."""
    db = await get_db()
    try:
        # Get session
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session = await cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        project_id = session["project_id"]
        current_stage = session["current_stage"]
        stage_data = json.loads(session["stage_data"] or "{}")

        # Load engagement template if set on the project
        cursor = await db.execute("SELECT engagement_type FROM projects WHERE id = ?", (project_id,))
        proj_row = await cursor.fetchone()
        engagement_type = proj_row["engagement_type"] if proj_row else None
        engagement_template = get_template(engagement_type) if engagement_type else None

        # Save user message
        user_msg_id = str(uuid.uuid4())
        await db.execute(
            "INSERT INTO messages (id, session_id, role, content, stage) VALUES (?, ?, 'user', ?, ?)",
            (user_msg_id, session_id, body.content, current_stage),
        )
        await db.commit()

        # Get message history
        cursor = await db.execute(
            "SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        )
        history = [dict(r) for r in await cursor.fetchall()]

        # Get uploaded PDF content
        cursor = await db.execute(
            "SELECT filename, extracted_text FROM uploads WHERE project_id = ? AND extracted_text IS NOT NULL",
            (project_id,),
        )
        pdf_rows = await cursor.fetchall()
        pdf_context = "\n\n".join(
            f"## Document: {r['filename']}\n{r['extracted_text'][:15000]}"
            for r in pdf_rows
        ) if pdf_rows else ""

        # Get storyline data if exists
        cursor = await db.execute(
            "SELECT * FROM storylines WHERE project_id = ?", (project_id,),
        )
        storyline_row = await cursor.fetchone()
        storyline_context = dict(storyline_row) if storyline_row else {}
    finally:
        await db.close()

    # Capture flags for use in event_stream closure
    auto_refine = body.auto_refine
    output_tone = body.output_tone
    output_audience = body.output_audience
    output_language = body.output_language
    use_web_search = body.use_web_search
    research_depth = body.research_depth

    # Depth-based max tokens
    # Stage 3 needs more tokens for full slide generation (12-16 slides with charts)
    if current_stage == 3:
        depth_tokens = {"quick": 4096, "standard": 6000, "detailed": 8000, "comprehensive": 10000}
    else:
        depth_tokens = {"quick": 1200, "standard": 2500, "detailed": 4096, "comprehensive": 7000}
    max_tok = depth_tokens.get(research_depth, 2500)

    async def event_stream():
        full_response = ""

        # ── Run search/research INSIDE the stream so user sees immediate response ──
        web_context = ""
        research_brief_context = ""

        # FIX 1: ALWAYS inject persisted research if available (even without web search enabled)
        # This connects the LEFT research panel to CENTER chat — manual research feeds into prompts
        if current_stage >= 2:
            persisted_for_prompt = await get_persisted_research(project_id)
            if persisted_for_prompt and persisted_for_prompt.get("status") == "complete" and persisted_for_prompt.get("research_brief"):
                cached_brief = persisted_for_prompt["research_brief"]
                if isinstance(cached_brief, dict) and "brief" in cached_brief:
                    cached_brief = cached_brief["brief"]
                research_brief_context = format_research_brief_for_prompt(cached_brief)

        use_research_agent = (
            use_web_search
            and current_stage >= 2
            and research_depth in ("detailed", "comprehensive")
        )

        if use_research_agent:
            central_q = stage_data.get("central_question", body.content)
            branches_raw = stage_data.get("branches", "")
            if isinstance(branches_raw, str):
                try:
                    branches_parsed = json.loads(branches_raw)
                except (json.JSONDecodeError, TypeError):
                    branches_parsed = branches_raw
            else:
                branches_parsed = branches_raw

            search_langs = [output_language] if output_language and output_language != "en" else None

            # Check for persisted complete research before running new research
            persisted = await get_persisted_research(project_id)
            if persisted and persisted.get("status") == "complete" and persisted.get("research_brief"):
                # Use cached research instead of re-running
                research_brief = persisted["research_brief"]
                # The brief may be wrapped: {"brief": {...}} or just {...}
                if isinstance(research_brief, dict) and "brief" in research_brief:
                    research_brief = research_brief["brief"]
                research_brief_context = format_research_brief_for_prompt(research_brief)
                yield f"event: research\ndata: {json.dumps({'type': 'research_cached', 'status': 'complete'})}\n\n"
            else:
                # Run fresh research
                yield f"data: {json.dumps({'type': 'text', 'content': ''})}\n\n"  # Start stream immediately
                try:
                    research_brief = None
                    research_plan = None
                    research_sources = []
                    async for event in run_research_agent(
                        question=central_q,
                        audience=stage_data.get("audience", "client"),
                        deck_type=stage_data.get("deck_type", "strategic"),
                        branches=branches_parsed,
                        known_data=pdf_context[:3000] if pdf_context else "",
                        search_languages=search_langs,
                        max_steps=4 if research_depth == "detailed" else 6,
                        research_checklist=engagement_template.research_checklist if engagement_template else None,
                    ):
                        # Stream research progress to frontend
                        yield f"event: research\ndata: {json.dumps(event)}\n\n"
                        if event.get("type") == "plan_done":
                            research_plan = event.get("plan")
                        if event.get("type") == "synthesize_done":
                            research_brief = event.get("brief")

                    if research_brief:
                        research_brief_context = format_research_brief_for_prompt(research_brief)

                        # Persist research results for future reuse
                        data_gaps = []
                        if isinstance(research_brief, dict):
                            for branch in research_brief.get("findings_by_branch", []):
                                data_gaps.extend(branch.get("data_gaps", []))

                        await persist_research_state(
                            project_id=project_id,
                            plan=research_plan,
                            brief={"brief": research_brief},
                            data_gaps=data_gaps,
                            status="complete",
                        )
                except Exception as e:
                    print(f"Research agent failed, falling back to simple search: {e}")
                    use_research_agent = False

        if use_web_search and current_stage >= 2 and not use_research_agent:
            central_q = stage_data.get("central_question", body.content)
            try:
                if current_stage >= 2 and stage_data.get("branches"):
                    branches = stage_data["branches"]
                    if isinstance(branches, str):
                        branches = json.loads(branches)
                    queries = [central_q]
                    for b in branches[:4]:
                        q = b.get("question", "") if isinstance(b, dict) else str(b)
                        if q:
                            queries.append(f"{central_q} {q}")
                    web_results = await multi_query_search(queries, max_results_per_query=4)
                else:
                    web_results = await search_web(central_q, max_results=8)

                if output_language and output_language != "en":
                    lang_results = await multi_lang_search(central_q, languages=[output_language], max_results_per_lang=3)
                    existing_urls = {r["url"] for r in web_results}
                    web_results.extend(r for r in lang_results if r["url"] not in existing_urls)

                web_results = await deep_fetch_results(web_results, max_deep=3)
                web_context = format_web_results(web_results)

                # Persist web search results to research_state.sources so LEFT panel can display them
                if web_results:
                    sources_for_db = [
                        {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("snippet", ""),
                         "quality_score": r.get("quality_score", 0.5), "quality_tier": r.get("quality_tier", "standard"),
                         "deep_content": r.get("deep_content", "")[:500]}
                        for r in web_results
                    ]
                    await persist_research_state(project_id=project_id, sources=sources_for_db)

            except Exception as e:
                print(f"Web search failed: {e}")
                yield f"data: {json.dumps({'type': 'error', 'content': f'Web search failed: {e}. Proceeding without web data.'})}\n\n"

        # Build the stage-specific system prompt
        combined_web_context = web_context
        if research_brief_context:
            combined_web_context = research_brief_context + ("\n\n" + web_context if web_context else "")

        system_prompt = get_stage_prompt(
            stage=current_stage,
            stage_data=stage_data,
            pdf_context=pdf_context,
            storyline_context=storyline_context,
            web_context=combined_web_context,
            output_tone=output_tone,
            engagement_template=engagement_template,
            output_audience=output_audience,
            output_language=output_language,
        )

        # Stream AI response
        try:
            async for token in stream_response(system_prompt, history, stage=current_stage, max_tokens_override=max_tok):
                full_response += token
                yield f"data: {json.dumps({'type': 'text', 'content': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            return

        # Extract structured data from the full response
        structured = extract_structured_data(current_stage, full_response, stage_data)

        # Save assistant message
        db2 = await get_db()
        try:
            asst_msg_id = str(uuid.uuid4())
            await db2.execute(
                "INSERT INTO messages (id, session_id, role, content, stage, metadata) VALUES (?, ?, 'assistant', ?, ?, ?)",
                (asst_msg_id, session_id, full_response, current_stage, json.dumps(structured)),
            )

            # Update stage data
            new_stage_data = {**stage_data, **structured.get("collected_fields", {})}
            new_stage = structured.get("next_stage", current_stage)

            await db2.execute(
                "UPDATE sessions SET stage_data = ?, current_stage = ?, updated_at = datetime('now') WHERE id = ?",
                (json.dumps(new_stage_data), new_stage, session_id),
            )

            # If structured data includes storyline updates, save them
            if structured.get("storyline_update"):
                sl = structured["storyline_update"]
                cursor = await db2.execute(
                    "SELECT id FROM storylines WHERE project_id = ?", (project_id,)
                )
                existing = await cursor.fetchone()
                if existing:
                    sets = ", ".join(f"{k} = ?" for k in sl.keys())
                    vals = list(sl.values()) + [project_id]
                    await db2.execute(
                        f"UPDATE storylines SET {sets}, updated_at = datetime('now') WHERE project_id = ?",
                        vals,
                    )
                else:
                    sl_id = str(uuid.uuid4())
                    await db2.execute(
                        "INSERT INTO storylines (id, project_id) VALUES (?, ?)",
                        (sl_id, project_id),
                    )
                    if sl:
                        sets = ", ".join(f"{k} = ?" for k in sl.keys())
                        vals = list(sl.values()) + [project_id]
                        await db2.execute(
                            f"UPDATE storylines SET {sets} WHERE project_id = ?", vals,
                        )

            # If structured data includes slides, batch-create them
            if structured.get("slides"):
                # Clear existing slides for this project
                await db2.execute("DELETE FROM slides WHERE project_id = ?", (project_id,))
                for i, slide_data in enumerate(structured["slides"]):
                    slide_id = str(uuid.uuid4())
                    slide_type = slide_data.get("slide_type", "content_text")
                    action_title = slide_data.get("action_title", "")
                    await db2.execute(
                        """INSERT INTO slides (id, project_id, position, slide_type, action_title, content_json)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (slide_id, project_id, i, slide_type, action_title, json.dumps(slide_data)),
                    )

            await db2.commit()

            # Emit structured data event
            if structured.get("collected_fields"):
                yield f"event: structured_data\ndata: {json.dumps(structured)}\n\n"

            # Emit slides created event
            if structured.get("slides"):
                yield f"event: slides_created\ndata: {json.dumps({'count': len(structured['slides'])})}\n\n"

            # Emit stage info
            yield f"event: stage_info\ndata: {json.dumps({'stage': new_stage, 'stage_name': STAGE_NAMES.get(new_stage, ''), 'stage_data': new_stage_data})}\n\n"

        finally:
            await db2.close()

        # ── Self-refine loop (if enabled and slides were generated) ──
        if auto_refine and structured.get("slides"):
            slides_json = json.dumps(structured["slides"], indent=2)
            try:
                async for event in self_refine_loop(slides_json, max_passes=2, quality_gate=90):
                    yield f"event: refine\ndata: {json.dumps(event)}\n\n"

                    # If refine produced improved slides, update DB
                    if event.get("type") == "refine_done" and event.get("slides"):
                        db3 = await get_db()
                        try:
                            await db3.execute("DELETE FROM slides WHERE project_id = ?", (project_id,))
                            for i, slide_data in enumerate(event["slides"]):
                                slide_id = str(uuid.uuid4())
                                slide_type = slide_data.get("slide_type", "content_text")
                                action_title = slide_data.get("action_title", "")
                                await db3.execute(
                                    """INSERT INTO slides (id, project_id, position, slide_type, action_title, content_json)
                                       VALUES (?, ?, ?, ?, ?, ?)""",
                                    (slide_id, project_id, i, slide_type, action_title, json.dumps(slide_data)),
                                )
                            await db3.commit()
                            yield f"event: slides_refined\ndata: {json.dumps({'count': len(event['slides'])})}\n\n"
                        finally:
                            await db3.close()
            except Exception as e:
                yield f"event: refine\ndata: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        yield f"event: done\ndata: {{}}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/sessions/{session_id}/stage/advance")
async def advance_stage(session_id: str) -> SessionResponse:
    """Force advance to the next stage."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session = await cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        new_stage = min(session["current_stage"] + 1, 4)
        await db.execute(
            "UPDATE sessions SET current_stage = ?, updated_at = datetime('now') WHERE id = ?",
            (new_stage, session_id),
        )
        await db.commit()

        return SessionResponse(
            id=session_id, project_id=session["project_id"],
            current_stage=new_stage,
            stage_data=json.loads(session["stage_data"] or "{}"),
            created_at=session["created_at"],
        )
    finally:
        await db.close()


@router.post("/sessions/{session_id}/stage/set/{stage}")
async def set_stage(session_id: str, stage: int) -> SessionResponse:
    """Set stage to any value (1-4). Used to go back to a previous stage."""
    if stage < 1 or stage > 4:
        raise HTTPException(status_code=400, detail="Stage must be 1-4")
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session = await cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        await db.execute(
            "UPDATE sessions SET current_stage = ?, updated_at = datetime('now') WHERE id = ?",
            (stage, session_id),
        )
        await db.commit()

        return SessionResponse(
            id=session_id, project_id=session["project_id"],
            current_stage=stage,
            stage_data=json.loads(session["stage_data"] or "{}"),
            created_at=session["created_at"],
        )
    finally:
        await db.close()


@router.put("/sessions/{session_id}/stage-data")
async def update_stage_data(session_id: str, body: dict) -> SessionResponse:
    """Merge a partial dict into the session's stage_data.

    Used after the import-report flow so the user can confirm/edit the
    LLM-inferred fields (central_question, audience, branches, …) before
    starting the chat. Body is a flat dict; keys present in the body
    overwrite existing keys, others are preserved.
    """
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
        session = await cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        current = json.loads(session["stage_data"] or "{}")
        merged = {**current, **(body or {})}

        await db.execute(
            "UPDATE sessions SET stage_data = ?, updated_at = datetime('now') WHERE id = ?",
            (json.dumps(merged), session_id),
        )
        await db.commit()

        return SessionResponse(
            id=session_id, project_id=session["project_id"],
            current_stage=session["current_stage"],
            stage_data=merged,
            created_at=session["created_at"],
        )
    finally:
        await db.close()
