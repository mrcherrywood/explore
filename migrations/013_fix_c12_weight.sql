-- Fix incorrect weight for C12: Diabetes Care – Blood Sugar Controlled
-- C12 should have weight 3, not 1 (only 2026; prior years had different measures)
-- Reference: CMS 2026 Star Ratings Attachment G

UPDATE ma_measures 
SET weight = 3 
WHERE code = 'C12' AND year = 2026;
