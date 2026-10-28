CREATE TABLE IF NOT EXISTS source_files (
  id UUID PRIMARY KEY,
  original_name TEXT NOT NULL
    CHECK (CHAR_LENGTH(BTRIM(original_name)) BETWEEN 1 AND 255),
  normalized_name TEXT GENERATED ALWAYS AS (
    LOWER(BTRIM(original_name))
  ) STORED,
  blob_pathname TEXT NOT NULL UNIQUE,
  blob_url TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL
    CHECK (CHAR_LENGTH(content_type) BETWEEN 1 AND 255),
  byte_size BIGINT NOT NULL
    CHECK (byte_size > 0 AND byte_size <= 262144000),
  checksum_md5_base64 TEXT,
  processing_status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (processing_status IN ('uploaded', 'processing', 'ready', 'failed')),
  status_message TEXT NOT NULL DEFAULT '',
  extracted_text TEXT,
  extracted_at TIMESTAMPTZ,
  created_by_id TEXT NOT NULL,
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (created_by_id, normalized_name)
);
