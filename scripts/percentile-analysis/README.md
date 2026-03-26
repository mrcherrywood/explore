# Medicare Star Ratings Percentile Analysis

Python scripts for analyzing Medicare Advantage Star Ratings measure data (2022–2026).

## Scripts

### `contract_percentiles.py`
Calculates percentile rank for every H+R contract on every measure.

### `cutpoint_percentiles.py`
Finds what percentile each CMS cut point corresponds to in the actual data distribution.

### `config.py`
Shared configuration: file mappings, name normalization, percentile functions.

## Percentile Methods

Both scripts support two calculation methods via the `--method` flag:

| Method | Formula | When to use |
|--------|---------|-------------|
| `percentrank_inc` (default) | (count below) / (n − 1) × 100 | Industry standard. Matches Excel's `PERCENTRANK.INC`. |
| `percentileofscore` | (count at or below) / n × 100 | scipy convention. Includes ties in the count. |

## Setup

```bash
pip install pandas numpy scipy openpyxl
```

## Data

All input data lives in the `data/` subdirectory. Both scripts default to this location, so you can run them with no path arguments.

## Usage

### Contract Percentiles

```bash
# Default — uses ./data, PERCENTRANK.INC, Excel output
python contract_percentiles.py --output contract_percentiles.xlsx

# Using scipy method, output as JSON
python contract_percentiles.py \
  --output contract_percentiles.json \
  --method percentileofscore

# Specific years only
python contract_percentiles.py \
  --output contract_percentiles_2026.xlsx \
  --years 2026

# Custom data directory
python contract_percentiles.py \
  --data-dir /other/path/to/csvs \
  --output contract_percentiles.xlsx
```

### Cut Point Percentile Equivalents

```bash
# Default — uses ./data for CSVs and cut points file
python cutpoint_percentiles.py --output cutpoint_percentiles.xlsx

# Using scipy method, JSON output
python cutpoint_percentiles.py \
  --output cutpoint_percentiles.json \
  --method percentileofscore

# Custom paths
python cutpoint_percentiles.py \
  --data-dir /other/path/to/csvs \
  --cut-points /other/path/to/cut_points.xlsx \
  --output cutpoint_percentiles.xlsx
```

## Input Files

All data files are included in `data/`. Update the `FILES` dict in `config.py` if your filenames differ.

| Year | Expected Filename | Notes |
|------|-------------------|-------|
| 2022 | `2022 Star Ratings Data Table - Measure Data (Oct 06 2021).csv` | 4 header rows |
| 2023 | `2023 Star Ratings Data Table - Measure Data (Oct 04 2022).csv` | 4 header rows |
| 2024 | `2024 Star Ratings Data Table - Measure Data (Oct 12 2023).csv` | 4 header rows |
| 2025 | `2025 Star Ratings Data Table - Measure Data (Oct 11 2024).csv` | **1 header row** (different structure) |
| 2026 | `2026 Star Ratings Data Table - Measure Data (Oct 8 2025).csv` | 4 header rows |

Cut points file: `Stars 2016-2028 Cut Points 12.2025 (1).xlsx` (sheet: "Cut Points")

## Key Design Decisions

- **H+R contracts only** for contract percentiles (MA local + regional plans)
- **H contracts only** for cut point analysis (matches CMS clustering population)
- **Inverted measures** (Complaints, Members Choosing to Leave, Readmissions) have percentiles flipped so higher always = better
- **Encoding**: All CSVs read with `latin-1` to handle mixed encoding across years
- **Name normalization**: Non-ASCII characters stripped before matching (handles em-dash inconsistencies across years)
