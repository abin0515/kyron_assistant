CREATE INDEX IF NOT EXISTS qa_defects_created_idx
ON qa_defects (record_created_at DESC);
