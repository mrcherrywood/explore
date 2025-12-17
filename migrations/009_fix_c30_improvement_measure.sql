-- Fix C30 for 2026: This measure was reassigned from "Call Center – Foreign Language Interpreter and TTY Availability"
-- to "Health Plan Quality Improvement" in 2026. The import script incorrectly inherited the old weight (2) and domain (Operations)
-- from prior years. The correct weight for improvement measures is 5, and the domain should be Quality Improvement.

UPDATE ma_measures
SET weight = 5,
    domain = 'Quality Improvement'
WHERE code = 'C30'
  AND year = 2026;


















