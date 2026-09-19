ALTER TABLE course_setup_calibrations
  ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS include_in_calibration BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calibration_selected_by_id TEXT,
  ADD COLUMN IF NOT EXISTS calibration_selected_by_name TEXT,
  ADD COLUMN IF NOT EXISTS calibration_selected_by_email TEXT,
  ADD COLUMN IF NOT EXISTS calibration_selected_at TIMESTAMPTZ;
