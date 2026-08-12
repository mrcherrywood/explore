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
  const fingerprint = `${batches.length}:${batches[0]?.createdAt ?? "none"}`;

  const cached = cache.get(starsYear);
  if (cached && cached.fingerprint === fingerprint) return cached;

  const [rows, caiByContract] = await Promise.all([
    getPlanPreviewScoredRows(client, starsYear),
    getPlanPreviewCaiByContract(client, starsYear),
  ]);
  const result = buildPlanPreviewPredictions(rows, starsYear);
  const run: PlanPreviewRun = {
    fingerprint,
    result,
    scenarios: buildPlanPreviewScenarios(result, caiByContract),
    cai: caiByContract,
  };
  cache.set(starsYear, run);
  return run;
}
