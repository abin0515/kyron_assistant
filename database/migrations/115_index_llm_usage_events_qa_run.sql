CREATE INDEX IF NOT EXISTS llm_usage_events_qa_run_idx
ON llm_usage_events (qa_run_id)
WHERE qa_run_id IS NOT NULL;
