import {
  getAvailableMeasureYears,
  getMeasureByNormalizedName,
  getMeasureYearScoreSamples,
  type MeasureScoreSample,
} from "@/lib/band-movement/analysis";
import {
  analyzeCutPointMethodologyForecast,
  ensureOfficialCutPoints,
  getWorkbookCutPointsForYear,
  isCahpsMeasure,
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
  /** Display / effective score (decimal overlay when present). */
  score: number;
  /**
   * Whole-number measure_data score used for cut-point banding. Null when only
   * a domain decimal was uploaded.
   */
  wholeScore?: number | null;
};

export type PlanPreviewCutPointSource = "official" | "workbook_forecast" | "model";

export type PlanPreviewCutPointPrediction = {
  measureNormalized: string;
  displayName: string;
  measureCode: string | null;
  status: "ready" | "unavailable" | "unsupported";
  reason: string | null;
  method: "clustering" | "cahps-percentile" | null;
  /**
   * Where the applied thresholds come from: official published cut points
   * (SY2027 CAHPS), the workbook's forecast rows, or the model when the
   * workbook has no row for this measure/year.
   */
  source: PlanPreviewCutPointSource;
  inverted: boolean;
  accruedContractCount: number;
  matchedBaselineCount: number;
  appendedContractCount: number;
  baselineMarketCount: number;
  sampleSize: number | null;
  /** Thresholds applied when rating contracts. */
  thresholds: MethodologyForecastThreshold[] | null;
  /** Model-predicted thresholds, always recomputed as data accrues. */
  modelThresholds: MethodologyForecastThreshold[] | null;
  warningCount: number;
  notes: string[];
};

/** How the predicted measure star was assigned. */
export type PlanPreviewStarSource = "cut_points" | "cahps_case_mix_reliability";

