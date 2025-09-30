-- Migration: Track monthly enrollment by plan for each contract
-- Source data located in data/<year>/Monthly_Report_By_Plan_<year>_<month>_condensed.json

CREATE TABLE IF NOT EXISTS ma_plan_enrollment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id text NOT NULL,
  plan_id text NOT NULL,
  plan_type text,
  enrollment integer,
  is_suppressed boolean NOT NULL DEFAULT false,
  report_year integer NOT NULL,
  report_month integer NOT NULL,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (contract_id, plan_id, report_year, report_month)
);

COMMENT ON TABLE ma_plan_enrollment IS 'Monthly CMS enrollment counts by plan for each MA contract.';
COMMENT ON COLUMN ma_plan_enrollment.enrollment IS 'Latest reported enrollment for the plan; NULL if suppressed.';
COMMENT ON COLUMN ma_plan_enrollment.is_suppressed IS 'True when CMS suppresses enrollment counts for privacy (* in source file).';
COMMENT ON COLUMN ma_plan_enrollment.report_month IS 'Calendar month number (1-12) for the enrollment report.';

CREATE INDEX IF NOT EXISTS ma_plan_enrollment_contract_period_idx
  ON ma_plan_enrollment (contract_id, report_year DESC, report_month DESC);

CREATE INDEX IF NOT EXISTS ma_plan_enrollment_period_idx
  ON ma_plan_enrollment (report_year DESC, report_month DESC);
