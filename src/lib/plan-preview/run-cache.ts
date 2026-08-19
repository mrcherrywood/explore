import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  buildPlanPreviewScenarios,
  type PlanPreviewCaiRecords,
  type PlanPreviewFinalScoresResult,
} from "./final-scores";
import {
  buildPlanPreviewPredictions,
  type PlanPreviewPredictionsResult,
} from "./predictions";
import {
  emptyForecastYearEndOverlay,
  loadApprovedForecastSamplesForYear,
} from "@/lib/cutpoint-forecast/pp1-overlay";
import { getLatestForecastRunForYear } from "@/lib/cutpoint-forecast/store";

import {
  getPlanPreviewCaiByContract,
  getPlanPreviewScoredRows,
  listPlanPreviewBatches,
} from "./store";

type ServiceClient = SupabaseClient<Database>;

export type PlanPreviewRun = {
  fingerprint: string;
  result: PlanPreviewPredictionsResult;
  scenarios: PlanPreviewFinalScoresResult[];
  cai: PlanPreviewCaiRecords;
};

// Clustering across every accrued measure takes a few seconds; cache per stars
// year for the process lifetime and invalidate when uploads change.
const cache = new Map<number, PlanPreviewRun>();

/** Build (or reuse) the full prediction + scenario run for a stars year. */
export async function getPlanPreviewRun(
  client: ServiceClient,
  starsYear: number
): Promise<PlanPreviewRun> {
  const batches = await listPlanPreviewBatches(client, starsYear);
  const year = Math.round(starsYear);
  const [nonCahpsRun, cahpsRun] = await Promise.all([
    getLatestForecastRunForYear(client, year, "approved", "non_cahps").catch(
      () => null,
    ),
    getLatestForecastRunForYear(client, year, "approved", "cahps").catch(
      () => null,
    ),
  ]);
  const forecastFingerprint =
    [nonCahpsRun?.id, cahpsRun?.id].filter(Boolean).join(",") || "none";
  const fingerprint = `${batches.length}:${batches[0]?.createdAt ?? "none"}:fc:${forecastFingerprint}`;

  const cached = cache.get(starsYear);
  if (cached && cached.fingerprint === fingerprint) return cached;

  const [rows, caiByContract, forecastOverlay] = await Promise.all([
    getPlanPreviewScoredRows(client, starsYear),
    getPlanPreviewCaiByContract(client, starsYear),
    loadApprovedForecastSamplesForYear(client, starsYear).catch(() =>
      emptyForecastYearEndOverlay(),
    ),
  ]);
  const result = buildPlanPreviewPredictions(rows, starsYear, forecastOverlay);
  const run: PlanPreviewRun = {
    fingerprint,
    result,
    scenarios: buildPlanPreviewScenarios(result, caiByContract),
    cai: caiByContract,
  };
  cache.set(starsYear, run);
  return run;
}
