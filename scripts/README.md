# MA Metrics Data Import

## Overview

This script imports Medicare Advantage metrics data from JSON files into the `ma_metrics` table with properly separated star ratings and rate/percent values.

## Prerequisites

1. **Install tsx** (if not already installed):
   ```bash
   npm install -D tsx
   ```

2. **Set up environment variables** in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

3. **Run the database migration** first:
   - Go to Supabase Dashboard → SQL Editor
   - Run the migration from `migrations/001_add_star_rating_and_rate_percent.sql`

## Running the Import

```bash
npm run import:metrics
```

## What It Does

1. **Clears existing data** from the `ma_metrics` table
2. **Reads JSON files** from:
   - `data/2024/measure_data_2024.json` - Rate/percent values
   - `data/2024/measure_stars_2024.json` - Star ratings
   - `data/2025/measure_data_2025.json` - Rate/percent values
   - `data/2025/measure_stars_2025.json` - Star ratings

3. **Transforms the data**:
   - Each contract's measures are converted from columns to rows
   - Star ratings go into the `star_rating` column
   - Numeric values go into the `rate_percent` column
   - Extracts measure code (e.g., "C01") and label

4. **Inserts data** in batches of 1000 records

## Data Structure

### Input (JSON files)
```json
{
  "CONTRACT_ID": "H1234",
  "C01: Breast Cancer Screening": "85.5",  // in measure_data
  "C01: Breast Cancer Screening": "5 stars" // in measure_stars
}
```

### Output (Database)
```
contract_id | year | metric_code | metric_label              | rate_percent | star_rating
H1234       | 2024 | C01         | Breast Cancer Screening   | 85.5         | 5 stars
```

## After Import

The MA Metrics table will display:
- **Year**
- **Contract ID**
- **Measure Name**
- **Stars** - Star ratings (e.g., "5 stars", "4 stars")
- **Rate/Percent** - Numeric values (e.g., 85.5, 92.3)

Each row shows one measure for one contract, with both the star rating and rate/percent value properly separated!
