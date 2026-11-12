CREATE TABLE IF NOT EXISTS kyron_mcp_connections (
  id TEXT PRIMARY KEY DEFAULT 'app' CHECK (id = 'app'),
  encrypted_connection TEXT NOT NULL,
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
