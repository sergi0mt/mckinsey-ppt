"""Export router — Markdown, transcript, DOCX memo, PDF one-pager, and multi-format export."""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse, FileResponse
from pydantic import BaseModel
from ..database import get_db

router = APIRouter(prefix="/export", tags=["export"])


# ── New: Multi-format export ──

class ExportRequest(BaseModel):
    format_type: str  # "pptx" | "docx" | "pdf_onepager"


@router.post("/projects/{project_id}/export")
async def export_project(project_id: str, req: ExportRequest):
    """Generate an export in the requested format. Returns deliverable metadata."""
    from ..services.export_service import export_project as do_export
    try:
        result = await do_export(project_id, req.format_type)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")


@router.get("/projects/{project_id}/deliverables")
async def list_deliverables(project_id: str):
    """List all generated deliverables for a project."""
    from ..services.export_service import list_deliverables as do_list
    return await do_list(project_id)


@router.get("/deliverables/{deliverable_id}/download")
async def download_deliverable(deliverable_id: str):
    """Download a generated deliverable file."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM deliverables WHERE id = ?", (deliverable_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Deliverable not found")

        filepath = Path(row["filepath"])
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")

        # Determine media type
        media_types = {
            "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "pdf_onepager": "application/pdf",
        }
        media_type = media_types.get(row["format_type"], "application/octet-stream")

        return FileResponse(
            str(filepath),
            media_type=media_type,
            filename=row["filename"],
        )
    finally:
        await db.close()


# ── Existing: Markdown export ──

@router.get("/projects/{project_id}/markdown")
async def export_markdown(project_id: str):
    """Export the current slides as a structured Markdown document."""
    db = await get_db()
    try:
        # Get project
        cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
        project = await cursor.fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get storyline
        cursor = await db.execute("SELECT * FROM storylines WHERE project_id = ?", (project_id,))
        storyline = await cursor.fetchone()

        # Get slides
        cursor = await db.execute(
            "SELECT content_json FROM slides WHERE project_id = ? ORDER BY position ASC",
            (project_id,),
        )
        slides = [json.loads(r["content_json"]) for r in await cursor.fetchall()]

        md = _build_markdown(project, storyline, slides)
        return PlainTextResponse(md, media_type="text/markdown", headers={
            "Content-Disposition": f"attachment; filename={project['name'].replace(' ', '_')}.md"
        })
    finally:
        await db.close()


@router.get("/projects/{project_id}/transcript")
async def export_transcript(project_id: str):
    """Export the chat transcript as Markdown."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
        project = await cursor.fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        cursor = await db.execute(
            """SELECT m.* FROM messages m
               JOIN sessions s ON m.session_id = s.id
               WHERE s.project_id = ?
               ORDER BY m.created_at ASC""",
            (project_id,),
        )
        messages = await cursor.fetchall()

        lines = [f"# Chat Transcript: {project['name']}\n"]
        for msg in messages:
            role = "User" if msg["role"] == "user" else "AI Consultant"
            lines.append(f"\n## {role} (Stage {msg['stage'] or '?'})\n")
            lines.append(msg["content"])
            lines.append("")

        return PlainTextResponse("\n".join(lines), media_type="text/markdown", headers={
            "Content-Disposition": f"attachment; filename=transcript_{project['name'].replace(' ', '_')}.md"
        })
    finally:
        await db.close()


def _build_markdown(project: dict, storyline, slides: list[dict]) -> str:
    """Build a structured Markdown document from slides."""
    lines = [f"# {project['name']}\n"]

    if storyline:
        lines.append("## Executive Summary\n")
        lines.append(f"**Situation:** {storyline['situation'] or ''}\n")
        lines.append(f"**Complication:** {storyline['complication'] or ''}\n")
        lines.append(f"**Resolution:** {storyline['resolution'] or ''}\n")
        if storyline.get("key_recommendation"):
            lines.append(f"\n**Key Recommendation:** {storyline['key_recommendation']}\n")
        lines.append("---\n")

    for i, slide in enumerate(slides):
        slide_type = slide.get("slide_type", "")
        title = slide.get("action_title", "")

        if slide_type == "title":
            lines.append(f"# {title}\n")
            if slide.get("subtitle"):
                lines.append(f"*{slide['subtitle']}*\n")
        elif slide_type == "divider":
            num = slide.get("section_number", "")
            lines.append(f"\n---\n\n## {num}. {title}\n" if num else f"\n---\n\n## {title}\n")
        elif slide_type == "executive_summary":
            lines.append(f"### {title}\n")
            if slide.get("situation_text"):
                lines.append(f"**Situation:** {slide['situation_text']}\n")
            if slide.get("complication_text"):
                lines.append(f"**Complication:** {slide['complication_text']}\n")
            if slide.get("resolution_text"):
                lines.append(f"**Resolution:** {slide['resolution_text']}\n")
        elif slide_type in ("content_text", "content_hybrid", "recommendation"):
            lines.append(f"### {title}\n")
            bullets = slide.get("bullets", [])
            for b in bullets:
                if isinstance(b, dict):
                    prefix = f"**{b.get('bold_prefix', '')}** " if b.get('bold_prefix') else ""
                    lines.append(f"- {prefix}{b.get('text', '')}")
                else:
                    lines.append(f"- {b}")
            lines.append("")
        elif slide_type == "content_chart":
            lines.append(f"### {title}\n")
            chart = slide.get("chart", {})
            if chart:
                lines.append(f"*Chart type: {chart.get('chart_type', '')}*")
                if chart.get("source"):
                    lines.append(f"*Source: {chart['source']}*")
                if chart.get("so_what"):
                    lines.append(f"\n> **Key insight:** {chart['so_what']}")
            lines.append("")
        elif slide_type == "next_steps":
            lines.append(f"### {title}\n")
            items = slide.get("action_items", slide.get("bullets", []))
            for item in items:
                if isinstance(item, dict) and "action" in item:
                    lines.append(f"- [ ] **{item['action']}** | Owner: {item.get('owner', '')} | Timeline: {item.get('timeline', '')}")
                elif isinstance(item, dict):
                    lines.append(f"- {item.get('text', str(item))}")
                else:
                    lines.append(f"- {item}")
            lines.append("")
        elif slide_type == "agenda":
            lines.append(f"### {title}\n")
            for item in slide.get("agenda_items", slide.get("bullets", [])):
                if isinstance(item, str):
                    lines.append(f"1. {item}")
                elif isinstance(item, dict):
                    lines.append(f"1. {item.get('text', str(item))}")
            lines.append("")

    return "\n".join(lines)
