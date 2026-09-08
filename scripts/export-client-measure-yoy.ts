/**
 * Writes client measure year-over-year movement for every unified measure to
 * data/exports/ (detail CSV, summary CSV, and JSON).
 *
 * Detail: one row per client contract × measure × transition.
 * Summary: Declined / Held / Improved rollups per measure × transition.
 * Dropped contracts (no to-year star) are excluded.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildClientMeasureYoyExport,
  clientMeasureYoyDetailToCsv,
  clientMeasureYoySummaryToCsv,
} from "@/lib/band-movement/client-measure-yoy-export";

const outDir = path.join(process.cwd(), "data", "exports");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const base = `client-measure-yoy-${stamp}`;

mkdirSync(outDir, { recursive: true });

const bundle = buildClientMeasureYoyExport();
const detailCsvPath = path.join(outDir, `${base}.csv`);
const summaryCsvPath = path.join(outDir, `${base}-summary.csv`);
const jsonPath = path.join(outDir, `${base}.json`);

writeFileSync(detailCsvPath, clientMeasureYoyDetailToCsv(bundle), "utf8");
writeFileSync(summaryCsvPath, clientMeasureYoySummaryToCsv(bundle), "utf8");
writeFileSync(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

console.log(
  `Wrote ${bundle.detailRows.length} detail rows and ${bundle.summaryRows.length} summary rows ` +
    `(${bundle.clientContractCount} client contracts in filter; transitions ${bundle.transitions.join(", ")} → +1).`
);
console.log(detailCsvPath);
console.log(summaryCsvPath);
console.log(jsonPath);
