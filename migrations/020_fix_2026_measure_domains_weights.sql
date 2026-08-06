-- Fix remaining Stars 2026 ma_measures domain/weight drift vs the canonical
-- cut-points workbook (Stars 2016-2028 Cut Points 07.2026_with_weights.xlsx).
-- Prior import/renumbering left several measures on the wrong CMS domain
-- (e.g. TRC/FMC as CAHPS instead of HEDIS) and swapped weights on others.

-- Domains
UPDATE ma_measures SET domain = 'HOS' WHERE year = 2026 AND code = 'C05'; -- Improving or Maintaining Mental Health
UPDATE ma_measures SET domain = 'HOS' WHERE year = 2026 AND code = 'C06'; -- Monitoring Physical Activity
UPDATE ma_measures SET domain = 'Operations' WHERE year = 2026 AND code = 'C07'; -- SNP Care Management
UPDATE ma_measures SET domain = 'HEDIS' WHERE year = 2026 AND code = 'C12'; -- Diabetes Care – Blood Sugar Controlled
UPDATE ma_measures SET domain = 'HEDIS' WHERE year = 2026 AND code = 'C13'; -- Kidney Health Evaluation
UPDATE ma_measures SET domain = 'HOS' WHERE year = 2026 AND code = 'C15'; -- Reducing the Risk of Falling
UPDATE ma_measures SET domain = 'HOS' WHERE year = 2026 AND code = 'C16'; -- Improving Bladder Control
UPDATE ma_measures SET domain = 'HEDIS' WHERE year = 2026 AND code = 'C20'; -- Transitions of Care
UPDATE ma_measures SET domain = 'HEDIS' WHERE year = 2026 AND code = 'C21'; -- Follow-up after ED (FMC)

-- Weights (workbook Weight column for Stars 2026)
UPDATE ma_measures SET weight = 1 WHERE year = 2026 AND code = 'C10'; -- Osteoporosis Management
UPDATE ma_measures SET weight = 3 WHERE year = 2026 AND code = 'C14'; -- Controlling High Blood Pressure
UPDATE ma_measures SET weight = 1 WHERE year = 2026 AND code = 'C15'; -- Reducing the Risk of Falling
UPDATE ma_measures SET weight = 3 WHERE year = 2026 AND code = 'C18'; -- Plan All-Cause Readmissions
UPDATE ma_measures SET weight = 1 WHERE year = 2026 AND code = 'C20'; -- Transitions of Care
UPDATE ma_measures SET weight = 1 WHERE year = 2026 AND code = 'C21'; -- Follow-up after ED (FMC)
