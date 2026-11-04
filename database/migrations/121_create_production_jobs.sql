CREATE TABLE IF NOT EXISTS production_jobs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL UNIQUE REFERENCES draft_workspaces(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  data JSONB NOT NULL CHECK (JSONB_TYPEOF(data) = 'object'),
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
