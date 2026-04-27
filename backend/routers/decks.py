"""Deck generation and download router."""
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..database import get_db
from ..config import get_settings
from ..services.deck_service import generate_pptx
from ..models.api_models import DeckResponse

router = APIRouter(tags=["decks"])
settings = get_settings()


@router.post("/projects/{project_id}/generate")
async def generate_deck(project_id: str) -> DeckResponse:
    """Generate a .pptx file from the project's current slides."""
    db = await get_db()
    try:
        # Get project info
        cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
        project = await cursor.fetchone()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get all slides ordered by position
        cursor = await db.execute(
            "SELECT content_json FROM slides WHERE project_id = ? ORDER BY position ASC",
            (project_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            raise HTTPException(status_code=400, detail="No slides to generate")

        slides_data = [json.loads(r["content_json"]) for r in rows]

        # Generate the .pptx
        filepath, report = generate_pptx(
            slides_data=slides_data,
            title=project["name"],
            output_dir=Path(settings.output_dir) / project_id,
            project_id=project_id,
        )

        # Save deck record
        deck_id = str(uuid.uuid4())
        validation_report = {
            "score": report.score,
            "passed": report.passed,
            "errors": [{"rule": i.rule, "message": i.message, "slide_index": i.slide_index}
                       for i in report.errors],
            "warnings": [{"rule": i.rule, "message": i.message, "slide_index": i.slide_index}
                         for i in report.warnings],
        }

        await db.execute(
            """INSERT INTO decks (id, project_id, filepath, filename, validation_score, validation_report)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (deck_id, project_id, str(filepath), filepath.name, report.score,
             json.dumps(validation_report)),
        )
        await db.commit()

        return DeckResponse(
            id=deck_id, project_id=project_id, filename=filepath.name,
            validation_score=report.score, validation_report=validation_report,
            generated_at="",
        )
    finally:
        await db.close()


@router.get("/decks/{deck_id}/download")
async def download_deck(deck_id: str):
    """Download a generated .pptx file."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM decks WHERE id = ?", (deck_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Deck not found")

        filepath = Path(row["filepath"])
        if not filepath.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")

        return FileResponse(
            path=str(filepath),
            filename=row["filename"],
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
    finally:
        await db.close()


@router.get("/projects/{project_id}/decks")
async def list_decks(project_id: str) -> list[DeckResponse]:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM decks WHERE project_id = ? ORDER BY generated_at DESC",
            (project_id,),
        )
        rows = await cursor.fetchall()
        return [
            DeckResponse(
                id=r["id"], project_id=r["project_id"], filename=r["filename"],
                validation_score=r["validation_score"],
                validation_report=json.loads(r["validation_report"] or "{}"),
                generated_at=r["generated_at"],
            )
            for r in rows
        ]
    finally:
        await db.close()
