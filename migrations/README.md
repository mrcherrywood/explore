# Database Migrations

## Running the Migration

To apply the migration that separates star ratings and rate/percent values:

### Option 1: Using Supabase CLI (if you have it set up)
```bash
supabase db push
```

### Option 2: Using psql or your database client
```bash
psql -h <your-host> -U <your-user> -d <your-database> -f migrations/001_add_star_rating_and_rate_percent.sql
```

### Option 3: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `001_add_star_rating_and_rate_percent.sql`
4. Click "Run"

## What This Migration Does

1. **Adds two new columns** to the `ma_metrics` table:
   - `star_rating` (TEXT) - for star values like "5 stars", "4 stars"
   - `rate_percent` (NUMERIC) - for percentage/rate values like 95.5, 87.2

2. **Migrates existing data**:
   - Moves star ratings from `value_text` to `star_rating`
   - Moves numeric rates/percentages from `value_numeric` to `rate_percent`

3. **Keeps old columns** for backward compatibility (you can drop them later if needed)

## After Running the Migration

The MA Metrics table will now display:
- **Year**
- **Contract ID**
- **Measure Name**
- **Stars** - Shows only star ratings (e.g., "5 stars")
- **Rate/Percent** - Shows only numeric values (e.g., 95.5)

Each row will show the measure name with its associated star rating OR rate/percent value (or both if applicable), all in one clean row without duplication.
