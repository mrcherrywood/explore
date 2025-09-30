-- Migration: Create summary ratings table for contract-level star ratings
-- Based on source data in data/<year>/summary_rating_<year>.json

CREATE TABLE IF NOT EXISTS summary_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id text NOT NULL,
  year integer NOT NULL,
  organization_type text,
  contract_name text,
  organization_marketing_name text,
  parent_organization text,
  snp_indicator text,
  disaster_percent_2021 numeric,
  disaster_percent_2022 numeric,
  disaster_percent_2023 numeric,
  part_c_summary text,
  part_d_summary text,
  overall_rating text,
  part_c_summary_numeric numeric,
  part_d_summary_numeric numeric,
  overall_rating_numeric numeric,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (contract_id, year)
);

COMMENT ON TABLE summary_ratings IS 'Contract-level summary star ratings by year sourced from CMS summary rating files.';
COMMENT ON COLUMN summary_ratings.disaster_percent_2021 IS 'Percent of enrollees impacted by 2021 disasters (if reported).';
COMMENT ON COLUMN summary_ratings.part_c_summary_numeric IS 'Numeric cast of Part C Summary rating when provided as text.';
COMMENT ON COLUMN summary_ratings.part_d_summary_numeric IS 'Numeric cast of Part D Summary rating when provided as text.';
COMMENT ON COLUMN summary_ratings.overall_rating_numeric IS 'Numeric cast of Overall rating when provided as text.';
