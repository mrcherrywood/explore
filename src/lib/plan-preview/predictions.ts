import {
  getAvailableMeasureYears,
  getMeasureByNormalizedName,
  getMeasureYearScoreSamples,
  type MeasureScoreSample,
} from "@/lib/band-movement/analysis";
import {
  analyzeCutPointMethodologyForecast,
  ensureOfficialCutPoints,
  type MethodologyForecastThreshold,
} from "@/lib/band-movement/cut-point-methodology";
import { overlayProjectedSamples } from "@/lib/cutpoint-forecast/analysis";
import {
  deriveMeasureStarRating,
  isInvertedMeasure,
  matchCutPointToMeasureName,
} from "@/lib/percentile-analysis/measure-matching";
import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";

/** Accrued plan preview scores only cover MA contracts; S-prefix PDPs are excluded. */
const MA_CONTRACT_PATTERN = /^[HR]\d{4}$/;

export type AccruedMeasureScore = {
  contractId: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  parentOrganization: string | null;
  measureCode: string;
  measureDisplayName: string;
  measureNormalized: string;
  score: number;
};

export type PlanPreviewCutPointPrediction = {
  measureNormalized: string;
  displayName: string;
  measureCode: string | null;
  status: "ready" | "unavailable" | "unsupported";
  reason: string | null;
  method: "clustering" | "cahps-percentile" | null;
  inverted: boolean;
  accruedContractCount: number;
  matchedBaselineCount: number;
  appendedContractCount: number;
  baselineMarketCount: number;
  sampleSize: number | null;
  thresholds: MethodologyForecastThreshold[] | null;
  warningCount: number;
  notes: string[];
};

export type PlanPreviewContractMeasurePrediction = {
  measureNormalized: string;
  displayName: string;
  measureCode: string;
  score: number;
  weight: number;
  inverted: boolean;
  predictedStar: number | null;
  baselineOfficialStar: number | null;
  predictionStatus: PlanPreviewCutPointPrediction["status"];
};

export type PlanPreviewContractPrediction = {
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  scoredMeasureCount: number;
  ratedMeasureCount: number;
  weightedMeanStar: number | null;
  measures: PlanPreviewContractMeasurePrediction[];
};

export type PlanPreviewPredictionsResult = {
  starsYear: number;
  baselineYear: number | null;
  generatedAt: string;
  summary: {
    measureCount: number;
    readyCount: number;
    unavailableCount: number;
    unsupportedCount: number;
    warningCount: number;
    accruedContractCount: number;
  };
  cutPoints: PlanPreviewCutPointPrediction[];
  contracts: PlanPreviewContractPrediction[];
};

type ThresholdValuesShape = {
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
};

export function resolveBaselineYear(starsYear: number): number | null {
  const priorYears = getAvailableMeasureYears().filter((year) => year < starsYear);
  return priorYears.length > 0 ? Math.max(...priorYears) : null;
}

function thresholdsFromForecast(
  thresholds: MethodologyForecastThreshold[]
): ThresholdValuesShape | null {
  const byKey = new Map(thresholds.map((item) => [item.key, item.projected] as const));
  const twoStar = byKey.get("twoStar");
  const threeStar = byKey.get("threeStar");
  const fourStar = byKey.get("fourStar");
  const fiveStar = byKey.get("fiveStar");
  if (
    twoStar === undefined ||
    threeStar === undefined ||
    fourStar === undefined ||
    fiveStar === undefined
  ) {
    return null;
  }
  return { twoStar, threeStar, fourStar, fiveStar };
}

export function starFromThresholds(
  score: number,
  thresholds: ThresholdValuesShape,
  inverted: boolean
): number {
  if (inverted) {
    if (score <= thresholds.fiveStar) return 5;
    if (score <= thresholds.fourStar) return 4;
    if (score <= thresholds.threeStar) return 3;
    if (score <= thresholds.twoStar) return 2;
    return 1;
  }
  if (score >= thresholds.fiveStar) return 5;
  if (score >= thresholds.fourStar) return 4;
  if (score >= thresholds.threeStar) return 3;
  if (score >= thresholds.twoStar) return 2;
  return 1;
}

