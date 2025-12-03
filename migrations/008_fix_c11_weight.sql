-- Fix incorrect weight for C11: Diabetes Care – Eye Exam
-- C11 should have weight 1, not 3
-- Reference: CMS 2026 Star Ratings Attachment G

UPDATE ma_measures 
SET weight = 1 
WHERE code = 'C11';










