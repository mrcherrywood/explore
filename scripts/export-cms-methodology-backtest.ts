/**
 * Writes CMS cut point methodology backtest data for every unified measure to
 * data/exports/ (CSV + JSON). Matches the “Actual vs Simulated Cut Points” UI
 * (full market vs client-only; Diff = client simulated − full market simulated).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildMethodologyBacktestExport,
  methodologyBacktestExportToCsv,
} from "@/lib/band-movement/cut-point-methodology";

const outDir = path.join(process.cwd(), "data", "exports");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const base = `cms-methodology-backtest-${stamp}`;

mkdirSync(outDir, { recursive: true });

const bundle = buildMethodologyBacktestExport();
const csvPath = path.join(outDir, `${base}.csv`);
const jsonPath = path.join(outDir, `${base}.json`);

writeFileSync(csvPath, methodologyBacktestExportToCsv(bundle), "utf8");
writeFileSync(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

console.log(`Wrote ${bundle.rows.length} rows (${bundle.clientContractCount} client contracts in filter).`);
console.log(csvPath);
console.log(jsonPath);
