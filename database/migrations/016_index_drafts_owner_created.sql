CREATE INDEX IF NOT EXISTS drafts_owner_created_idx
ON drafts (created_by_id, record_created_at DESC);
