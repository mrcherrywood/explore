-- Migration: add decimal score overlays from PP1 domain workbooks (CAHPS,
-- HEDIS, SNP Care Management) and extend upload batch file types accordingly.
--
-- Domain files carry higher-precision printed scores that overlay the whole-
-- number measure_data values. Effective score at read time is
-- COALESCE(decimal_score, score). measure_data upserts leave decimal columns
-- untouched; domain upserts write only the decimal overlay.

ALTER TABLE plan_preview_measure_scores
  ADD COLUMN IF NOT EXISTS decimal_score NUMERIC,
  ADD COLUMN IF NOT EXISTS decimal_source TEXT;

ALTER TABLE plan_preview_upload_batches
  DROP CONSTRAINT IF EXISTS plan_preview_upload_batches_file_type_check;

ALTER TABLE plan_preview_upload_batches
  ADD CONSTRAINT plan_preview_upload_batches_file_type_check
  CHECK (file_type IN ('measure_data', 'cai', 'cahps', 'hedis', 'snp_cm'));

CREATE INDEX IF NOT EXISTS idx_plan_preview_measure_scores_decimal
  ON plan_preview_measure_scores(stars_year)
  WHERE decimal_score IS NOT NULL;
