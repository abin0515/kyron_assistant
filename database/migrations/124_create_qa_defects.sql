CREATE TABLE IF NOT EXISTS qa_defects (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  run_id UUID,
  finding_id UUID,
  stage TEXT NOT NULL CHECK (stage IN ('setup', 'lesson', 'video', 'harness')),
  category TEXT NOT NULL CHECK (category IN ('qa_missed', 'false_alarm', 'wrong_fix', 'harness_bug', 'kyron_output', 'source_problem', 'cost_or_performance')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'resolved')),
  origin TEXT NOT NULL CHECK (origin IN ('reviewer', 'rejected_finding', 'audit')),
  data JSONB NOT NULL CHECK (JSONB_TYPEOF(data) = 'object'),
  created_by TEXT NOT NULL,
  record_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
