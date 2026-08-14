-- Migration: recognize CMS data-issue sentinel cells in Plan Preview 1
--
-- When CMS identifies issues with a plan's data, PP1 files carry a text
-- message instead of a score. That measure is not scored and is assigned
-- 1 star. Existing uploads stored the message as status = 'other'.

ALTER TABLE plan_preview_measure_scores
  DROP CONSTRAINT IF EXISTS plan_preview_measure_scores_status_check;

ALTER TABLE plan_preview_measure_scores
  ADD CONSTRAINT plan_preview_measure_scores_status_check
  CHECK (status IN (
    'scored',
    'not_required',
    'not_applicable',
    'insufficient_data',
    'cms_data_issue',
    'other'
  ));

UPDATE plan_preview_measure_scores
SET status = 'cms_data_issue'
WHERE status = 'other'
  AND raw_value ILIKE '%cms identified issues%';