export type PlanPreviewContractMeasurePrediction = {
  measureNormalized: string;
  displayName: string;
  measureCode: string;
  score: number;
  weight: number;
  inverted: boolean;
  predictedStar: number | null;
  /**
   * When set to cahps_case_mix_reliability, the star comes from the uploaded
   * MCAHPS Adjusted_Base_Star (case-mix + reliability) rather than banding
   * the PP1 score against projected cut points.
   */
  starSource: PlanPreviewStarSource | null;
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
    /** Contract×measure cells using MCAHPS adjusted base stars. */
    cahpsAdjustedStarCount: number;
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

/**
 * CMS cut points are applied to whole-number published scores. Prefer the
 * measure_data integer when present; otherwise round the decimal overlay.
 * CAHPS keeps the continuous score (case-mix adjusted stars overlay separately).
 */
export function scoreForCutPointBanding(
  score: number,
  wholeScore: number | null | undefined,
  isCahps: boolean
): number {
  if (isCahps) return score;
  // Prefer measure_data's published whole number when present; always round so
  // a decimal-only stub (score column = 70.68) still bands like CMS (71).
  const candidate =
    wholeScore !== null && wholeScore !== undefined && Number.isFinite(wholeScore)
      ? wholeScore
      : score;
  return Math.round(candidate);
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

const THRESHOLD_ENTRIES: { key: MethodologyForecastThreshold["key"]; label: string }[] = [
  { key: "twoStar", label: "2★ Threshold" },
  { key: "threeStar", label: "3★ Threshold" },
  { key: "fourStar", label: "4★ Threshold" },
  { key: "fiveStar", label: "5★ Threshold" },
];

/** Workbook cut point values presented in the same shape as model forecasts. */
function thresholdsFromWorkbook(
  workbookRow: MeasureCutPoint,
  baselineCutPoint: MeasureCutPoint | null
): MethodologyForecastThreshold[] {
  return THRESHOLD_ENTRIES.map(({ key, label }) => {
    const projected = workbookRow.thresholds[key];
    const comparisonActual = baselineCutPoint?.thresholds[key] ?? null;
    const delta =
      comparisonActual !== null ? Math.round((projected - comparisonActual) * 100) / 100 : null;
    return {
      key,
      label,
      projected,
      comparisonActual,
      deltaVsComparison: delta,
      absDeltaVsComparison: delta !== null ? Math.abs(delta) : null,
      rawSimulated: null,
      baselineSimulated: null,
      anchoredMovement: null,
      movementCap: null,
      movementWasCapped: false,
    };
  });
}

/** Largest absolute gap between the model projection and the applied workbook values. */
function maxModelDivergence(
  applied: ThresholdValuesShape,
  modelThresholds: MethodologyForecastThreshold[]
): number | null {
  const byKey = new Map(modelThresholds.map((item) => [item.key, item.projected] as const));
  let max: number | null = null;
  for (const { key } of THRESHOLD_ENTRIES) {
    const model = byKey.get(key);
    if (model === undefined) continue;
    const diff = Math.abs(model - applied[key]);
    if (max === null || diff > max) max = diff;
  }
  return max;
}

export type CahpsAdjustedStarLookup = {
  contractId: string;
  measureNormalized: string;
  adjustedBaseStar: number;
};

export function buildPlanPreviewPredictions(
  rows: AccruedMeasureScore[],
  starsYear: number,
  options?: { cahpsAdjustedStars?: CahpsAdjustedStarLookup[] }
): PlanPreviewPredictionsResult {
  const maRows = rows.filter((row) => MA_CONTRACT_PATTERN.test(row.contractId));
  const baselineYear = resolveBaselineYear(starsYear);
  const adjustedByKey = new Map<string, number>();
  for (const item of options?.cahpsAdjustedStars ?? []) {
    if (!MA_CONTRACT_PATTERN.test(item.contractId)) continue;
    adjustedByKey.set(`${item.contractId}|${item.measureNormalized}`, item.adjustedBaseStar);
  }

  const rowsByMeasure = new Map<string, AccruedMeasureScore[]>();
  for (const row of maRows) {
    const existing = rowsByMeasure.get(row.measureNormalized);
    if (existing) existing.push(row);
    else rowsByMeasure.set(row.measureNormalized, [row]);
  }

  const cutPoints: PlanPreviewCutPointPrediction[] = [];
  const readyThresholds = new Map<string, { thresholds: ThresholdValuesShape; inverted: boolean }>();
  const predictionStatusByMeasure = new Map<string, PlanPreviewCutPointPrediction["status"]>();
  const workbookCutPoints = getWorkbookCutPointsForYear(starsYear);

  for (const [measureNormalized, measureRows] of rowsByMeasure) {
    const displayName = measureRows[0].measureDisplayName;
    const measureCode = measureRows[0].measureCode;
    const inverted = isInvertedMeasure(displayName);
    const isCahps = isCahpsMeasure(displayName);
    const codePrefix = measureCode ? measureCode[0] : null;
    const workbookRow = matchCutPointToMeasureName(displayName, codePrefix, workbookCutPoints);
    const baselineCutPoint = lookupBaselineCutPoint(
      measureNormalized,
      displayName,
      measureCode,
      baselineYear
    );
    const projectedSamples: MeasureScoreSample[] = measureRows.map((row) => ({
      contractId: row.contractId,
      score: scoreForCutPointBanding(row.score, row.wholeScore, isCahps),
    }));

    const base: Omit<PlanPreviewCutPointPrediction, "status" | "reason"> = {
      measureNormalized,
      displayName,
      measureCode,
      method: null,
      source: "model",
      inverted,
      accruedContractCount: projectedSamples.length,
      matchedBaselineCount: 0,
      appendedContractCount: 0,
      baselineMarketCount: 0,
      sampleSize: null,
      thresholds: null,
      modelThresholds: null,
      warningCount: 0,
      notes: [],
    };

    const inUniverse =
      baselineYear !== null && getMeasureByNormalizedName(measureNormalized) !== null;
    // The model needs a published baseline; CAHPS with official workbook cut
    // points skips the model entirely (CMS has already set the thresholds).
    const canRunModel = inUniverse && !(isCahps && workbookRow);

    let modelResult: ReturnType<typeof analyzeCutPointMethodologyForecast> | null = null;
    let coverage = {
      matchedBaselineCount: 0,
      appendedContractCount: 0,
      baselineMarketCount: 0,
    };

    if (inUniverse) {
      const baselineSamples = getMeasureYearScoreSamples(measureNormalized, baselineYear!);
      const baselineContractIds = new Set(baselineSamples.map((sample) => sample.contractId));
      const matchedBaselineCount = projectedSamples.filter((sample) =>
        baselineContractIds.has(sample.contractId)
      ).length;
      coverage = {
        matchedBaselineCount,
        appendedContractCount: projectedSamples.length - matchedBaselineCount,
        baselineMarketCount: baselineSamples.length,
      };
      if (canRunModel) {
        const anchoredSamples = overlayProjectedSamples(
          measureNormalized,
          projectedSamples,
          baselineYear!
        );
        modelResult = analyzeCutPointMethodologyForecast(
          measureNormalized,
          starsYear,
          anchoredSamples,
          { baselineSamples, baselineYear: baselineYear! }
        );
      }
    }

    const readyModel = modelResult !== null && modelResult.status === "ready" ? modelResult : null;
    const modelThresholds = readyModel?.thresholds ?? null;

    if (workbookRow) {
      // Workbook thresholds are applied: official CAHPS values, or the
      // maintained forecast for everything else. The model keeps running as
      // data accrues so divergence can flag a workbook row worth revisiting.
      const applied: ThresholdValuesShape = {
        twoStar: workbookRow.thresholds.twoStar,
        threeStar: workbookRow.thresholds.threeStar,
        fourStar: workbookRow.thresholds.fourStar,
        fiveStar: workbookRow.thresholds.fiveStar,
      };
      readyThresholds.set(measureNormalized, { thresholds: applied, inverted });
      predictionStatusByMeasure.set(measureNormalized, "ready");

      const notes: string[] = [];
      if (isCahps) {
        notes.push(`Official Stars ${starsYear} CAHPS cut points from the cut point workbook.`);
      } else {
        notes.push(
          `Workbook forecast cut points applied for Stars ${starsYear}; the model re-predicts as scores accrue.`
        );
        if (modelThresholds) {
          const divergence = maxModelDivergence(applied, modelThresholds);
          if (divergence !== null && divergence > 1) {
            notes.push(
              `Model prediction diverges from the workbook forecast by up to ${divergence.toFixed(1)} points — revisit the workbook row if this persists as coverage grows.`
            );
          }
        }
      }
      if (modelResult && modelResult.status !== "ready" && !isCahps) {
        notes.push(`Model prediction unavailable: ${modelResult.reason ?? "insufficient data"}.`);
      }

      cutPoints.push({
        ...base,
        ...coverage,
        status: "ready",
        reason: null,
        method: readyModel
          ? (readyModel.methodology.method as "clustering" | "cahps-percentile")
          : null,
        source: isCahps ? "official" : "workbook_forecast",
        inverted,
        sampleSize: readyModel?.sampleSize ?? null,
        thresholds: thresholdsFromWorkbook(workbookRow, baselineCutPoint),
        modelThresholds,
        warningCount: readyModel?.historicalMovement?.warningCount ?? 0,
        notes: [...notes, ...(readyModel?.notes ?? [])],
      });
      continue;
    }

    // No workbook row for this measure/year: the model prediction is applied.
    if (!canRunModel) {
      const reason =
        baselineYear === null
          ? "No published baseline year is available to anchor the prediction."
          : "Measure could not be matched to the published measure universe.";
      cutPoints.push({ ...base, status: "unavailable", reason });
      predictionStatusByMeasure.set(measureNormalized, "unavailable");
      continue;
    }

    if (!readyModel) {
      const status = (modelResult!.status === "unsupported" ? "unsupported" : "unavailable") as
        | "unavailable"
        | "unsupported";
      cutPoints.push({
        ...base,
        ...coverage,
        status,
        reason: modelResult!.status === "ready" ? null : modelResult!.reason,
      });
      predictionStatusByMeasure.set(measureNormalized, status);
      continue;
    }

    const thresholdValues = thresholdsFromForecast(readyModel.thresholds);
    if (thresholdValues) {
      readyThresholds.set(measureNormalized, {
        thresholds: thresholdValues,
        inverted: readyModel.inverted,
      });
    }
    predictionStatusByMeasure.set(measureNormalized, "ready");
    cutPoints.push({
      ...base,
      ...coverage,
      status: "ready",
      reason: null,
      method: readyModel.methodology.method as "clustering" | "cahps-percentile",
      source: "model",
      inverted: readyModel.inverted,
      sampleSize: readyModel.sampleSize,
      thresholds: readyModel.thresholds,
      modelThresholds: readyModel.thresholds,
      warningCount: readyModel.historicalMovement?.warningCount ?? 0,
      notes: readyModel.notes,
    });
  }

  cutPoints.sort((left, right) => left.displayName.localeCompare(right.displayName));

  const contracts = buildContractPredictions(
    maRows,
    readyThresholds,
    predictionStatusByMeasure,
    baselineYear,
    adjustedByKey
  );

  const cahpsAdjustedStarCount = contracts.reduce(
    (sum, contract) =>
      sum +
      contract.measures.filter((measure) => measure.starSource === "cahps_case_mix_reliability")
        .length,
    0
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
      cahpsAdjustedStarCount,
    },
    cutPoints,
    contracts,
  };
}

function buildContractPredictions(
  rows: AccruedMeasureScore[],
  readyThresholds: Map<string, { thresholds: ThresholdValuesShape; inverted: boolean }>,
  predictionStatusByMeasure: Map<string, PlanPreviewCutPointPrediction["status"]>,
  baselineYear: number | null,
  adjustedByKey: Map<string, number>
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
      const isCahps = isCahpsMeasure(row.measureDisplayName);
      const bandingScore = scoreForCutPointBanding(row.score, row.wholeScore, isCahps);
      const adjustedStar = adjustedByKey.get(`${contractId}|${row.measureNormalized}`) ?? null;
      const cutPointStar = ready
        ? starFromThresholds(bandingScore, ready.thresholds, ready.inverted)
        : null;
      const predictedStar = adjustedStar ?? cutPointStar;
      const starSource: PlanPreviewStarSource | null =
        adjustedStar !== null
          ? "cahps_case_mix_reliability"
          : cutPointStar !== null
            ? "cut_points"
            : null;
      const baselineOfficialStar = baselineCutPoint
        ? deriveMeasureStarRating(bandingScore, baselineCutPoint, inverted)
        : null;
      const predictionStatus =
        adjustedStar !== null
          ? ("ready" as const)
          : (predictionStatusByMeasure.get(row.measureNormalized) ?? "unavailable");

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
        starSource,
        baselineOfficialStar,
        predictionStatus,
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
