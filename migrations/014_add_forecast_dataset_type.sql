-- Migration: tag forecast projection runs by dataset type so non-CAHPS (HL-code
-- upload) and CAHPS (separate survey upload) runs can be approved separately and
-- combined per-measure at analysis time.

ALTER TABLE forecast_projection_runs
  ADD COLUMN IF NOT EXISTS dataset_type TEXT NOT NULL DEFAULT 'non_cahps'
  CHECK (dataset_type IN ('non_cahps', 'cahps'));

DROP INDEX IF EXISTS idx_forecast_projection_runs_year_status;
CREATE INDEX IF NOT EXISTS idx_forecast_projection_runs_year_status
  ON forecast_projection_runs(forecast_year, dataset_type, status, created_at DESC);
