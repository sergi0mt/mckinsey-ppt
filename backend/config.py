"""Backend configuration — loads from environment or .env file.

Path resolution honors Railway's persistent-volume convention: when
`RAILWAY_VOLUME_MOUNT_PATH` is set (e.g. `/data`), the SQLite database,
uploads, and exports all live under that mount so they survive deploys
and container restarts. Locally the paths fall back to the repo tree.
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

_ROOT = Path(__file__).parent.parent  # repo root

# Railway injects RAILWAY_VOLUME_MOUNT_PATH for the attached volume.
# In dev it's unset, so we keep the existing local paths under the repo.
_VOLUME = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", "").strip()
_DATA_BASE = Path(_VOLUME) if _VOLUME else _ROOT / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ROOT / ".env"),
        extra="ignore",
    )

    # LLM — OpenRouter (same as deepresearch app)
    openrouter_api_key: str = ""

    # Model routing — 3-tier system
    #   fast:     plan generation, classification — needs speed + instruction following
    #   balanced: research steps, MECE structuring — needs reasoning
    #   powerful: slide generation, critique, refine — needs best structured output quality
    model_fast: str = "deepseek/deepseek-v3.2"                   # $0.38/M — stage 1: problem definition
    model_balanced: str = "google/gemini-2.5-flash"               # $2.50/M — stage 2: MECE, research
    model_powerful: str = "google/gemini-3.1-pro-preview"         # $12.0/M — stage 3: slides + critique + refine (latest Gemini Pro)
    max_tokens: int = 4096

    # Web search (same as deepresearch)
    tavily_api_key: str = ""
    brave_api_key: str = ""
    search_provider: str = "auto"  # "brave" | "tavily" | "auto"

    # Database — under the Railway volume in prod, under backend/data locally.
    database_path: str = str(_DATA_BASE / "data" / "mckinsey_ppt.db")

    # File storage — same volume-aware logic. Output stays at repo level
    # locally to keep dev artifacts visible; on Railway it lives on the volume.
    upload_dir: str = str(_DATA_BASE / "uploads")
    output_dir: str = str((Path(_VOLUME) / "output") if _VOLUME else (_ROOT / "output"))

    # mckinsey_pptx library path — the calibrated library lives in the repo,
    # not on the volume.
    library_path: str = str(_ROOT)

    # Server — Railway injects PORT; binding to 0.0.0.0 is required.
    host: str = "0.0.0.0"
    port: int = int(os.environ.get("PORT", "8000"))
    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
