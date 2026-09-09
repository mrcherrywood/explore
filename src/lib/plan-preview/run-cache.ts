import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  buildPlanPreviewBaselineScenario,
  buildPlanPreviewScenarios,
  type PlanPreviewCaiRecords,
  type PlanPreviewFinalScoresResult,
} from "./final-scores";
import {
  buildPlanPreviewPredictions,
  withForecastStars,
  type PlanPreviewPredictionsResult,
} from "./predictions";
import {
  emptyForecastYearEndOverlay,
  loadApprovedForecastSamplesForYear,
} from "@/lib/cutpoint-forecast/pp1-overlay";
import { getForecastBookRun } from "@/lib/cutpoint-forecast/store";

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
  /**
   * Baseline scenario rated on PP1 forecast stars (pre-Tech-Notes cut
   * points). Same object as scenarios[0] until official cut points diverge.
   */
  forecastBaseline: PlanPreviewFinalScoresResult;
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
    getForecastBookRun(client, year, "non_cahps", { approvedOnly: true }).catch(
      () => null,
    ),
    getForecastBookRun(client, year, "cahps", { approvedOnly: true }).catch(
      () => null,
    ),
  ]);
  // Imports accrue onto the same book run, so key on its last update too.
  const forecastFingerprint =
    [nonCahpsRun, cahpsRun]
      .filter((run) => run !== null)
      .map((run) => `${run.id}@${run.updatedAt}:${run.projectionCount}`)
      .join(",") || "none";
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
  const scenarios = buildPlanPreviewScenarios(result, caiByContract);
  const forecastResult = withForecastStars(result);
  const run: PlanPreviewRun = {
    fingerprint,
    result,
    scenarios,
    forecastBaseline:
      forecastResult === result
        ? scenarios[0]
        : buildPlanPreviewBaselineScenario(forecastResult, caiByContract),
    cai: caiByContract,
  };
  cache.set(starsYear, run);
  return run;
}
