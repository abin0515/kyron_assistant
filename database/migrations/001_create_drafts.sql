CREATE TABLE IF NOT EXISTS drafts (
  kyron_draft_id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'done', 'error')),
  status_message TEXT NOT NULL,
  preview_url TEXT NOT NULL,
  editor_url TEXT NOT NULL,
  kyron_created_at TIMESTAMPTZ NOT NULL,
  kyron_updated_at TIMESTAMPTZ NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
