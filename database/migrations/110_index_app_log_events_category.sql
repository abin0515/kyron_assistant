CREATE INDEX IF NOT EXISTS app_log_events_category_idx
ON app_log_events (category, occurred_at DESC);
