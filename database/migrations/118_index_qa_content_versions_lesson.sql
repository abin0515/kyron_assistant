CREATE INDEX IF NOT EXISTS qa_content_versions_lesson_idx
ON qa_content_versions (lesson_id, target, version_number DESC);
