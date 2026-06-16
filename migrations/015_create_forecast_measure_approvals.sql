-- Migration: approve forecast runs measure-by-measure during admin review

CREATE TABLE IF NOT EXISTS forecast_measure_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES forecast_projection_runs(id) ON DELETE CASCADE,
  measure_normalized TEXT NOT NULL,
  measure_display_name TEXT NOT NULL,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, measure_normalized)
);

CREATE INDEX IF NOT EXISTS idx_forecast_measure_approvals_run_measure
  ON forecast_measure_approvals(run_id, measure_normalized);

DROP TRIGGER IF EXISTS update_forecast_measure_approvals_timestamp ON forecast_measure_approvals;
CREATE TRIGGER update_forecast_measure_approvals_timestamp
  BEFORE UPDATE ON forecast_measure_approvals
  FOR EACH ROW EXECUTE FUNCTION update_cutpoint_forecast_updated_at();

ALTER TABLE forecast_measure_approvals ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