function lookupBaselineCutPoint(
  measureNormalized: string,
  displayName: string,
  measureCode: string | null,
  baselineYear: number | null
): MeasureCutPoint | null {
  if (baselineYear === null) return null;
  const cutPoints = ensureOfficialCutPoints().get(baselineYear) ?? [];
  const codePrefix = measureCode ? measureCode[0] : null;
  return matchCutPointToMeasureName(displayName, codePrefix, cutPoints);
}

export function buildPlanPreviewPredictions(
  rows: AccruedMeasureScore[],
  starsYear: number
): PlanPreviewPredictionsResult {
  const maRows = rows.filter((row) => MA_CONTRACT_PATTERN.test(row.contractId));
  const baselineYear = resolveBaselineYear(starsYear);

  const rowsByMeasure = new Map<string, AccruedMeasureScore[]>();
  for (const row of maRows) {
    const existing = rowsByMeasure.get(row.measureNormalized);
    if (existing) existing.push(row);
    else rowsByMeasure.set(row.measureNormalized, [row]);
  }

  const cutPoints: PlanPreviewCutPointPrediction[] = [];
  const readyThresholds = new Map<string, { thresholds: ThresholdValuesShape; inverted: boolean }>();
  const predictionStatusByMeasure = new Map<string, PlanPreviewCutPointPrediction["status"]>();

  for (const [measureNormalized, measureRows] of rowsByMeasure) {
    const displayName = measureRows[0].measureDisplayName;
    const measureCode = measureRows[0].measureCode;
    const inverted = isInvertedMeasure(displayName);
    const projectedSamples: MeasureScoreSample[] = measureRows.map((row) => ({
      contractId: row.contractId,
      score: row.score,
    }));

    const base: Omit<PlanPreviewCutPointPrediction, "status" | "reason"> = {
      measureNormalized,
      displayName,
      measureCode,
      method: null,
      inverted,
      accruedContractCount: projectedSamples.length,
      matchedBaselineCount: 0,
      appendedContractCount: 0,
      baselineMarketCount: 0,
      sampleSize: null,
      thresholds: null,
      warningCount: 0,
      notes: [],
    };

    if (baselineYear === null || !getMeasureByNormalizedName(measureNormalized)) {
      const reason =
        baselineYear === null
          ? "No published baseline year is available to anchor the prediction."
          : "Measure could not be matched to the published measure universe.";
      cutPoints.push({ ...base, status: "unavailable", reason });
      predictionStatusByMeasure.set(measureNormalized, "unavailable");
      continue;
    }

    const baselineSamples = getMeasureYearScoreSamples(measureNormalized, baselineYear);
    const baselineContractIds = new Set(baselineSamples.map((sample) => sample.contractId));
    const matchedBaselineCount = projectedSamples.filter((sample) =>
      baselineContractIds.has(sample.contractId)
    ).length;
    const anchoredSamples = overlayProjectedSamples(
      measureNormalized,
      projectedSamples,
      baselineYear
    );

    const result = analyzeCutPointMethodologyForecast(
      measureNormalized,
      starsYear,
      anchoredSamples,
      { baselineSamples, baselineYear }
    );

    const coverage = {
      matchedBaselineCount,
      appendedContractCount: projectedSamples.length - matchedBaselineCount,
      baselineMarketCount: baselineSamples.length,
    };

    if (result.status !== "ready") {
      cutPoints.push({
        ...base,
        ...coverage,
        status: result.status,
        reason: result.reason,
      });
      predictionStatusByMeasure.set(measureNormalized, result.status);
      continue;
    }

    const thresholdValues = thresholdsFromForecast(result.thresholds);
    if (thresholdValues) {
      readyThresholds.set(measureNormalized, { thresholds: thresholdValues, inverted: result.inverted });
    }
    predictionStatusByMeasure.set(measureNormalized, "ready");
    cutPoints.push({
      ...base,
      ...coverage,
      status: "ready",
      reason: null,
      method: result.methodology.method as "clustering" | "cahps-percentile",
      inverted: result.inverted,
      sampleSize: result.sampleSize,
      thresholds: result.thresholds,
      warningCount: result.historicalMovement?.warningCount ?? 0,
      notes: result.notes,
    });
  }

  cutPoints.sort((left, right) => left.displayName.localeCompare(right.displayName));

  const contracts = buildContractPredictions(
    maRows,
    readyThresholds,
    predictionStatusByMeasure,
    baselineYear
  );

  return {
    starsYear,
    baselineYear,
    generatedAt: new Date().toISOString(),
    summary: {
      measureCount: cutPoints.length,
      readyCount: cutPoints.filter((item) => item.status === "ready").length,
      unavailableCount: cutPoints.filter((item) => item.status === "unavailable").length,
      unsupportedCount: cutPoints.filter((item) => item.status === "unsupported").length,
      warningCount: cutPoints.reduce((sum, item) => sum + item.warningCount, 0),
      accruedContractCount: new Set(maRows.map((row) => row.contractId)).size,
    },
    cutPoints,
    contracts,
  };
}

