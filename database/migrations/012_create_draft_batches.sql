CREATE TABLE IF NOT EXISTS draft_batches (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
    CHECK (CHAR_LENGTH(BTRIM(name)) BETWEEN 1 AND 120),
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
