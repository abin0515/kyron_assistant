CREATE TABLE IF NOT EXISTS draft_workspaces (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'editing'
    CHECK (status IN ('editing', 'submitting', 'submitted', 'error')),
  status_message TEXT NOT NULL DEFAULT '',
  source_text TEXT NOT NULL DEFAULT ''
    CHECK (CHAR_LENGTH(source_text) <= 50000),
  name TEXT NOT NULL DEFAULT 'Untitled draft'
    CHECK (CHAR_LENGTH(name) <= 200),
  description TEXT NOT NULL DEFAULT ''
    CHECK (CHAR_LENGTH(description) <= 4000),
  learning_objective TEXT NOT NULL DEFAULT ''
    CHECK (CHAR_LENGTH(learning_objective) <= 2000),
  audience TEXT NOT NULL DEFAULT ''
    CHECK (CHAR_LENGTH(audience) <= 1000),
  asset_type TEXT NOT NULL DEFAULT 'lesson'
    CHECK (asset_type IN ('lesson', 'practice', 'scenario')),
  duration_seconds INTEGER NOT NULL DEFAULT 480
    CHECK (duration_seconds IN (480, 900, 1800, 3600)),
  kyron_draft_id BIGINT UNIQUE
    REFERENCES drafts(kyron_draft_id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
