-- Fix incorrect weight for C12: Diabetes Care – Blood Sugar Controlled
-- C12 should have weight 3, not 1
-- Reference: CMS 2026 Star Ratings Attachment G

UPDATE ma_measures 
SET weight = 3 
WHERE code = 'C12';
