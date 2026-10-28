CREATE INDEX IF NOT EXISTS source_files_owner_created_idx
ON source_files (created_by_id, record_created_at DESC);
