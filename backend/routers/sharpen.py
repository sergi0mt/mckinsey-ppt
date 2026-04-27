"""Sharpen router — POST /api/v1/projects/{id}/sharpen.

Returns a {before, after, rationale} preview without mutating any state.
The frontend decides whether to commit the suggestion via the existing
slides / sessions / research update endpoints.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..database import get_db
from ..services import sharpen as sharpen_svc
from ..services.research_agent import get_persisted_research

router = APIRouter(tags=["sharpen"])


class SharpenRequest(BaseModel):
    target: str = Field(
        ...,
        description='One of "action_title" | "chart" | "citation" | "briefing_field" | "slide_full"',
    )
    slide_id: Optional[str] = None
    field: Optional[str] = None
    options: Optional[dict[str, Any]] = None


class SharpenResponse(BaseModel):
    target: str
    before: Any
    after: Any
    rationale: str
    field: Optional[str] = None


VALID_TARGETS = {"action_title", "chart", "citation", "briefing_field", "slide_full"}
VALID_FIELDS = {
    "central_question",
    "desired_decision",
    "situation",
    "complication",
    "resolution",
}


@router.post("/projects/{project_id}/sharpen", response_model=SharpenResponse)
async def sharpen(project_id: str, body: SharpenRequest) -> SharpenResponse:
    if body.target not in VALID_TARGETS:
        raise HTTPException(
            status_code=400,
            detail=f'Invalid target "{body.target}" — expected one of {sorted(VALID_TARGETS)}',
        )

    project = await _load_project(project_id)
    options = body.options or {}

    if body.target == "action_title":
        slide = await _require_slide(body.slide_id, project_id)
        target_words = int(options.get("target_words", 9) or 9)
        result = await sharpen_svc.sharpen_action_title(slide, project, target_words=target_words)

    elif body.target == "chart":
        slide = await _require_slide(body.slide_id, project_id)
        requested = options.get("requested_chart_type")
        result = await sharpen_svc.sharpen_chart(slide, project, requested_type=requested)

    elif body.target == "citation":
        slide = await _require_slide(body.slide_id, project_id)
        brief = await _load_research_brief(project_id)
        result = await sharpen_svc.sharpen_citation(slide, project, research_brief=brief)

    elif body.target == "slide_full":
        slide = await _require_slide(body.slide_id, project_id)
        brief = await _load_research_brief(project_id)
        result = await sharpen_svc.sharpen_slide_full(slide, project, research_brief=brief)

    elif body.target == "briefing_field":
        if not body.field or body.field not in VALID_FIELDS:
            raise HTTPException(
                status_code=400,
                detail=f'briefing_field requires field ∈ {sorted(VALID_FIELDS)}',
            )
        stage_data = await _load_session_data(project_id)
        current_value = options.get("current_value") or stage_data.get(body.field) or ""
        if not isinstance(current_value, str):
            current_value = str(current_value)
        result = await sharpen_svc.sharpen_briefing_field(
            project=project,
            session_stage_data=stage_data,
            field=body.field,
            current_value=current_value,
        )

    else:  # pragma: no cover — guarded by VALID_TARGETS check
        raise HTTPException(status_code=400, detail="Unhandled target")

    return SharpenResponse(**result)


# ────────────────────────────────────────────────────────────────
# Internal loaders
# ────────────────────────────────────────────────────────────────

async def _load_project(project_id: str) -> dict:
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        return dict(row)
    finally:
        await db.close()


async def _load_session_data(project_id: str) -> dict:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT stage_data FROM sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
            (project_id,),
        )
        row = await cursor.fetchone()
        if not row:
            return {}
        try:
            return json.loads(row["stage_data"] or "{}")
        except json.JSONDecodeError:
            return {}
    finally:
        await db.close()


async def _load_slide(slide_id: str, project_id: str) -> dict | None:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM slides WHERE id = ? AND project_id = ?",
            (slide_id, project_id),
        )
        row = await cursor.fetchone()
        if not row:
            return None
        slide = dict(row)
        slide["content_json"] = json.loads(slide.get("content_json") or "{}")
        return slide
    finally:
        await db.close()


async def _require_slide(slide_id: str | None, project_id: str) -> dict:
    if not slide_id:
        raise HTTPException(status_code=400, detail="slide_id is required for this target")
    slide = await _load_slide(slide_id, project_id)
    if not slide:
        raise HTTPException(status_code=404, detail="Slide not found in this project")
    return slide


async def _load_research_brief(project_id: str) -> dict | None:
    state = await get_persisted_research(project_id)
    if not state:
        return None
    brief = state.get("research_brief")
    if isinstance(brief, dict):
        return brief
    return None
