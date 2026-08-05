-- Migration: store MCAHPS case-mix / reliability adjusted base stars
--
-- Plan Preview 1 measure files carry unadjusted CAHPS scores. The enriched
-- MCAHPS final output supplies Adjusted_Base_Star (case-mix + reliability).
-- When uploaded, those stars overlay cut-point banding for matching contracts.

CREATE TABLE IF NOT EXISTS plan_preview_cahps_adjusted_stars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES plan_preview_upload_batches(id) ON DELETE CASCADE,
  stars_year INTEGER NOT NULL,
  contract_id TEXT NOT NULL,
  organization_marketing_name TEXT,
  parent_organization TEXT,
  variable TEXT,
  variable_name TEXT NOT NULL,
  measure_code TEXT NOT NULL,
  measure_display_name TEXT NOT NULL,
  measure_normalized TEXT NOT NULL,
  adjusted_base_star INTEGER NOT NULL CHECK (adjusted_base_star BETWEEN 1 AND 5),
  unadjusted_base_star INTEGER,
  adjusted_final_star INTEGER,
  case_mix_adjustment NUMERIC,
  plan_reliability TEXT,
  plan_significance TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stars_year, contract_id, measure_normalized)
);

CREATE INDEX IF NOT EXISTS idx_plan_preview_cahps_adjusted_stars_year
  ON plan_preview_cahps_adjusted_stars(stars_year);

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
    'cahps_adjusted'
  ));
