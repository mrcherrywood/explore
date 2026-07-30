-- Migration: create Plan Preview upload and accrued score tables
--
-- Plan Preview 1 files carry contract-level measure scores (no stars yet) plus
-- a CAI/enrollment file. Scores accrue across uploads: re-uploading a contract
-- replaces its rows for that stars year (UNIQUE constraints + upsert).

CREATE TABLE IF NOT EXISTS plan_preview_upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('measure_data', 'cai')),
  stars_year INTEGER NOT NULL,
  source_sheet TEXT,
  detected_stars_year INTEGER,
  row_count INTEGER NOT NULL DEFAULT 0,
  contract_count INTEGER NOT NULL DEFAULT 0,
  measure_count INTEGER NOT NULL DEFAULT 0,
  imported_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_preview_measure_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES plan_preview_upload_batches(id) ON DELETE CASCADE,
  stars_year INTEGER NOT NULL,
  contract_id TEXT NOT NULL,
  organization_marketing_name TEXT,
  contract_name TEXT,
  parent_organization TEXT,
  measure_code TEXT NOT NULL,
  measure_name TEXT NOT NULL,
  measure_display_name TEXT NOT NULL,
  measure_normalized TEXT NOT NULL,
  metric_category TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  score NUMERIC,
  status TEXT NOT NULL CHECK (status IN ('scored', 'not_required', 'not_applicable', 'insufficient_data', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stars_year, contract_id, measure_code)
);

CREATE TABLE IF NOT EXISTS plan_preview_cai (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES plan_preview_upload_batches(id) ON DELETE CASCADE,
  stars_year INTEGER NOT NULL,
  contract_id TEXT NOT NULL,
  organization_marketing_name TEXT,
  contract_name TEXT,
  parent_organization TEXT,
  puerto_rico_only BOOLEAN,
  contract_type TEXT,
  part_d_offered BOOLEAN,
  enrolled NUMERIC,
  num_lis_de NUMERIC,
  num_disabled NUMERIC,
  pct_lis_de NUMERIC,
  pct_disabled NUMERIC,
  part_c_lis_de_group TEXT,
  part_c_disabled_quintile TEXT,
  part_c_fac TEXT,
  part_c_cai NUMERIC,
  part_d_mapd_lis_de_group TEXT,
  part_d_mapd_disabled_quintile TEXT,
  part_d_mapd_fac TEXT,
  part_d_mapd_cai NUMERIC,
  part_d_pdp_lis_de_quartile TEXT,
  part_d_pdp_disabled_quartile TEXT,
  part_d_pdp_fac TEXT,
  part_d_pdp_cai NUMERIC,
  overall_lis_de_group TEXT,
  overall_disabled_quintile TEXT,
  overall_fac TEXT,
  overall_cai NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stars_year, contract_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_preview_batches_stars_year
  ON plan_preview_upload_batches(stars_year, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_preview_measure_scores_year_measure
  ON plan_preview_measure_scores(stars_year, measure_normalized);

CREATE INDEX IF NOT EXISTS idx_plan_preview_measure_scores_year_contract
  ON plan_preview_measure_scores(stars_year, contract_id);

CREATE INDEX IF NOT EXISTS idx_plan_preview_cai_year_contract
  ON plan_preview_cai(stars_year, contract_id);

CREATE OR REPLACE FUNCTION update_plan_preview_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_plan_preview_upload_batches_timestamp ON plan_preview_upload_batches;
CREATE TRIGGER update_plan_preview_upload_batches_timestamp
  BEFORE UPDATE ON plan_preview_upload_batches
  FOR EACH ROW EXECUTE FUNCTION update_plan_preview_updated_at();

DROP TRIGGER IF EXISTS update_plan_preview_measure_scores_timestamp ON plan_preview_measure_scores;
CREATE TRIGGER update_plan_preview_measure_scores_timestamp
  BEFORE UPDATE ON plan_preview_measure_scores
  FOR EACH ROW EXECUTE FUNCTION update_plan_preview_updated_at();

DROP TRIGGER IF EXISTS update_plan_preview_cai_timestamp ON plan_preview_cai;
CREATE TRIGGER update_plan_preview_cai_timestamp
  BEFORE UPDATE ON plan_preview_cai
  FOR EACH ROW EXECUTE FUNCTION update_plan_preview_updated_at();

ALTER TABLE plan_preview_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_preview_measure_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_preview_cai ENABLE ROW LEVEL SECURITY;
