CREATE INDEX IF NOT EXISTS draft_batches_owner_updated_idx
ON draft_batches (created_by_id, record_updated_at DESC);