function buildContractPredictions(
  rows: AccruedMeasureScore[],
  readyThresholds: Map<string, { thresholds: ThresholdValuesShape; inverted: boolean }>,
  predictionStatusByMeasure: Map<string, PlanPreviewCutPointPrediction["status"]>,
  baselineYear: number | null
): PlanPreviewContractPrediction[] {
  const rowsByContract = new Map<string, AccruedMeasureScore[]>();
  for (const row of rows) {
    const existing = rowsByContract.get(row.contractId);
    if (existing) existing.push(row);
    else rowsByContract.set(row.contractId, [row]);
  }

  const contracts: PlanPreviewContractPrediction[] = [];

  for (const [contractId, contractRows] of rowsByContract) {
    const measures: PlanPreviewContractMeasurePrediction[] = [];
    let weightedStarSum = 0;
    let weightSum = 0;

    for (const row of contractRows) {
      const inverted = isInvertedMeasure(row.measureDisplayName);
      const ready = readyThresholds.get(row.measureNormalized) ?? null;
      const baselineCutPoint = lookupBaselineCutPoint(
        row.measureNormalized,
        row.measureDisplayName,
        row.measureCode,
        baselineYear
      );
      const weight = baselineCutPoint?.weight ?? 1;
      const predictedStar = ready
        ? starFromThresholds(row.score, ready.thresholds, ready.inverted)
        : null;
      const baselineOfficialStar = baselineCutPoint
        ? deriveMeasureStarRating(row.score, baselineCutPoint, inverted)
        : null;

      if (predictedStar !== null) {
        weightedStarSum += predictedStar * weight;
        weightSum += weight;
      }

      measures.push({
        measureNormalized: row.measureNormalized,
        displayName: row.measureDisplayName,
        measureCode: row.measureCode,
        score: row.score,
        weight,
        inverted,
        predictedStar,
        baselineOfficialStar,
        predictionStatus: predictionStatusByMeasure.get(row.measureNormalized) ?? "unavailable",
      });
    }

    measures.sort((left, right) => left.displayName.localeCompare(right.displayName));

    contracts.push({
      contractId,
      contractName: contractRows[0].contractName ?? contractRows[0].organizationMarketingName,
      parentOrganization: contractRows[0].parentOrganization,
      scoredMeasureCount: measures.length,
      ratedMeasureCount: measures.filter((measure) => measure.predictedStar !== null).length,
      weightedMeanStar: weightSum > 0 ? Math.round((weightedStarSum / weightSum) * 100) / 100 : null,
      measures,
    });
  }

  return contracts.sort((left, right) => left.contractId.localeCompare(right.contractId));
}
