-- Migration: Add separate columns for star ratings and rate/percent values
-- This separates the mixed data in value_text and value_numeric into dedicated columns

-- Add new columns
ALTER TABLE ma_metrics
ADD COLUMN star_rating TEXT,
ADD COLUMN rate_percent NUMERIC;

-- Migrate existing data
-- Move star ratings from value_text to star_rating
UPDATE ma_metrics
SET star_rating = value_text
WHERE value_text IS NOT NULL 
  AND LOWER(value_text) LIKE '%star%';

-- Move numeric rates/percentages to rate_percent
-- Only if value_text doesn't contain "star"
UPDATE ma_metrics
SET rate_percent = value_numeric
WHERE value_numeric IS NOT NULL
  AND (value_text IS NULL OR LOWER(value_text) NOT LIKE '%star%');

-- Optional: You can keep the old columns for now or drop them later
-- Uncomment these lines if you want to remove the old columns:
-- ALTER TABLE ma_metrics DROP COLUMN value_text;
-- ALTER TABLE ma_metrics DROP COLUMN value_numeric;
-- ALTER TABLE ma_metrics DROP COLUMN value_unit;
