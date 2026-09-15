CREATE TABLE IF NOT EXISTS course_setup_calibrations (
  workspace_id UUID PRIMARY KEY
    REFERENCES draft_workspaces(id) ON DELETE CASCADE,
  generated_setup JSONB,
  generated_at TIMESTAMPTZ,
  prompt_version TEXT,
  model TEXT,
  generation_token UUID,
  generation_started_at TIMESTAMPTZ,
  review_status TEXT
    CHECK (review_status IN ('needs_review', 'reviewed')),
  review_result TEXT
    CHECK (review_result IN ('approved_as_is', 'edited_and_approved')),
  reviewed_setup JSONB,
  reviewed_by_id TEXT,
  reviewed_by_name TEXT,
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ,
  submitted_setup JSONB,
  submitted_at TIMESTAMPTZ,
  kyron_draft_id BIGINT,
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (generated_setup IS NULL OR JSONB_TYPEOF(generated_setup) = 'object'),
  CHECK (reviewed_setup IS NULL OR JSONB_TYPEOF(reviewed_setup) = 'object'),
  CHECK (submitted_setup IS NULL OR JSONB_TYPEOF(submitted_setup) = 'object'),
  CHECK (
    (generated_setup IS NULL AND generated_at IS NULL AND prompt_version IS NULL AND model IS NULL AND review_status IS NULL)
    OR
    (generated_setup IS NOT NULL AND generated_at IS NOT NULL AND prompt_version IS NOT NULL AND model IS NOT NULL AND review_status IS NOT NULL)
  ),
  CHECK (
    (review_status = 'reviewed' AND review_result IS NOT NULL AND reviewed_setup IS NOT NULL AND reviewed_by_id IS NOT NULL AND reviewed_by_name IS NOT NULL AND reviewed_by_email IS NOT NULL AND reviewed_at IS NOT NULL)
    OR
    (review_status IS DISTINCT FROM 'reviewed' AND review_result IS NULL AND reviewed_setup IS NULL AND reviewed_by_id IS NULL AND reviewed_by_name IS NULL AND reviewed_by_email IS NULL AND reviewed_at IS NULL)
  ),
  CHECK (
    (submitted_setup IS NULL AND submitted_at IS NULL AND kyron_draft_id IS NULL)
    OR
    (submitted_setup IS NOT NULL AND submitted_at IS NOT NULL AND kyron_draft_id IS NOT NULL)
  )
);
