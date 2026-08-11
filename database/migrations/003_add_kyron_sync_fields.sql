ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS kyron_availability TEXT NOT NULL DEFAULT 'unknown'
CHECK (kyron_availability IN ('available', 'unavailable', 'unknown')),
ADD COLUMN IF NOT EXISTS kyron_checked_at TIMESTAMPTZ;
