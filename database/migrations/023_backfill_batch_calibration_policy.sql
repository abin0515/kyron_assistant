WITH batch_calibrations AS (
  UPDATE course_setup_calibrations AS calibration
  SET
    review_required = FALSE,
    record_updated_at = NOW()
  FROM draft_workspaces AS workspace
  WHERE calibration.workspace_id = workspace.id
    AND workspace.batch_id IS NOT NULL
  RETURNING calibration.workspace_id
)
UPDATE draft_workspaces AS workspace
SET
  setup_status = 'reviewed',
  setup_status_message = 'AI suggestion generated and ready to submit.',
  record_updated_at = NOW()
WHERE workspace.id IN (
  SELECT workspace_id FROM batch_calibrations
)
  AND workspace.setup_status = 'needs_review';
