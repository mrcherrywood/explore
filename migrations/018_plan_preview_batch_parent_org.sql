-- Migration: store the parent organization on plan preview upload batches so
-- the admin upload history can be grouped by org. Backfills existing batches
-- from their accrued measure/CAI rows.

ALTER TABLE plan_preview_upload_batches
  ADD COLUMN IF NOT EXISTS parent_organization TEXT;

UPDATE plan_preview_upload_batches b
SET parent_organization = sub.summary
FROM (
  SELECT batch_id,
    CASE
      WHEN COUNT(DISTINCT parent_organization) = 1 THEN MIN(parent_organization)
      ELSE COUNT(DISTINCT parent_organization)::text || ' parent organizations'
    END AS summary
  FROM plan_preview_measure_scores
  WHERE parent_organization IS NOT NULL
  GROUP BY batch_id
) sub
WHERE b.id = sub.batch_id AND b.parent_organization IS NULL;

UPDATE plan_preview_upload_batches b
SET parent_organization = sub.summary
FROM (
  SELECT batch_id,
    CASE
      WHEN COUNT(DISTINCT parent_organization) = 1 THEN MIN(parent_organization)
      ELSE COUNT(DISTINCT parent_organization)::text || ' parent organizations'
    END AS summary
  FROM plan_preview_cai
  WHERE parent_organization IS NOT NULL
  GROUP BY batch_id
) sub
WHERE b.id = sub.batch_id AND b.parent_organization IS NULL;
