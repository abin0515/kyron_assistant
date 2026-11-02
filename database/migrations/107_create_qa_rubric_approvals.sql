CREATE TABLE IF NOT EXISTS qa_rubric_approvals (
  domain TEXT NOT NULL,
  version TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (domain, version)
);
