CREATE INDEX IF NOT EXISTS qa_runs_workspace_target_idx
ON qa_runs (workspace_id, target, record_created_at DESC);
