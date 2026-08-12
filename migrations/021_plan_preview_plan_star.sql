-- Migration: store plan PP1 CAHPS Star Rating on accrued measure scores
--
-- Plan CAHPS domain files include a final Star Rating column. Prefer that
-- over Press Ganey MCAHPS Adjusted_Base_Star overlays. When absent, PP1
-- bands the accrued score against official CAHPS cut points.

ALTER TABLE plan_preview_measure_scores
  ADD COLUMN IF NOT EXISTS plan_star INTEGER
    CHECK (plan_star IS NULL OR plan_star BETWEEN 1 AND 5);

COMMENT ON COLUMN plan_preview_measure_scores.plan_star IS
  'Final CAHPS measure star from the plan PP1 CAHPS Star Rating column.';
