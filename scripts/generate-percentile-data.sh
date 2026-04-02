#!/bin/sh
# Pre-generates percentile analysis JSON and workbook files during Vercel build.
# At runtime the serverless function finds these pre-built files and skips Python.
set -e

if [ -z "$VERCEL" ]; then
  exit 0
fi

DEPS="--with numpy --with pandas --with scipy --with openpyxl"

cd "$(dirname "$0")/percentile-analysis"
mkdir -p .generated-json .generated-workbooks

for method in percentrank_inc percentileofscore percentrank_inc_corrected kde_percentile; do
  uv run $DEPS python3 contract_percentiles.py \
    --output ".generated-json/contract-percentiles-${method}.json" \
    --format json \
    --method "$method"

  uv run $DEPS python3 contract_percentiles.py \
    --output ".generated-workbooks/contract-percentiles-${method}.xlsx" \
    --format xlsx \
    --method "$method"

  uv run $DEPS python3 cutpoint_percentiles.py \
    --output ".generated-workbooks/cutpoint-percentiles-${method}.xlsx" \
    --format xlsx \
    --method "$method"
done
