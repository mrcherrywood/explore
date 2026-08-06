/**
 * One-off / refresh helper: build the marketing PP1 sample from a real accrued
 * contract report (same pipeline + ma_measures domains as production), then
 * anonymize identity fields into marketing-sample-report.json.
 *
 *   npx tsx scripts/generate-marketing-pp1-sample.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync } from "fs";
import path from "path";

import {
  buildPlanPreviewContractReport,
  computeWeightedDomainMeans,
  type PublishedMeasureMeta,
} from "../src/lib/plan-preview/report-data";
import { getPlanPreviewRun } from "../src/lib/plan-preview/run-cache";
import type { Database } from "../src/lib/supabase/database.types";

config({ path: ".env.local" });

const SOURCE_CONTRACT = "H0885";
const STARS_YEAR = 2027;
const ANON_ID = "H4721";
const ANON_NAME = "Northstar Advantage (HMO)";
const ANON_ORG = "Northstar Health Partners";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const sb = createClient<Database>(url, key);
  const { result, scenarios, cai } = await getPlanPreviewRun(sb, STARS_YEAR);
  const contract = result.contracts.find((c) => c.contractId === SOURCE_CONTRACT);
  if (!contract) {
    throw new Error(
      `Contract ${SOURCE_CONTRACT} has no accrued plan preview scores for Stars ${STARS_YEAR}.`
    );
  }

  const domainByCode = new Map<string, string>();
  const measureMetaByCode = new Map<string, PublishedMeasureMeta>();
  let publishedDomainMeans: Map<string, number | null> | undefined;

  if (result.baselineYear !== null) {
    const [{ data: measureRows }, { data: metricRows }] = await Promise.all([
      sb
        .from("ma_measures")
        .select("code, domain, weight")
        .eq("year", result.baselineYear),
      sb
        .from("ma_metrics")
        .select("metric_code, star_rating")
        .eq("contract_id", SOURCE_CONTRACT)
        .eq("year", result.baselineYear),
    ]);

    for (const row of (measureRows ?? []) as {
      code: string;
      domain: string | null;
      weight: number | null;
    }[]) {
      const code = row.code.toUpperCase();
      if (row.domain) domainByCode.set(code, row.domain);
      measureMetaByCode.set(code, { domain: row.domain, weight: row.weight });
    }

    const starredMeasures = (
      (metricRows ?? []) as {
        metric_code: string | null;
        star_rating: string | number | null;
      }[]
    )
      .map((row) => ({
        code: String(row.metric_code ?? "").trim().toUpperCase(),
        star: Number(row.star_rating),
      }))
      .filter((row) => row.code && Number.isFinite(row.star) && row.star > 0);

    if (starredMeasures.length > 0 && measureMetaByCode.size > 0) {
      publishedDomainMeans = computeWeightedDomainMeans(
        starredMeasures,
        measureMetaByCode
      );
    }
  }

  const report = buildPlanPreviewContractReport({
    predictions: result,
    scenarios,
    contract,
    domainByCode,
    publishedDomainMeans,
    cai,
  });

  report.contract.contractId = ANON_ID;
  report.contract.contractName = ANON_NAME;
  report.contract.parentOrganization = ANON_ORG;
  report.contract.organizationType =
    report.contract.organizationType ?? "Local CCP";
  report.contract.snp = null;

  for (const scenario of report.scenarios) {
    if (scenario.score) {
      scenario.score.contractId = ANON_ID;
      scenario.score.contractName = ANON_NAME;
      scenario.score.parentOrganization = ANON_ORG;
    }
  }

  const outPath = path.join(
    process.cwd(),
    "src/lib/plan-preview/marketing-sample-report.json"
  );
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("Wrote", outPath);
  console.log(
    "Domains:",
    report.domains.map((d) => d.domain).join(", ")
  );
  console.log("Measures:", report.measures.length);
  console.log(
    "Baseline rating:",
    report.scenarios.find((s) => s.id === "baseline")?.score?.finalRating
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
