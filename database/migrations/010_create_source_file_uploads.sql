CREATE TABLE IF NOT EXISTS source_file_uploads (
  id UUID PRIMARY KEY,
  original_name TEXT NOT NULL
    CHECK (CHAR_LENGTH(BTRIM(original_name)) BETWEEN 1 AND 255),
  normalized_name TEXT GENERATED ALWAYS AS (
    LOWER(BTRIM(original_name))
  ) STORED,
  blob_pathname TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL
    CHECK (CHAR_LENGTH(content_type) BETWEEN 1 AND 255),
  declared_byte_size BIGINT NOT NULL
    CHECK (declared_byte_size > 0 AND declared_byte_size <= 262144000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired')),
  created_by_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
