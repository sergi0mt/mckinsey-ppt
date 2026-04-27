-- Briefing runs — tracks autonomous "Brief Me" pipeline executions
CREATE TABLE IF NOT EXISTS briefing_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    current_step TEXT DEFAULT 'plan',
    progress_pct INTEGER DEFAULT 0,
    steps_completed TEXT DEFAULT '[]',
    result TEXT DEFAULT '{}',
    error TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
