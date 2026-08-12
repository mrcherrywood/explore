-- Migration: store plan PP1 CAHPS Base Group star alongside Star Rating
--
-- PP1 CAHPS domain files include Base Group (pre-adjustment) and Star Rating
-- (final). Ratings use Star Rating; Base Group is kept so the report can show
-- when case-mix / significance moved a measure off its base-group assignment.

ALTER TABLE plan_preview_measure_scores
  ADD COLUMN IF NOT EXISTS base_group_star INTEGER
    CHECK (base_group_star IS NULL OR base_group_star BETWEEN 1 AND 5);

COMMENT ON COLUMN plan_preview_measure_scores.base_group_star IS
  'Pre-adjustment CAHPS base-group star from the plan PP1 CAHPS Base Group column.';
