/**
 * Aetna (CVS Health) vs rest of the approved forecast book, by measure.
 *
 *   npm run export:aetna-book-compare
 *   npm run export:aetna-book-compare -- 2027
 *   npm run export:aetna-book-compare -- 2027 "/path/to/Press Ganey.xlsx"
 *
 * Optional Press Ganey file overlays Aetna GSD month-12 rates into this
 * workbook only. It does not write scores back to the forecast book.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { excludeUntrustedForecastProjections } from "@/lib/cutpoint-forecast/exclusions";
import { isEligibleOverlayContract } from "@/lib/cutpoint-forecast/pp1-overlay";
import {
  getAllForecastProjectionsForRun,
  getForecastBookRun,
} from "@/lib/cutpoint-forecast/store";
import { parseForecastWorkbook } from "@/lib/cutpoint-forecast/workbook";
import {
  buildAetnaBookCompare,
  buildAetnaBookCompareWorkbook,
  loadAetnaBookMetadata,
  priorScoresByMeasure,
  type AetnaBookScoreInput,
} from "@/lib/plan-preview/aetna-book-compare";
import {
  gsdYearEndFromImportedRows,
  mergeMissingBookScores,
} from "@/lib/plan-preview/aetna-book-gsd-overlay";
import type { Database } from "@/lib/supabase/database.types";

config({ path: ".env.local" });

const DEFAULT_GSD_FILE =
  "/Users/joshuarenken/Dropbox/Mac/Downloads/Press Ganey Output_09_04_2026.xlsx";

const starsYear = Number(process.argv[2] ?? 2027);
if (!Number.isFinite(starsYear)) {
  throw new Error(`Invalid stars year: ${process.argv[2]}`);
}

const gsdFilePath = process.argv[3] ?? DEFAULT_GSD_FILE;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const sb = createClient<Database>(url, key);
  const priorYear = starsYear - 1;
  const runs = await Promise.all([
    getForecastBookRun(sb, starsYear, "non_cahps", { approvedOnly: true }),
    getForecastBookRun(sb, starsYear, "cahps", { approvedOnly: true }),
  ]);

  let projections: AetnaBookScoreInput[] = [];
  for (const run of runs) {
    if (!run) continue;
    const rows = excludeUntrustedForecastProjections(
      await getAllForecastProjectionsForRun(sb, run.id),
    );
    for (const row of rows) {
      const contractId = row.contractId.trim().toUpperCase();
      if (!isEligibleOverlayContract(contractId)) continue;
      if (!Number.isFinite(row.finalScore)) continue;
      projections.push({
        contractId,
        measureNormalized: row.measureNormalized,
        measureDisplayName: row.measureDisplayName,
        measureCode: row.measureCode,
        metricCategory: row.metricCategory,
        score: row.finalScore,
      });
    }
  }

  if (projections.length === 0) {
    throw new Error(`No approved forecast book scores for Stars ${starsYear}.`);
  }

  let bookNote =
    "Approved forecast year-end scores (H+R). Aetna GSD (Diabetes Care – Blood Sugar Controlled) is excluded as untrusted.";
  let gsdAdded = 0;
  if (existsSync(gsdFilePath)) {
    const parsed = parseForecastWorkbook(readFileSync(gsdFilePath));
    const merged = mergeMissingBookScores(
      projections,
      gsdYearEndFromImportedRows(parsed.rows, starsYear),
    );
    projections = merged.rows;
    gsdAdded = merged.added;
    bookNote =
      "Approved forecast year-end scores (H+R). Aetna GSD month-12 rates are overlaid from the Press Ganey extract for this file only and are not written back to the forecast book.";
  } else if (process.argv[3]) {
    throw new Error(`GSD overlay file not found: ${gsdFilePath}`);
  }

  const bundle = buildAetnaBookCompare({
    starsYear,
    priorYear,
    projections,
    metadata: loadAetnaBookMetadata(priorYear),
    priorByMeasure: priorScoresByMeasure(
      projections.map((row) => row.measureNormalized),
      priorYear,
    ),
    bookNote,
  });

  const outDir = path.join(process.cwd(), "data", "exports");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(
    outDir,
    `aetna-vs-book-${starsYear}-${stamp}.xlsx`,
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, buildAetnaBookCompareWorkbook(bundle));

  const better = bundle.measures.filter((row) => row.aetnaVsBook === "Better").length;
  const worse = bundle.measures.filter((row) => row.aetnaVsBook === "Worse").length;
  console.log(
    `Stars ${starsYear}: ${bundle.aetnaContractCount} Aetna contracts vs ` +
      `${bundle.restContractCount} rest-of-book; ${bundle.measures.length} measures ` +
      `(Aetna better ${better}, worse ${worse}` +
      (gsdAdded > 0 ? `; GSD overlay ${gsdAdded} contracts from file` : "") +
      `).`,
  );
  console.log(outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
