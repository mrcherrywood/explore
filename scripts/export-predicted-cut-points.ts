/**
 * Manual / Official cut points vs live Full Market and Client Only models,
 * plus the overlay contracts that move those forecasts.
 *
 *   npm run export:predicted-cut-points
 *   npm run export:predicted-cut-points -- 2027
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadApprovedForecastSamplesForYear } from "@/lib/cutpoint-forecast/pp1-overlay";
import { buildCutPointAdditionExport } from "@/lib/plan-preview/cut-point-addition-export";
import {
  predictedCutPointAdditionsCsvString,
  predictedCutPointsCsvString,
} from "@/lib/plan-preview/predicted-cut-points-export";
import { getPlanPreviewRun } from "@/lib/plan-preview/run-cache";
import { getPlanPreviewScoredRows } from "@/lib/plan-preview/store";
import type { Database } from "@/lib/supabase/database.types";

config({ path: ".env.local" });

const starsYear = Number(process.argv[2] ?? 2027);
if (!Number.isFinite(starsYear)) {
  throw new Error(`Invalid stars year: ${process.argv[2]}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const sb = createClient<Database>(url, key);
  const [{ result }, rows, forecastOverlay] = await Promise.all([
    getPlanPreviewRun(sb, starsYear),
    getPlanPreviewScoredRows(sb, starsYear),
    loadApprovedForecastSamplesForYear(sb, starsYear),
  ]);
  const additions = buildCutPointAdditionExport(result, rows, forecastOverlay);
  const additionsByMeasure = new Map(
    additions.summaries.map((summary) => [summary.measureNormalized, summary] as const),
  );

  const outDir = path.join(process.cwd(), "data", "exports");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `predicted-cut-points-${starsYear}-${stamp}`;
  mkdirSync(outDir, { recursive: true });

  const measureCsvPath = path.join(outDir, `${base}.csv`);
  const additionsCsvPath = path.join(outDir, `${base}-additions.csv`);
  const jsonPath = path.join(outDir, `${base}.json`);

  writeFileSync(
    measureCsvPath,
    predictedCutPointsCsvString(result.cutPoints, additionsByMeasure),
    "utf8",
  );
  writeFileSync(
    additionsCsvPath,
    predictedCutPointAdditionsCsvString(additions.detailRows),
    "utf8",
  );
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        starsYear: result.starsYear,
        baselineYear: result.baselineYear,
        generatedAt: new Date().toISOString(),
        summary: result.summary,
        cutPoints: result.cutPoints,
        additions,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `Stars ${result.starsYear}: ${result.cutPoints.length} measures, ` +
      `${additions.detailRows.length} overlay contracts.`,
  );
  console.log(measureCsvPath);
  console.log(additionsCsvPath);
  console.log(jsonPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
