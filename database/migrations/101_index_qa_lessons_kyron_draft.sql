CREATE INDEX IF NOT EXISTS qa_lessons_kyron_draft_idx
ON qa_lessons (kyron_draft_id)
WHERE kyron_draft_id IS NOT NULL;
