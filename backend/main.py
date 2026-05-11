"""MECE PPT — FastAPI backend.

Third pillar of the trio (mece-prompt-builder → deepresearch → mckinsey-ppt).
Imports a deepresearch report and produces a McKinsey-style deck via Stage 3+4
of the original engagement-manager orchestrator.
"""
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure mckinsey_pptx is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from .config import get_settings
from .database import init_db
from .routers import (
    projects, uploads, chat, slides, decks, validation,
    export, templates, sharpen, import_report, deepresearch_decks,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.output_dir).mkdir(parents=True, exist_ok=True)
    await init_db()
    print(f"MECE PPT API ready — {settings.environment}")
    yield
    print("Shutting down")


app = FastAPI(
    title="MECE PPT API",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/v1")
app.include_router(uploads.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(slides.router, prefix="/api/v1")
app.include_router(decks.router, prefix="/api/v1")
app.include_router(validation.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1")
app.include_router(templates.router, prefix="/api/v1")
app.include_router(sharpen.router, prefix="/api/v1")
app.include_router(import_report.router, prefix="/api/v1")
app.include_router(deepresearch_decks.router, prefix="/api/v1")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "service": "mckinsey-ppt"}


@app.get("/api/v1/costs")
async def get_costs():
    """Get accumulated LLM cost tracking for this session."""
    from .services.ai_service import get_cost_tracker
    return get_cost_tracker().summary()
