-- Fix incorrect weight for C19: Statin Therapy for Patients with Cardiovascular Disease (2026)
-- C19 should have weight 1, not 2
-- In 2026, the measure codes were renumbered. C19 is now "Statin Therapy" which was C16 in 2025.
-- The import script incorrectly picked up the weight from the old C19 which was a CAHPS measure.
-- Reference: CMS 2026 Star Ratings Attachment G

UPDATE ma_measures 
SET weight = 1 
WHERE code = 'C19' AND year = 2026;

