-- Fix domain categorization issues for 2026 measures.
-- The import script incorrectly inherited domains from prior years due to the 2026 measure renumbering.

-- C19: Statin Therapy for Patients with Cardiovascular Disease is a HEDIS clinical measure, not CAHPS
UPDATE ma_measures
SET domain = 'HEDIS'
WHERE code = 'C19'
  AND year = 2026;

-- C25: Rating of Health Care Quality is a CAHPS survey measure, not Operations
UPDATE ma_measures
SET domain = 'CAHPS'
WHERE code = 'C25'
  AND year = 2026;

-- C26: Rating of Health Plan is a CAHPS survey measure, not Operations
UPDATE ma_measures
SET domain = 'CAHPS'
WHERE code = 'C26'
  AND year = 2026;

