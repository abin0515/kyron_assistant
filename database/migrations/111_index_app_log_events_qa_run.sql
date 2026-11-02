CREATE INDEX IF NOT EXISTS app_log_events_qa_run_idx
ON app_log_events (qa_run_id)
WHERE qa_run_id IS NOT NULL;
