CREATE INDEX IF NOT EXISTS qa_runs_pending_idx
ON qa_runs (record_updated_at)
WHERE has_pending_steps;
