ALTER TABLE draft_workspaces
  ADD COLUMN IF NOT EXISTS kyron_asset_folder_id BIGINT,
  ADD COLUMN IF NOT EXISTS kyron_asset_folder_path JSONB NOT NULL DEFAULT '[]'::JSONB;
