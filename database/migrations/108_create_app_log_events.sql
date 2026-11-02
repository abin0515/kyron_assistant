-- Application log: events, model usage with estimated cost, and model prices.

CREATE TABLE IF NOT EXISTS app_log_events (
  id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  category TEXT NOT NULL CHECK (
    category IN ('auth', 'openai', 'kyron_api', 'kyron_mcp', 'qa', 'draft', 'system')
  ),
  event TEXT NOT NULL CHECK (CHAR_LENGTH(event) BETWEEN 1 AND 120),
  message TEXT NOT NULL CHECK (CHAR_LENGTH(message) <= 500),
  actor_id TEXT,
  actor_role TEXT,
  request_id UUID,
  qa_run_id UUID,
  workspace_id UUID,
  kyron_draft_id BIGINT,
  duration_ms INTEGER,
  data JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (JSONB_TYPEOF(data) = 'object')
);
