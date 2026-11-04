CREATE INDEX IF NOT EXISTS production_jobs_active_idx
ON production_jobs (record_updated_at)
WHERE is_active;
