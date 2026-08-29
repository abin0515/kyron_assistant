CREATE INDEX IF NOT EXISTS drafts_owner_generating_sync_idx
ON drafts (created_by_id, kyron_checked_at ASC NULLS FIRST)
WHERE kyron_availability <> 'unavailable' AND status = 'started';
