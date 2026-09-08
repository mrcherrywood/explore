/**
 * Writes client Stars finals vs Plan Preview 1 comparison to data/exports/.
 *
 * Prior year = latest published measure year (2026 for Stars 2027 PP1).
 * PP1 scores come from accrued Supabase plan_preview_* rows.
 *
 *   npm run export:client-pp1-vs-prior
 *   npm run export:client-pp1-vs-prior -- 2027
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadClientContractIds } from "@/lib/band-movement/cut-point-methodology";
import {
  buildClientPp1VsPriorExport,
  clientPp1VsPriorDetailToCsv,
  clientPp1VsPriorSummaryToCsv,
} from "@/lib/plan-preview/client-pp1-vs-prior-export";
import { getPlanPreviewRun } from "@/lib/plan-preview/run-cache";
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
  const clientIds = loadClientContractIds();
  const { result } = await getPlanPreviewRun(sb, starsYear);
  const bundle = buildClientPp1VsPriorExport(result, clientIds);

  const outDir = path.join(process.cwd(), "data", "exports");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `client-pp1-vs-prior-${starsYear}-${stamp}`;
  mkdirSync(outDir, { recursive: true });

  const detailCsvPath = path.join(outDir, `${base}.csv`);
  const summaryCsvPath = path.join(outDir, `${base}-summary.csv`);
  const jsonPath = path.join(outDir, `${base}.json`);

  writeFileSync(detailCsvPath, clientPp1VsPriorDetailToCsv(bundle), "utf8");
  writeFileSync(summaryCsvPath, clientPp1VsPriorSummaryToCsv(bundle), "utf8");
  writeFileSync(jsonPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  console.log(
    `Stars ${bundle.pp1StarsYear} PP1 vs ${bundle.priorYear ?? "n/a"} finals: ` +
      `${bundle.detailRows.length} detail rows, ${bundle.summaryRows.length} measures; ` +
      `${bundle.accruedClientContractCount}/${bundle.clientContractCount} client contracts in PP1 ` +
      `(${bundle.missingFromPp1Count} clients not yet accrued).`
  );
  console.log(detailCsvPath);
  console.log(summaryCsvPath);
  console.log(jsonPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
