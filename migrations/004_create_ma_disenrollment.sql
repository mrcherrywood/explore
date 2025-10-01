-- Migration: Create MA disenrollment reasons table
-- Source data located in data/<year>/disenrollment_reasons_<year>.json

CREATE TABLE IF NOT EXISTS ma_disenrollment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id text NOT NULL,
  year integer NOT NULL,
  organization_marketing_name text,
  contract_name text,
  parent_organization text,
  problems_care_percent numeric,
  problems_care_note text,
  problems_doctors_percent numeric,
  problems_doctors_note text,
  financial_reasons_percent numeric,
  financial_reasons_note text,
  problems_rx_percent numeric,
  problems_rx_note text,
  problems_help_percent numeric,
  problems_help_note text,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (contract_id, year)
);

COMMENT ON TABLE ma_disenrollment IS 'CMS MA disenrollment reasons by contract and year sourced from CMS disenrollment files.';
COMMENT ON COLUMN ma_disenrollment.problems_care_percent IS 'Percent of disenrollment due to problems getting needed care.';
COMMENT ON COLUMN ma_disenrollment.problems_care_note IS 'Original CMS text when percent not reported (e.g., Not Available).';
COMMENT ON COLUMN ma_disenrollment.problems_doctors_percent IS 'Percent of disenrollment due to problems with doctors and hospitals.';
COMMENT ON COLUMN ma_disenrollment.financial_reasons_percent IS 'Percent of disenrollment due to financial reasons.';
COMMENT ON COLUMN ma_disenrollment.problems_rx_percent IS 'Percent of disenrollment due to prescription drug benefit issues.';
COMMENT ON COLUMN ma_disenrollment.problems_help_percent IS 'Percent of disenrollment due to issues getting information and help from the plan.';

CREATE INDEX IF NOT EXISTS ma_disenrollment_contract_year_idx
  ON ma_disenrollment (contract_id, year DESC);
