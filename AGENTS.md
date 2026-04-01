## Learned User Preferences

- Prefer simple, user-facing labels over technical implementation names (e.g., "Percentile Rank" instead of "percentrank_inc")
- Avoid Excel-specific or source-format language in UI copy; keep labels accessible to users who don't know the underlying data format
- Use light blue (#c7d7e8) for table header backgrounds instead of dark navy; readability over brand color fidelity
- Avoid blue-on-blue text combinations in tables; ensure sufficient contrast
- Keep search/filter controls compact so sort and filter options stay visible without scrolling
- Use H+R (both H and R prefix) contract population consistently across all analyses, not H-only
- More recent years should carry more weight in pooled analyses (recency weighting: 2024=1x, 2025=2x, 2026=3x)
- Measures get whole star ratings only (1, 2, 3, 4, 5); never display half stars at the measure level
- Exclude "dropped" contracts (those that exited the market) from year-over-year analyses; they are not meaningful for performance tracking

## Learned Workspace Facts

- Next.js app deployed on Vercel; Python scripts in `scripts/percentile-analysis/` generate JSON and XLSX outputs
- Percentile analysis supports two methods: Percentile Rank (PERCENTRANK.INC/Excel standard) and Percentile of Score (scipy percentileofscore)
- CMS Star Ratings data spans 2022-2026 measures with cut points from 2016-2028; 2027/2028 cut points are user forecasts
- Python deps (numpy, pandas, scipy, openpyxl) installed during Vercel prebuild via `scripts/generate-percentile-data.sh` using `uv run --with`; Python is unavailable at Vercel runtime
- Vercel runtime filesystem is read-only; only `/tmp` is writable; generated files bundled via `outputFileTracingIncludes` in next.config.ts
- Contract data uses H and R prefixes (Medicare Advantage); both must be included in percentile calculations
- Dev server runs on localhost:3001
- Percentile analysis tests run via `npm run test:percentile-analysis`
- Cut points with forecasts live at `data/Stars 2016-2028 Cut Points 12.2025_with_weights.xlsx`
- The xlsx npm package parses Excel workbooks server-side in Node.js
- Measure codes change between years (e.g., C04 renamed in 2026); cross-year matching must use normalized measure names, not code prefixes
- Band movement analysis at `/analysis/band-movement` tracks contract performance migration between star rating bands year-over-year
