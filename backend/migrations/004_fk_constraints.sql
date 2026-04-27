-- Add cascading delete triggers for tables missing FK constraints
-- SQLite doesn't support ALTER TABLE ADD FOREIGN KEY, so we use triggers

-- Clean up orphaned records on project delete
CREATE TRIGGER IF NOT EXISTS cleanup_research_state_on_project_delete
AFTER DELETE ON projects
FOR EACH ROW
BEGIN
    DELETE FROM research_state WHERE project_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS cleanup_deliverables_on_project_delete
AFTER DELETE ON projects
FOR EACH ROW
BEGIN
    DELETE FROM deliverables WHERE project_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS cleanup_briefing_runs_on_project_delete
AFTER DELETE ON projects
FOR EACH ROW
BEGIN
    DELETE FROM briefing_runs WHERE project_id = OLD.id;
END;
