"""Import a deepresearch report and bootstrap a project at Stage 3.

This is the entry point of mckinsey-ppt. It replaces the chat-driven Stage 1+2
of the original engagement-manager: the user already did that work in
mece-prompt-builder + deepresearch, and now hands us the finished report.

Flow:
  1. Receive .md/.pdf/.docx upload
  2. Parse → ParsedReport (title, sections, branches, refs)
  3. Infer Stage 1+2 metadata via gemini-3.1-pro (~$0.007)
  4. Atomic DB transaction:
       - INSERT projects
       - INSERT uploads (extracted_text = full report)
       - INSERT sessions (current_stage=3, stage_data prepopulated)
  5. Return { project_id, session_id, inferred }
"""
import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from ..config import get_settings
from ..database import get_db
from ..services.report_parser import parse_report
from ..services.metadata_inferrer import infer_metadata, to_dict as infer_to_dict

router = APIRouter(tags=["import"])
settings = get_settings()

_ALLOWED_EXTS = {".md", ".markdown", ".pdf", ".docx", ".txt"}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


@router.post("/projects/import-report")
async def import_report(file: UploadFile = File(...)):
    """Receive a research report, infer metadata, and create a Stage-3 session."""
    filename = file.filename or "report.md"
    ext = Path(filename).suffix.lower()
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type {ext}. Use .md, .pdf, .docx, or .txt",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(content) > _MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) / 1024 / 1024:.1f} MB). Max 10 MB.",
        )

    # 1. Parse
    try:
        report = parse_report(filename, content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse report: {e}")

    # 2. Infer (LLM call — may take 5-15s)
    inferred = await infer_metadata(report)

    # 3. Persist (atomic via single connection)
    project_id = str(uuid.uuid4())
    upload_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())

    # Save the original report to disk (uploads/)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    safe_name = f"{upload_id}_{Path(filename).name}"
    upload_path = Path(settings.upload_dir) / safe_name
    upload_path.write_bytes(content)

    stage_data = {
        "central_question": inferred.central_question,
        "audience": inferred.audience,
        "deck_type": inferred.deck_type,
        "desired_decision": inferred.desired_decision,
        "hypothesis": inferred.hypothesis,
        "branches": json.dumps(inferred.branches, ensure_ascii=False),
        "mece_template": inferred.engagement_template_id or "generic",
        "output_language": inferred.output_language,
        # Stage 1+2 are conceptually complete — these flags help the UI render
        "imported_from_report": True,
        "report_title": report.title,
        "report_word_count": report.word_count,
    }

    db = await get_db()
    try:
        # projects
        await db.execute(
            """INSERT INTO projects (id, name, description, audience, deck_type, engagement_type, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))""",
            (
                project_id,
                report.title,
                f"Imported from deepresearch ({report.word_count} words)",
                inferred.audience,
                inferred.deck_type,
                inferred.engagement_template_id,
            ),
        )
        # uploads (extracted_text = full report markdown for chat pdf_context)
        await db.execute(
            """INSERT INTO uploads (id, project_id, filename, filepath, file_size, content_type, extracted_text, extracted_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))""",
            (
                upload_id,
                project_id,
                filename,
                str(upload_path),
                len(content),
                file.content_type or "text/markdown",
                report.full_text,
            ),
        )
        # sessions (start at stage 3 — Storyline + Slides)
        await db.execute(
            """INSERT INTO sessions (id, project_id, current_stage, stage_data)
               VALUES (?, ?, 3, ?)""",
            (session_id, project_id, json.dumps(stage_data, ensure_ascii=False)),
        )
        await db.commit()
    except Exception as e:
        # Best-effort cleanup of the file we wrote
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"DB persistence failed: {e}")
    finally:
        await db.close()

    return {
        "project_id": project_id,
        "session_id": session_id,
        "upload_id": upload_id,
        "inferred": infer_to_dict(inferred),
        "branches_detected_count": len(inferred.branches),
        "report_word_count": report.word_count,
        "report_references_count": len(report.references),
        "created_at": datetime.utcnow().isoformat(),
    }
