CREATE TABLE IF NOT EXISTS workspace_source_files (
  workspace_id UUID NOT NULL
    REFERENCES draft_workspaces(id) ON DELETE CASCADE,
  source_file_id UUID NOT NULL
    REFERENCES source_files(id) ON DELETE RESTRICT,
  usage TEXT NOT NULL
    CHECK (usage IN ('ai_input', 'kyron_attachment')),
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, source_file_id, usage)
);
