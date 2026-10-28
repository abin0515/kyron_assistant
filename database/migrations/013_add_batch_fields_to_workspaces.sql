ALTER TABLE draft_workspaces
ADD COLUMN IF NOT EXISTS batch_id UUID
  REFERENCES draft_batches(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS setup_status TEXT NOT NULL DEFAULT 'manual'
  CHECK (setup_status IN (
    'manual',
    'pending',
    'generating',
    'needs_review',
    'reviewed',
    'error'
  )),
ADD COLUMN IF NOT EXISTS setup_status_message TEXT NOT NULL DEFAULT '';
