CREATE UNIQUE INDEX IF NOT EXISTS workspace_source_files_one_kyron_attachment_idx
ON workspace_source_files (workspace_id)
WHERE usage = 'kyron_attachment';
