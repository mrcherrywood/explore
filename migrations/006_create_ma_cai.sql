-- Migration: Create MA CAI table
-- Source data located in data/<year>/cai_<year>.json

CREATE TABLE IF NOT EXISTS ma_cai (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id text NOT NULL,
  year integer NOT NULL,
  organization_marketing_name text,
  contract_name text,
  parent_organization text,
  puerto_rico_only boolean,
  part_c_fac numeric,
  part_d_ma_pd_fac numeric,
  part_d_pdp_fac numeric,
  overall_fac numeric,
  cai_value numeric,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (contract_id, year)
);

COMMENT ON TABLE ma_cai IS 'CMS MA contract complaint alignment indices (CAI) sourced from CMS CAI files.';
COMMENT ON COLUMN ma_cai.puerto_rico_only IS 'True when the contract is limited to Puerto Rico.';
COMMENT ON COLUMN ma_cai.part_c_fac IS 'Financial alignment category (FAC) score for Part C benefits.';
COMMENT ON COLUMN ma_cai.part_d_ma_pd_fac IS 'Financial alignment category (FAC) score for Part D when bundled with MA-PD plans.';
COMMENT ON COLUMN ma_cai.part_d_pdp_fac IS 'Financial alignment category (FAC) score for standalone Part D PDP plans.';
COMMENT ON COLUMN ma_cai.overall_fac IS 'Overall financial alignment category (FAC) score.';
COMMENT ON COLUMN ma_cai.cai_value IS 'Calculated complaint summary index (CAI) value.';

CREATE INDEX IF NOT EXISTS ma_cai_contract_year_idx
  ON ma_cai (contract_id, year DESC);

CREATE INDEX IF NOT EXISTS ma_cai_year_idx
  ON ma_cai (year DESC);
