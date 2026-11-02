-- QA agent records. Lessons, snapshots and runs keep their full document in
-- JSONB; indexed columns hold what queries filter on. Numbered from 100 so
-- they cannot collide with other branches' migrations.

CREATE TABLE IF NOT EXISTS qa_lessons (
  id UUID PRIMARY KEY,
  workspace_id UUID UNIQUE
    REFERENCES draft_workspaces(id) ON DELETE CASCADE,
  kyron_draft_id BIGINT,
  domain TEXT NOT NULL CHECK (domain IN ('cpe', 'hs-ai')),
  owner_id TEXT NOT NULL,
  data JSONB NOT NULL CHECK (JSONB_TYPEOF(data) = 'object'),
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
