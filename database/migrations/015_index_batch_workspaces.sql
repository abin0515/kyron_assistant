CREATE INDEX IF NOT EXISTS draft_workspaces_batch_updated_idx
ON draft_workspaces (batch_id, record_updated_at DESC)
WHERE batch_id IS NOT NULL;
