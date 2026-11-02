CREATE INDEX IF NOT EXISTS llm_usage_events_occurred_idx
ON llm_usage_events (occurred_at DESC);
