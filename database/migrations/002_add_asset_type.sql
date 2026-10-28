ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS asset_type TEXT NOT NULL DEFAULT 'lesson'
CHECK (asset_type IN ('lesson', 'practice', 'scenario'));
