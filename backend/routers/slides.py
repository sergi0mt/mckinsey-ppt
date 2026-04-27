"""Slides CRUD + reorder router."""
import json
import uuid
from fastapi import APIRouter, HTTPException
from ..database import get_db
from ..models.api_models import SlideResponse, SlideUpdate, SlideReorderRequest

router = APIRouter(tags=["slides"])


@router.get("/projects/{project_id}/slides")
async def list_slides(project_id: str) -> list[SlideResponse]:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM slides WHERE project_id = ? ORDER BY position ASC",
            (project_id,),
        )
        rows = await cursor.fetchall()
        return [
            SlideResponse(
                id=r["id"], project_id=r["project_id"], position=r["position"],
                slide_type=r["slide_type"], action_title=r["action_title"],
                content_json=json.loads(r["content_json"] or "{}"),
                is_appendix=bool(r["is_appendix"]),
                preview_image=r["preview_image"],
                created_at=r["created_at"],
            )
            for r in rows
        ]
    finally:
        await db.close()


@router.post("/projects/{project_id}/slides", status_code=201)
async def create_slide(project_id: str, body: dict) -> SlideResponse:
    db = await get_db()
    try:
        # Get next position
        cursor = await db.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM slides WHERE project_id = ?",
            (project_id,),
        )
        row = await cursor.fetchone()
        position = row["next_pos"]

        slide_id = str(uuid.uuid4())
        slide_type = body.get("slide_type", "content_text")
        action_title = body.get("action_title", "")
        content_json = json.dumps(body)

        await db.execute(
            """INSERT INTO slides (id, project_id, position, slide_type, action_title, content_json)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (slide_id, project_id, position, slide_type, action_title, content_json),
        )
        await db.commit()

        return SlideResponse(
            id=slide_id, project_id=project_id, position=position,
            slide_type=slide_type, action_title=action_title,
            content_json=body, created_at="",
        )
    finally:
        await db.close()


@router.post("/projects/{project_id}/slides/batch", status_code=201)
async def create_slides_batch(project_id: str, body: list[dict]) -> list[SlideResponse]:
    """Create multiple slides at once (used after Stage 3 generates the slide sequence)."""
    db = await get_db()
    try:
        # Clear existing slides for this project
        await db.execute("DELETE FROM slides WHERE project_id = ?", (project_id,))

        results = []
        for i, slide_data in enumerate(body):
            slide_id = str(uuid.uuid4())
            slide_type = slide_data.get("slide_type", "content_text")
            action_title = slide_data.get("action_title", "")
            content_json = json.dumps(slide_data)

            await db.execute(
                """INSERT INTO slides (id, project_id, position, slide_type, action_title, content_json)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (slide_id, project_id, i, slide_type, action_title, content_json),
            )
            results.append(SlideResponse(
                id=slide_id, project_id=project_id, position=i,
                slide_type=slide_type, action_title=action_title,
                content_json=slide_data, created_at="",
            ))

        await db.commit()
        return results
    finally:
        await db.close()


@router.put("/slides/{slide_id}")
async def update_slide(slide_id: str, body: SlideUpdate) -> SlideResponse:
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM slides WHERE id = ?", (slide_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Slide not found")

        current_json = json.loads(row["content_json"] or "{}")

        if body.action_title is not None:
            current_json["action_title"] = body.action_title
        if body.content_json is not None:
            current_json.update(body.content_json)
        if body.slide_type is not None:
            current_json["slide_type"] = body.slide_type

        action_title = current_json.get("action_title", row["action_title"])
        slide_type = current_json.get("slide_type", row["slide_type"])

        await db.execute(
            """UPDATE slides SET action_title = ?, slide_type = ?, content_json = ?,
               updated_at = datetime('now') WHERE id = ?""",
            (action_title, slide_type, json.dumps(current_json), slide_id),
        )
        await db.commit()

        return SlideResponse(
            id=slide_id, project_id=row["project_id"], position=row["position"],
            slide_type=slide_type, action_title=action_title,
            content_json=current_json, created_at=row["created_at"],
        )
    finally:
        await db.close()


@router.put("/projects/{project_id}/slides/reorder")
async def reorder_slides(project_id: str, body: SlideReorderRequest):
    db = await get_db()
    try:
        for i, slide_id in enumerate(body.slide_ids):
            await db.execute(
                "UPDATE slides SET position = ? WHERE id = ? AND project_id = ?",
                (i, slide_id, project_id),
            )
        await db.commit()
        return {"reordered": len(body.slide_ids)}
    finally:
        await db.close()


@router.delete("/slides/{slide_id}", status_code=204)
async def delete_slide(slide_id: str):
    db = await get_db()
    try:
        await db.execute("DELETE FROM slides WHERE id = ?", (slide_id,))
        await db.commit()
    finally:
        await db.close()
