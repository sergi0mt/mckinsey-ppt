"""Unified export dispatcher — routes to the correct generator by format type.

Supported formats:
  - pptx: PowerPoint deck via mckinsey_pptx (deck_service)
  - docx: Word executive memo (McKinsey-styled)
  - markdown: Structured Markdown (export router)
  - transcript: Chat transcript (export router)
"""
from __future__ import annotations
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal

from ..database import get_db
from ..config import get_settings

settings = get_settings()

FormatType = Literal["pptx", "docx", "markdown", "transcript"]


async def _load_project_data(project_id: str) -> dict:
    """Load all export-relevant data for a project."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
        project = await cursor.fetchone()
        if not project:
            raise ValueError(f"Project {project_id} not found")

        cursor = await db.execute("SELECT * FROM storylines WHERE project_id = ?", (project_id,))
        storyline = await cursor.fetchone()

        cursor = await db.execute(
            "SELECT content_json FROM slides WHERE project_id = ? ORDER BY position ASC",
            (project_id,),
        )
        raw_slides = [json.loads(r["content_json"]) for r in await cursor.fetchall()]

        # FIX 6: Normalize slides for DOCX/PDF exports (same as PPTX generation)
        from .deck_service import _pre_normalize_slides
        slides = _pre_normalize_slides(raw_slides)

        # Research brief (if available)
        cursor = await db.execute(
            "SELECT research_brief FROM research_state WHERE project_id = ?", (project_id,),
        )
        research_row = await cursor.fetchone()
        research_brief = None
        if research_row and research_row["research_brief"]:
            try:
                research_brief = json.loads(research_row["research_brief"])
            except (json.JSONDecodeError, TypeError):
                pass

        return {
            "project": dict(project),
            "storyline": dict(storyline) if storyline else None,
            "slides": slides,
            "research_brief": research_brief,
        }
    finally:
        await db.close()


async def _record_deliverable(
    project_id: str, format_type: str, filepath: str, filename: str, metadata: dict | None = None,
) -> dict:
    """Record a generated deliverable in the DB."""
    db = await get_db()
    try:
        row_id = str(uuid.uuid4())
        await db.execute(
            """INSERT INTO deliverables (id, project_id, format_type, filepath, filename, status, metadata)
               VALUES (?, ?, ?, ?, ?, 'completed', ?)""",
            (row_id, project_id, format_type, filepath, filename, json.dumps(metadata or {})),
        )
        await db.commit()
        return {"id": row_id, "format_type": format_type, "filename": filename, "filepath": filepath}
    finally:
        await db.close()


async def export_project(project_id: str, format_type: FormatType) -> dict:
    """Generate an export in the requested format. Returns deliverable metadata."""
    data = await _load_project_data(project_id)
    output_dir = Path(settings.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if format_type == "pptx":
        from .deck_service import generate_pptx
        slides_data = data["slides"]
        filepath, report = generate_pptx(
            slides_data=slides_data,
            title=data["project"]["name"],
            output_dir=output_dir,
            project_id=project_id,
        )
        return await _record_deliverable(
            project_id, "pptx", str(filepath), filepath.name,
            {"validation_score": report.score},
        )

    elif format_type == "docx":
        from .docx_generator import generate_executive_memo
        filename = f"memo_{project_id[:8]}_{timestamp}.docx"
        filepath = output_dir / filename
        generate_executive_memo(data, str(filepath))
        return await _record_deliverable(project_id, "docx", str(filepath), filename)

    else:
        raise ValueError(f"Unsupported export format: {format_type}")


async def list_deliverables(project_id: str) -> list[dict]:
    """List all generated deliverables for a project."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM deliverables WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()
