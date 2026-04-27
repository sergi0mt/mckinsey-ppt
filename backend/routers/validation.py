"""Validation router — McKinsey adherence scoring."""
import json
from fastapi import APIRouter, HTTPException
from ..database import get_db
from ..services.deck_service import validate_project_slides
from ..models.api_models import ValidationResponse

router = APIRouter(tags=["validation"])


@router.get("/projects/{project_id}/validate")
async def validate_project(project_id: str) -> ValidationResponse:
    """Run all McKinsey validators on the project's current slides."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT content_json FROM slides WHERE project_id = ? ORDER BY position ASC",
            (project_id,),
        )
        rows = await cursor.fetchall()
        if not rows:
            return ValidationResponse(
                score=0, passed=False, errors=[], warnings=[],
                summary="No slides to validate",
            )

        slides_data = [json.loads(r["content_json"]) for r in rows]
        result = validate_project_slides(slides_data)

        return ValidationResponse(**result)
    finally:
        await db.close()
