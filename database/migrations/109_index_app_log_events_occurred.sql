CREATE INDEX IF NOT EXISTS app_log_events_occurred_idx
ON app_log_events (occurred_at DESC);
