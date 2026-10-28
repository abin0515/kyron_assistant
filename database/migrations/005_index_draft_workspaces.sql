CREATE INDEX IF NOT EXISTS draft_workspaces_owner_updated_idx
ON draft_workspaces (created_by_id, record_updated_at DESC);
