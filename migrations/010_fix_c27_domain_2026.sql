-- Fix C27 domain for 2026: C27 was reassigned from "Health Plan Quality Improvement" (Quality Improvement domain)
-- to "Care Coordination" (CAHPS domain) in 2026. The import script incorrectly inherited the old domain
-- from prior years. C30 is now the Part C Quality Improvement measure for 2026.

UPDATE ma_measures
SET name = 'Care Coordination',
    domain = 'CAHPS',
    weight = 2
WHERE code = 'C27'
  AND year = 2026;

