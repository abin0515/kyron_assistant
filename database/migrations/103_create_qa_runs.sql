CREATE TABLE IF NOT EXISTS qa_runs (
  id UUID PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES qa_lessons(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES draft_workspaces(id) ON DELETE CASCADE,
  target TEXT NOT NULL CHECK (target IN ('course_setup', 'lesson')),
  stage TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  has_pending_steps BOOLEAN NOT NULL DEFAULT FALSE,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL CHECK (JSONB_TYPEOF(data) = 'object'),
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
