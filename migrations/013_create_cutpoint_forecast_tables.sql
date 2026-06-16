-- Migration: create cut-point forecast import and projection tables

CREATE TABLE IF NOT EXISTS forecast_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  forecast_year INTEGER NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  contract_count INTEGER NOT NULL DEFAULT 0,
  measure_count INTEGER NOT NULL DEFAULT 0,
  source_sheet TEXT,
  latest_observed_year INTEGER,
  latest_observed_month INTEGER,
  imported_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecast_monthly_measure_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES forecast_import_batches(id) ON DELETE CASCADE,
  source_row_number INTEGER NOT NULL,
  hl_code TEXT,
  contract_id TEXT NOT NULL,
  measure_name TEXT NOT NULL,
  measure_display_name TEXT NOT NULL,
  measure_normalized TEXT NOT NULL,
  measure_code TEXT,
  metric_category TEXT NOT NULL,
  data_year INTEGER NOT NULL,
  data_month INTEGER NOT NULL,
  normalized_month INTEGER NOT NULL,
  rate NUMERIC,
  numerator_all NUMERIC,
  denominator_all NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, contract_id, measure_normalized, data_year, data_month)
);

CREATE TABLE IF NOT EXISTS forecast_projection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_batch_id UUID REFERENCES forecast_import_batches(id) ON DELETE SET NULL,
  forecast_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  as_of_year INTEGER,
  as_of_month INTEGER,
  model_version TEXT,
  projection_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  imported_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecast_year_end_projections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES forecast_projection_runs(id) ON DELETE CASCADE,
  forecast_year INTEGER NOT NULL,
  contract_id TEXT NOT NULL,
  measure_name TEXT NOT NULL,
  measure_display_name TEXT NOT NULL,
  measure_normalized TEXT NOT NULL,
  measure_code TEXT,
  hl_code TEXT,
  metric_category TEXT NOT NULL,
  model_score NUMERIC NOT NULL,
  manual_score NUMERIC,
  final_score NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  confidence_label TEXT NOT NULL CHECK (confidence_label IN ('low', 'medium', 'high')),
  trend_slope NUMERIC,
  seasonality_delta NUMERIC,
  last_observed_year INTEGER,
  last_observed_month INTEGER,
  last_observed_score NUMERIC,
  supporting_points INTEGER NOT NULL DEFAULT 0,
  notes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, contract_id, measure_normalized)
);

CREATE INDEX IF NOT EXISTS idx_forecast_import_batches_forecast_year
  ON forecast_import_batches(forecast_year);

CREATE INDEX IF NOT EXISTS idx_forecast_monthly_history_batch
  ON forecast_monthly_measure_history(batch_id);

CREATE INDEX IF NOT EXISTS idx_forecast_monthly_history_measure_period
  ON forecast_monthly_measure_history(measure_normalized, data_year, normalized_month);

CREATE INDEX IF NOT EXISTS idx_forecast_projection_runs_year_status
  ON forecast_projection_runs(forecast_year, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecast_year_end_projections_run_measure
  ON forecast_year_end_projections(run_id, measure_normalized, contract_id);

CREATE OR REPLACE FUNCTION update_cutpoint_forecast_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_forecast_import_batches_timestamp ON forecast_import_batches;
CREATE TRIGGER update_forecast_import_batches_timestamp
  BEFORE UPDATE ON forecast_import_batches
  FOR EACH ROW EXECUTE FUNCTION update_cutpoint_forecast_updated_at();

DROP TRIGGER IF EXISTS update_forecast_projection_runs_timestamp ON forecast_projection_runs;
CREATE TRIGGER update_forecast_projection_runs_timestamp
  BEFORE UPDATE ON forecast_projection_runs
  FOR EACH ROW EXECUTE FUNCTION update_cutpoint_forecast_updated_at();

DROP TRIGGER IF EXISTS update_forecast_year_end_projections_timestamp ON forecast_year_end_projections;
CREATE TRIGGER update_forecast_year_end_projections_timestamp
  BEFORE UPDATE ON forecast_year_end_projections
  FOR EACH ROW EXECUTE FUNCTION update_cutpoint_forecast_updated_at();

ALTER TABLE forecast_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_monthly_measure_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_projection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_year_end_projections ENABLE ROW LEVEL SECURITY;
