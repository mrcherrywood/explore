-- Migration: Plan Preview 2 official stars, QI overlays, and published summaries
--
-- PP2 files carry CMS-published measure stars (not scores), QI significance,
-- and the official Part C / Part D / Overall rating buildup. Stored separately
-- from PP1 accrued scores so predictions and official results stay distinct.
-- Re-uploading a contract replaces its official rows for that stars year.

ALTER TABLE plan_preview_upload_batches
  DROP CONSTRAINT IF EXISTS plan_preview_upload_batches_file_type_check;

ALTER TABLE plan_preview_upload_batches
  ADD CONSTRAINT plan_preview_upload_batches_file_type_check
  CHECK (file_type IN (
    'measure_data',
    'cai',
    'cahps',
    'hedis',
    'snp_cm',
    'cahps_adjusted',
    'measure_star',
    'improvement',
    'summary_rating'
  ));

CREATE TABLE IF NOT EXISTS plan_preview_official_stars (
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
  star INTEGER CHECK (star BETWEEN 1 AND 5),
  status TEXT NOT NULL CHECK (status IN (
    'scored',
    'not_required',
    'not_applicable',
    'insufficient_data',
    'cms_data_issue',
    'too_small',
    'other'
  )),
  qi_significance TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stars_year, contract_id, measure_code)
);

CREATE TABLE IF NOT EXISTS plan_preview_official_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES plan_preview_upload_batches(id) ON DELETE CASCADE,
  stars_year INTEGER NOT NULL,
  contract_id TEXT NOT NULL,
  rating_type TEXT NOT NULL CHECK (rating_type IN ('part_c', 'part_d', 'overall')),
  organization_marketing_name TEXT,
  contract_name TEXT,
  parent_organization TEXT,
  contract_type TEXT,
  snp_plans TEXT,
  disaster_year_1 INTEGER,
  disaster_pct_1 NUMERIC,
  disaster_year_2 INTEGER,
  disaster_pct_2 NUMERIC,
  measures_required TEXT,
  measures_missing INTEGER,
  measures_rated INTEGER,
  calculated_mean NUMERIC,
  calculated_variance NUMERIC,
  score_percentile_rank NUMERIC,
  variance_percentile_rank NUMERIC,
  variance_category TEXT,
  reward_factor NUMERIC,
  interim_summary NUMERIC,
  fac TEXT,
  cai_value NUMERIC,
  final_summary NUMERIC,
  improvement_usage TEXT,
  new_measure_usage TEXT,
  final_rating NUMERIC,
  part_c_summary_rating NUMERIC,
  part_d_summary_rating NUMERIC,
  improvement_score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stars_year, contract_id, rating_type)
);

CREATE INDEX IF NOT EXISTS idx_plan_preview_official_stars_year_contract
  ON plan_preview_official_stars(stars_year, contract_id);

CREATE INDEX IF NOT EXISTS idx_plan_preview_official_stars_year_measure
  ON plan_preview_official_stars(stars_year, measure_normalized);

CREATE INDEX IF NOT EXISTS idx_plan_preview_official_summary_year_contract
  ON plan_preview_official_summary(stars_year, contract_id);

DROP TRIGGER IF EXISTS update_plan_preview_official_stars_timestamp ON plan_preview_official_stars;
CREATE TRIGGER update_plan_preview_official_stars_timestamp
  BEFORE UPDATE ON plan_preview_official_stars
  FOR EACH ROW EXECUTE FUNCTION update_plan_preview_updated_at();

DROP TRIGGER IF EXISTS update_plan_preview_official_summary_timestamp ON plan_preview_official_summary;
CREATE TRIGGER update_plan_preview_official_summary_timestamp
  BEFORE UPDATE ON plan_preview_official_summary
  FOR EACH ROW EXECUTE FUNCTION update_plan_preview_updated_at();

ALTER TABLE plan_preview_official_stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_preview_official_summary ENABLE ROW LEVEL SECURITY;
