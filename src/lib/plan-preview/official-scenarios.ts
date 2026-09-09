import { isInvertedMeasure } from "@/lib/percentile-analysis/inverted-measure";

import {
  buildPlanPreviewScenarios,
  type PlanPreviewCaiRecords,
  type PlanPreviewFinalScoresResult,
} from "./final-scores";
import { loadOfficialMeasureWeights } from "./official-cut-points";
import { toBaselineMeasureCode } from "./measure-resolve";
import type { PlanPreviewPredictionsResult } from "./predictions";
import type { OfficialStarRow, OfficialSummaryRow } from "./store-official";

const QI_WEIGHT = 5;

function emptyPredictions(starsYear: number): PlanPreviewPredictionsResult {
  return {
    starsYear,
    baselineYear: starsYear - 1,
    generatedAt: new Date().toISOString(),
    summary: {
      measureCount: 0,
      readyCount: 0,
      unavailableCount: 0,
      unsupportedCount: 0,
      warningCount: 0,
      accruedContractCount: 0,
      forecastFillCount: 0,
      cahpsPlanStarCount: 0,
    },
    cutPoints: [],
    contracts: [],
  };
}

function officialWeight(
  row: OfficialStarRow,
  baselineYear: number,
  weightByCode: Map<string, number>,
  officialByCode: Map<string, number>,
): number {
  const fromOfficial = officialByCode.get(row.measureCode.toUpperCase());
  if (fromOfficial != null && fromOfficial > 0) return fromOfficial;
  const code = toBaselineMeasureCode(row.measureNormalized, row.measureCode, baselineYear);
  const weight = weightByCode.get(code);
  if (weight != null && weight > 0) return weight;
  if (/quality improvement/i.test(row.measureDisplayName)) return QI_WEIGHT;
  return 1;
}

/** Official PP2 CAI by contract from the uploaded summary files. */
export function caiFromOfficialSummaries(
  summaries: OfficialSummaryRow[],
): PlanPreviewCaiRecords {
  const overall: Record<string, number> = {};
  const partC: Record<string, number> = {};
  const partD: Record<string, number> = {};
  for (const row of summaries) {
    if (row.caiValue === null) continue;
    if (row.ratingType === "overall") overall[row.contractId] = row.caiValue;
    else if (row.ratingType === "part_c") partC[row.contractId] = row.caiValue;
    else if (row.ratingType === "part_d") partD[row.contractId] = row.caiValue;
  }
  return { overall, partC, partD };
}

/**
 * Replace each official contract's predicted stars with published PP2 stars
 * so the shared scenario engine scores the official book.
 */
export function overlayOfficialStarsOnPredictions(
  predictions: PlanPreviewPredictionsResult | null,
  officialStars: OfficialStarRow[],
  weightByCode: Map<string, number>,
  starsYear?: number,
): PlanPreviewPredictionsResult {
  const year = predictions?.starsYear ?? starsYear ?? 2027;
  const base = predictions ?? emptyPredictions(year);
  const baselineYear = predictions?.baselineYear ?? year - 1;
  const officialByCode = loadOfficialMeasureWeights(year);
  const byContract = new Map<string, OfficialStarRow[]>();
  for (const row of officialStars) {
    const existing = byContract.get(row.contractId);
    if (existing) existing.push(row);
    else byContract.set(row.contractId, [row]);
  }

  const overlaid = [...base.contracts];
  const indexById = new Map(overlaid.map((contract, index) => [contract.contractId, index]));
  for (const [contractId, rows] of byContract) {
    const measures = rows.map((row) => ({
      measureNormalized: row.measureNormalized,
      displayName: row.measureDisplayName,
      measureCode: row.measureCode,
      score: null,
      weight: officialWeight(row, baselineYear ?? year - 1, weightByCode, officialByCode),
      inverted: isInvertedMeasure(row.measureDisplayName),
      predictedStar: row.star,
      starSource: row.star !== null ? ("cut_points" as const) : null,
      baseGroupStar: null,
      baselineOfficialStar: null,
      forecastStar: row.star,
      predictionStatus: row.star !== null ? ("ready" as const) : ("unavailable" as const),
    }));
    const rated = measures.filter((measure) => measure.predictedStar !== null).length;
    const replacement = {
      contractId,
      contractName: rows[0]?.contractName ?? null,
      parentOrganization: rows[0]?.parentOrganization ?? null,
      scoredMeasureCount: measures.length,
      ratedMeasureCount: rated,
      weightedMeanStar: null,
      measures,
    };
    const index = indexById.get(contractId);
    if (index === undefined) overlaid.push(replacement);
    else overlaid[index] = replacement;
  }

  return {
    ...base,
    starsYear: year,
    baselineYear,
    contracts: overlaid,
  };
}

export function buildOfficialRemovalScenarios(
  starsYear: number,
  predictions: PlanPreviewPredictionsResult | null,
  officialStars: OfficialStarRow[],
  officialSummaries: OfficialSummaryRow[],
  weightByCode: Map<string, number>,
): PlanPreviewFinalScoresResult[] {
  const overlaid = overlayOfficialStarsOnPredictions(
    predictions,
    officialStars,
    weightByCode,
    starsYear,
  );
  return buildPlanPreviewScenarios(overlaid, caiFromOfficialSummaries(officialSummaries), {
    preferWithQi: true,
    useOfficialRewardFactorThresholds: true,
  });
}
