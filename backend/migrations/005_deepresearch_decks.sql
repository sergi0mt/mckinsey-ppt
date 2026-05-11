-- Deepresearch-style decks generated from a parsed report.
-- One deck per project (latest overwrites prior generation). Slides are stored
-- as JSON to avoid pinning the schema to a specific layout set — the layout
-- vocabulary can grow without migration churn.

CREATE TABLE IF NOT EXISTS deepresearch_decks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    slides_json TEXT NOT NULL,             -- list of Slide objects
    options_json TEXT NOT NULL,            -- frozen PresentationOptions for reproducibility
    palette_json TEXT NOT NULL,            -- resolved palette dict at generation time
    presentation_prompt_md TEXT DEFAULT '', -- exportable markdown design brief
    image_provider TEXT,                   -- "none" | "pexels" | "unsplash" | "ai"
    generated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deepresearch_decks_project
    ON deepresearch_decks(project_id, generated_at DESC);
