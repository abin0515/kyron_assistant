CREATE UNIQUE INDEX IF NOT EXISTS source_file_uploads_pending_owner_name_idx
ON source_file_uploads (created_by_id, normalized_name)
WHERE status = 'pending';
