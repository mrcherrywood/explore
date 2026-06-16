import { readFileSync } from "node:fs";
import path from "node:path";

import * as XLSX from "xlsx";

import {
  getAvailableMeasureYears,
  getAvailableOptions,
  getMeasureByNormalizedName,
  getMeasureYearScoreSamples,
  type MeasureScoreSample,
  type UnifiedMeasure,
} from "./analysis";
import {
  isInvertedMeasure,
  loadMeasureCutPoints,
  matchCutPointToMeasureName,
  normalizeMeasureName,
} from "@/lib/percentile-analysis/measure-matching";
import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";

const DATA_DIR = path.join(process.cwd(), "data");
const CUT_POINTS_PATH = path.join(DATA_DIR, "Stars 2016-2028 Cut Points 12.2025_with_weights.xlsx");
const CLIENT_CONTRACTS_PATH = path.join(DATA_DIR, "client-contracts.xlsx");
const RESAMPLE_FOLD_COUNT = 10;
const RESAMPLE_SEED = 8675309;
const TUKEY_START_YEAR = 2024;
const THRESHOLD_KEYS = ["twoStar", "threeStar", "fourStar", "fiveStar"] as const;
const THRESHOLD_LABELS: Record<ThresholdKey, string> = {
  twoStar: "2★ Threshold",
  threeStar: "3★ Threshold",
  fourStar: "4★ Threshold",
  fiveStar: "5★ Threshold",
};
const CAHPS_MEASURE_NAMES = new Set([
  "annual flu vaccine",
  "getting needed care",
  "getting appointments and care quickly",
  "customer service",
  "rating of health care quality",
  "rating of health plan",
  "care coordination",
  "getting needed prescription drugs",
  "rating of drug plan",
]);
const HOS_MEASURE_NAMES = new Set([
  "improving or maintaining physical health",
  "improving or maintaining mental health",
  "monitoring physical activity",
  "reducing the risk of falling",
  "improving bladder control",
]);
const CAHPS_PERCENTILES = { twoStar: 0.15, threeStar: 0.30, fourStar: 0.60, fiveStar: 0.80 } as const;

type ThresholdKey = typeof THRESHOLD_KEYS[number];
type ThresholdValues = Record<ThresholdKey, number>;

export type MethodologyThresholdComparison = {
  key: ThresholdKey;
  label: string;
  actual: number;
  simulated: number;
  delta: number;
  absError: number;
};

export type MethodologyBacktestYear = {
  year: number;
  rawSampleSize: number;
  sampleSize: number;
  resampleRuns: number;
  outliersRemoved: number;
  tukeyApplied: boolean;
  guardrailsApplied: boolean;
  guardrailCap: number | null;
  meanAbsoluteError: number;
  maxAbsoluteError: number;
  thresholdComparisons: MethodologyThresholdComparison[];
  notes: string[];
};

export type MethodologyBacktestReadyResponse = {
  status: "ready";
  measure: string;
  displayName: string;
  inverted: boolean;
  supportedYears: number[];
  years: MethodologyBacktestYear[];
  summary: {
    comparedYears: number;
    avgMeanAbsoluteError: number;
    bestYear: number | null;
    worstYear: number | null;
  };
  methodology: {
    method: "clustering" | "cahps-percentile";
    foldCount: number;
    seed: number;
    tukeyStartsIn: number;
    exclusions: string[];
  };
};

export type MethodologyBacktestUnsupportedResponse = {
  status: "unsupported";
  measure: string;
  displayName: string;
  reason: string;
};

export type MethodologyBacktestResponse =
  | MethodologyBacktestReadyResponse
  | MethodologyBacktestUnsupportedResponse;

export type MethodologyForecastThreshold = {
  key: ThresholdKey;
  label: string;
  projected: number;
  comparisonActual: number | null;
  deltaVsComparison: number | null;
  absDeltaVsComparison: number | null;
  rawSimulated: number | null;
  baselineSimulated: number | null;
  anchoredMovement: number | null;
  movementCap: number | null;
  movementWasCapped: boolean;
};

export type HistoricalMovementCheck = {
  key: ThresholdKey;
  label: string;
  projectedDelta: number | null;
  recentDeltas: number[];
  recentMinDelta: number | null;
  recentMaxDelta: number | null;
  recentP90AbsDelta: number | null;
  recentMaxAbsDelta: number | null;
  isOutsideRecentRange: boolean;
  isAboveRecentP90: boolean;
  message: string | null;
};

export type HistoricalMovementAudit = {
  comparisonYear: number | null;
  historicalYears: number[];
  checks: HistoricalMovementCheck[];
  warningCount: number;
};

export type MethodologyForecastReadyResponse = {
  status: "ready";
  measure: string;
  displayName: string;
  forecastYear: number;
  comparisonYear: number | null;
  inverted: boolean;
  sampleSize: number;
  rawSampleSize: number;
  resampleRuns: number;
  outliersRemoved: number;
  tukeyApplied: boolean;
  guardrailsApplied: boolean;
  guardrailCap: number | null;
  thresholds: MethodologyForecastThreshold[];
  historicalMovement: HistoricalMovementAudit | null;
  notes: string[];
  methodology: {
    method: "clustering" | "cahps-percentile";
    foldCount: number;
    seed: number;
    tukeyStartsIn: number;
    exclusions: string[];
  };
};

export type MethodologyForecastUnavailableResponse = {
  status: "unavailable";
  measure: string;
  displayName: string;
  forecastYear: number;
  reason: string;
};

export type MethodologyForecastResponse =
  | MethodologyForecastReadyResponse
  | MethodologyBacktestUnsupportedResponse
  | MethodologyForecastUnavailableResponse;

type WardCluster = {
  min: number;
  max: number;
  mean: number;
  count: number;
};

type ScaleBounds = {
  min: number;
  max: number;
  isPercentageScale: boolean;
};

type TukeyFilterResult = {
  samples: MeasureScoreSample[];
  outliersRemoved: number;
  fences: { lower: number; upper: number };
};

let officialCutPointsCache: Map<number, MeasureCutPoint[]> | null = null;
let clientContractIdsCache: Set<string> | null = null;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function loadClientContractIds(): Set<string> {
  if (clientContractIdsCache) return clientContractIdsCache;
  const wb = XLSX.read(readFileSync(CLIENT_CONTRACTS_PATH), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<{ Contract: string }>(ws);
  clientContractIdsCache = new Set(
    rows.map((r) => (r.Contract ?? "").trim().toUpperCase()).filter(Boolean)
  );
  return clientContractIdsCache;
}

export function ensureOfficialCutPoints(): Map<number, MeasureCutPoint[]> {
  if (!officialCutPointsCache) {
    officialCutPointsCache = loadMeasureCutPoints(CUT_POINTS_PATH, [2022, ...getAvailableMeasureYears()]);
  }
  return officialCutPointsCache;
}

export function isCahpsMeasure(displayName: string): boolean {
  return CAHPS_MEASURE_NAMES.has(normalizeMeasureName(displayName));
}

export function isHosMeasure(displayName: string): boolean {
  return HOS_MEASURE_NAMES.has(normalizeMeasureName(displayName));
}

export function isSurveyMeasure(displayName: string): boolean {
  return isCahpsMeasure(displayName) || isHosMeasure(displayName);
}

function isQualityImprovementMeasure(displayName: string): boolean {
  return /quality improvement/i.test(displayName);
}

function inferScaleBounds(scores: number[]): ScaleBounds {
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const isPercentageScale = min >= 0 && max <= 100;
  return {
    min: isPercentageScale ? 0 : min,
    max: isPercentageScale ? 100 : max,
    isPercentageScale,
  };
}

export function quantile(sortedScores: number[], percentile: number): number {
  if (sortedScores.length === 0) return Number.NaN;
  if (sortedScores.length === 1) return sortedScores[0];
  const idx = (sortedScores.length - 1) * percentile;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedScores[lower];
  const weight = idx - lower;
  return sortedScores[lower] + (sortedScores[upper] - sortedScores[lower]) * weight;
}

export function computeTukeyFences(scores: number[], bounds: ScaleBounds): { lower: number; upper: number } {
  const sorted = [...scores].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return {
    lower: Math.max(bounds.min, q1 - 3 * iqr),
    upper: Math.min(bounds.max, q3 + 3 * iqr),
  };
}

export function applyTukeyFilter(samples: MeasureScoreSample[], bounds: ScaleBounds): TukeyFilterResult {
  const scores = samples.map((sample) => sample.score);
  const fences = computeTukeyFences(scores, bounds);

  // When IQR = 0 (heavy ties, e.g. >50% of contracts share one score value),
  // Tukey fences degenerate to a single point and would discard valid data.
  // Skip filtering in this case — outlier removal is not meaningful.
  if (fences.lower === fences.upper) {
    return { samples, outliersRemoved: 0, fences: { lower: bounds.min, upper: bounds.max } };
  }

  const filtered = samples.filter((sample) => sample.score >= fences.lower && sample.score <= fences.upper);
  return {
    samples: filtered,
    outliersRemoved: samples.length - filtered.length,
    fences,
  };
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function assignResampleFolds(
  samples: MeasureScoreSample[],
  foldCount: number = RESAMPLE_FOLD_COUNT,
  seed: number = RESAMPLE_SEED
): Array<MeasureScoreSample & { fold: number }> {
  const shuffled = [...samples].sort((a, b) => a.contractId.localeCompare(b.contractId));
  const rand = createSeededRandom(seed);

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const swapIdx = Math.floor(rand() * (i + 1));
    const current = shuffled[i];
    shuffled[i] = shuffled[swapIdx];
    shuffled[swapIdx] = current;
  }

  return shuffled.map((sample, index) => ({
    ...sample,
    fold: index % foldCount,
  }));
}

function mergeCost(left: WardCluster, right: WardCluster): number {
  const meanGap = left.mean - right.mean;
  return (left.count * right.count) / (left.count + right.count) * meanGap * meanGap;
}

export function clusterScoresWard(scores: number[], targetClusters: number = 5): WardCluster[] {
  const sorted = [...scores].sort((a, b) => a - b);
  const clusters: WardCluster[] = sorted.map((score) => ({
    min: score,
    max: score,
    mean: score,
    count: 1,
  }));

  while (clusters.length > targetClusters) {
    let bestIndex = 0;
    let bestCost = Number.POSITIVE_INFINITY;

    for (let i = 0; i < clusters.length - 1; i += 1) {
      const cost = mergeCost(clusters[i], clusters[i + 1]);
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = i;
      }
    }

    const left = clusters[bestIndex];
    const right = clusters[bestIndex + 1];
    const count = left.count + right.count;
    const merged: WardCluster = {
      min: left.min,
      max: right.max,
      mean: (left.mean * left.count + right.mean * right.count) / count,
      count,
    };
    clusters.splice(bestIndex, 2, merged);
  }

  return clusters;
}

export function deriveThresholdsFromClusters(clusters: WardCluster[], inverted: boolean): ThresholdValues {
  if (clusters.length < 5) {
    throw new Error("At least 5 clusters are required to derive CMS-style thresholds.");
  }

  if (inverted) {
    return {
      twoStar: clusters[3].max,
      threeStar: clusters[2].max,
      fourStar: clusters[1].max,
      fiveStar: clusters[0].max,
    };
  }

  return {
    twoStar: clusters[1].min,
    threeStar: clusters[2].min,
    fourStar: clusters[3].min,
    fiveStar: clusters[4].min,
  };
}

function averageThresholds(results: ThresholdValues[]): ThresholdValues {
  return THRESHOLD_KEYS.reduce((acc, key) => {
    acc[key] = round2(results.reduce((sum, item) => sum + item[key], 0) / results.length);
    return acc;
  }, {} as ThresholdValues);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function enforceThresholdOrder(thresholds: ThresholdValues, bounds: ScaleBounds, inverted: boolean): ThresholdValues {
  if (inverted) {
    const fiveStar = clamp(thresholds.fiveStar, bounds.min, bounds.max);
    const fourStar = clamp(Math.max(thresholds.fourStar, fiveStar), bounds.min, bounds.max);
    const threeStar = clamp(Math.max(thresholds.threeStar, fourStar), bounds.min, bounds.max);
    const twoStar = clamp(Math.max(thresholds.twoStar, threeStar), bounds.min, bounds.max);
    return {
      twoStar: round2(twoStar),
      threeStar: round2(threeStar),
      fourStar: round2(fourStar),
      fiveStar: round2(fiveStar),
    };
  }

  const twoStar = clamp(thresholds.twoStar, bounds.min, bounds.max);
  const threeStar = clamp(Math.max(thresholds.threeStar, twoStar), bounds.min, bounds.max);
  const fourStar = clamp(Math.max(thresholds.fourStar, threeStar), bounds.min, bounds.max);
  const fiveStar = clamp(Math.max(thresholds.fiveStar, fourStar), bounds.min, bounds.max);
  return {
    twoStar: round2(twoStar),
    threeStar: round2(threeStar),
    fourStar: round2(fourStar),
    fiveStar: round2(fiveStar),
  };
}

export function applyGuardrails(
  simulated: ThresholdValues,
  priorOfficial: ThresholdValues | null,
  bounds: ScaleBounds,
  restrictedRange: number,
  inverted: boolean
): { thresholds: ThresholdValues; cap: number | null } {
  if (!priorOfficial) {
    return { thresholds: enforceThresholdOrder(simulated, bounds, inverted), cap: null };
  }

  const cap = bounds.isPercentageScale ? 5 : restrictedRange * 0.05;
  const guarded = THRESHOLD_KEYS.reduce((acc, key) => {
    acc[key] = clamp(simulated[key], priorOfficial[key] - cap, priorOfficial[key] + cap);
    return acc;
  }, {} as ThresholdValues);

  return {
    thresholds: guarded,
    cap: round2(cap),
  };
}

type ThresholdSimulationReady = {
  status: "ready";
  thresholds: ThresholdValues;
  bounds: ScaleBounds;
  rawSampleSize: number;
  sampleSize: number;
  resampleRuns: number;
  outliersRemoved: number;
  tukeyApplied: boolean;
  fences: { lower: number; upper: number };
  notes: string[];
};

type ThresholdSimulationResult =
  | ThresholdSimulationReady
  | { status: "unavailable"; reason: string };

function simulateCahpsThresholds(rawSamples: MeasureScoreSample[]): ThresholdSimulationResult {
  if (rawSamples.length < 10) {
    return {
      status: "unavailable",
      reason: "At least 10 projected contracts are required to simulate CAHPS thresholds.",
    };
  }

  const thresholds = computeCahpsPercentileThresholds(rawSamples.map((sample) => sample.score));
  return {
    status: "ready",
    thresholds,
    bounds: { min: 0, max: 100, isPercentageScale: true },
    rawSampleSize: rawSamples.length,
    sampleSize: rawSamples.length,
    resampleRuns: 0,
    outliersRemoved: 0,
    tukeyApplied: false,
    fences: { lower: 0, upper: 100 },
    notes: [
      `CAHPS percentile-based thresholds: P15=${thresholds.twoStar}, P30=${thresholds.threeStar}, P60=${thresholds.fourStar}, P80=${thresholds.fiveStar}.`,
      "Simplified: significance testing and reliability adjustments omitted (requires standard errors not available in public data).",
    ],
  };
}

function simulateClusteringThresholds(
  rawSamples: MeasureScoreSample[],
  methodYear: number,
  inverted: boolean
): ThresholdSimulationResult {
  if (rawSamples.length < RESAMPLE_FOLD_COUNT) {
    return {
      status: "unavailable",
      reason: `At least ${RESAMPLE_FOLD_COUNT} projected contracts are required to simulate clustering thresholds.`,
    };
  }

  const bounds = inferScaleBounds(rawSamples.map((sample) => sample.score));
  const tukeyApplied = methodYear >= TUKEY_START_YEAR;
  const filtered = tukeyApplied
    ? applyTukeyFilter(rawSamples, bounds)
    : { samples: rawSamples, outliersRemoved: 0, fences: { lower: bounds.min, upper: bounds.max } };

  if (filtered.samples.length < 5) {
    return {
      status: "unavailable",
      reason: "Too few projected contracts remained after filtering to simulate thresholds.",
    };
  }

  const foldAssignments = assignResampleFolds(filtered.samples);
  const resampledThresholds: ThresholdValues[] = [];
  for (let fold = 0; fold < RESAMPLE_FOLD_COUNT; fold += 1) {
    const trainingScores = foldAssignments
      .filter((sample) => sample.fold !== fold)
      .map((sample) => sample.score);
    if (trainingScores.length < 5) continue;
    resampledThresholds.push(
      deriveThresholdsFromClusters(clusterScoresWard(trainingScores, 5), inverted)
    );
  }

  if (resampledThresholds.length === 0) {
    return {
      status: "unavailable",
      reason: "The projected score population was too sparse to complete resampling.",
    };
  }

  const thresholds = averageThresholds(resampledThresholds);
  return {
    status: "ready",
    thresholds,
    bounds,
    rawSampleSize: rawSamples.length,
    sampleSize: filtered.samples.length,
    resampleRuns: resampledThresholds.length,
    outliersRemoved: filtered.outliersRemoved,
    tukeyApplied,
    fences: filtered.fences,
    notes: [
      tukeyApplied
        ? `Tukey outer-fence deletion applied before clustering (${round2(filtered.fences.lower)} to ${round2(filtered.fences.upper)} kept).`
        : "Tukey deletion was skipped because the target year precedes the CMS cutoff.",
    ],
  };
}

function simulateThresholdsForForecast(
  rawSamples: MeasureScoreSample[],
  methodYear: number,
  cahps: boolean,
  inverted: boolean
): ThresholdSimulationResult {
  return cahps
    ? simulateCahpsThresholds(rawSamples)
    : simulateClusteringThresholds(rawSamples, methodYear, inverted);
}

function lookupOfficialCutPoint(
  measure: UnifiedMeasure,
  year: number,
  cutPointsByYear: Map<number, MeasureCutPoint[]>
): MeasureCutPoint | null {
  const codePrefix = (measure.codesByYear[year] ?? Object.values(measure.codesByYear)[0] ?? "C")[0];
  const cutPoints = cutPointsByYear.get(year) ?? [];
  return matchCutPointToMeasureName(measure.displayName, codePrefix, cutPoints);
}

export function computeCahpsPercentileThresholds(scores: number[]): ThresholdValues {
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    twoStar: Math.round(quantile(sorted, CAHPS_PERCENTILES.twoStar)),
    threeStar: Math.round(quantile(sorted, CAHPS_PERCENTILES.threeStar)),
    fourStar: Math.round(quantile(sorted, CAHPS_PERCENTILES.fourStar)),
    fiveStar: Math.round(quantile(sorted, CAHPS_PERCENTILES.fiveStar)),
  };
}

function buildYearResult(
  year: number,
  rawSamples: MeasureScoreSample[],
  sampleSize: number,
  outliersRemoved: number,
  tukeyApplied: boolean,
  guardrailsApplied: boolean,
  guardrailCap: number | null,
  resampleRuns: number,
  finalThresholds: ThresholdValues,
  official: MeasureCutPoint,
  notes: string[],
): MethodologyBacktestYear {
  const thresholdComparisons = THRESHOLD_KEYS.map((key) => {
    const actual = official.thresholds[key];
    const simulated = finalThresholds[key];
    const delta = round2(simulated - actual);
    return { key, label: THRESHOLD_LABELS[key], actual, simulated, delta, absError: round2(Math.abs(delta)) };
  });
  const meanAbsoluteError = round2(
    thresholdComparisons.reduce((sum, c) => sum + c.absError, 0) / thresholdComparisons.length
  );
  return {
    year,
    rawSampleSize: rawSamples.length,
    sampleSize,
    resampleRuns,
    outliersRemoved,
    tukeyApplied,
    guardrailsApplied,
    guardrailCap,
    meanAbsoluteError,
    maxAbsoluteError: Math.max(...thresholdComparisons.map((c) => c.absError)),
    thresholdComparisons,
    notes,
  };
}

function filterSamples(
  samples: MeasureScoreSample[],
  contractFilter?: Set<string>,
): MeasureScoreSample[] {
  if (!contractFilter) return samples;
  return samples.filter((s) => contractFilter.has(s.contractId));
}

function runClusteringBacktest(
  measure: UnifiedMeasure,
  measureNorm: string,
  inverted: boolean,
  officialCutPointsByYear: Map<number, MeasureCutPoint[]>,
  contractFilter?: Set<string>,
): MethodologyBacktestYear[] {
  const results: MethodologyBacktestYear[] = [];
  for (const year of getAvailableMeasureYears()) {
    const rawSamples = filterSamples(getMeasureYearScoreSamples(measureNorm, year), contractFilter);
    const official = lookupOfficialCutPoint(measure, year, officialCutPointsByYear);
    if (!official || rawSamples.length < RESAMPLE_FOLD_COUNT) continue;

    const bounds = inferScaleBounds(rawSamples.map((s) => s.score));
    const tukeyApplied = year >= TUKEY_START_YEAR;
    const filtered = tukeyApplied
      ? applyTukeyFilter(rawSamples, bounds)
      : { samples: rawSamples, outliersRemoved: 0, fences: { lower: bounds.min, upper: bounds.max } };
    if (filtered.samples.length < 5) continue;

    const foldAssignments = assignResampleFolds(filtered.samples);
    const resampledThresholds: ThresholdValues[] = [];
    for (let fold = 0; fold < RESAMPLE_FOLD_COUNT; fold += 1) {
      const trainingScores = foldAssignments.filter((s) => s.fold !== fold).map((s) => s.score);
      if (trainingScores.length < 5) continue;
      resampledThresholds.push(deriveThresholdsFromClusters(clusterScoresWard(trainingScores, 5), inverted));
    }
    if (resampledThresholds.length === 0) continue;

    const averaged = averageThresholds(resampledThresholds);
    const priorOfficial = lookupOfficialCutPoint(measure, year - 1, officialCutPointsByYear);
    const guarded = applyGuardrails(
      averaged,
      priorOfficial
        ? { twoStar: priorOfficial.thresholds.twoStar, threeStar: priorOfficial.thresholds.threeStar, fourStar: priorOfficial.thresholds.fourStar, fiveStar: priorOfficial.thresholds.fiveStar }
        : null,
      bounds,
      Math.max(0, filtered.fences.upper - filtered.fences.lower),
      inverted,
    );
    const finalThresholds = enforceThresholdOrder(guarded.thresholds, bounds, inverted);

    results.push(buildYearResult(year, rawSamples, filtered.samples.length, filtered.outliersRemoved, tukeyApplied, Boolean(priorOfficial), guarded.cap, resampledThresholds.length, finalThresholds, official, [
      tukeyApplied
        ? `Tukey outer-fence deletion applied before clustering (${round2(filtered.fences.lower)} to ${round2(filtered.fences.upper)} kept).`
        : "Pre-2024 backtests skip Tukey deletion because CMS had not adopted it yet.",
      priorOfficial
        ? `Guardrails limited each threshold to ${guarded.cap} points around the prior-year official cut point.`
        : "No prior-year official cut point was available, so guardrails were not applied.",
    ]));
  }
  return results;
}

function runCahpsBacktest(
  measure: UnifiedMeasure,
  measureNorm: string,
  officialCutPointsByYear: Map<number, MeasureCutPoint[]>,
  contractFilter?: Set<string>,
): MethodologyBacktestYear[] {
  const results: MethodologyBacktestYear[] = [];
  for (const year of getAvailableMeasureYears()) {
    const rawSamples = filterSamples(getMeasureYearScoreSamples(measureNorm, year), contractFilter);
    const official = lookupOfficialCutPoint(measure, year, officialCutPointsByYear);
    if (!official || rawSamples.length < 10) continue;

    const scores = rawSamples.map((s) => s.score);
    const thresholds = computeCahpsPercentileThresholds(scores);

    results.push(buildYearResult(year, rawSamples, rawSamples.length, 0, false, false, null, 0, thresholds, official, [
      `CAHPS percentile-based thresholds: P15=${thresholds.twoStar}, P30=${thresholds.threeStar}, P60=${thresholds.fourStar}, P80=${thresholds.fiveStar}.`,
      "Simplified: significance testing and reliability adjustments omitted (requires standard errors not available in public data).",
    ]));
  }
  return results;
}

function findLatestOfficialYearAtOrBefore(
  cutPointsByYear: Map<number, MeasureCutPoint[]>,
  targetYear: number
): number | null {
  const years = [...cutPointsByYear.keys()]
    .filter((year) => year <= targetYear)
    .sort((left, right) => right - left);
  return years[0] ?? null;
}

type ForecastThresholdMetadata = Partial<Record<ThresholdKey, {
  rawSimulated: number | null;
  baselineSimulated: number | null;
  anchoredMovement: number | null;
  movementCap: number | null;
  movementWasCapped: boolean;
}>>;

function buildForecastThresholds(
  finalThresholds: ThresholdValues,
  comparisonOfficial: MeasureCutPoint | null,
  metadata: ForecastThresholdMetadata = {}
): MethodologyForecastThreshold[] {
  return THRESHOLD_KEYS.map((key) => {
    const projected = finalThresholds[key];
    const comparisonActual = comparisonOfficial ? comparisonOfficial.thresholds[key] : null;
    const deltaVsComparison =
      comparisonActual === null ? null : round2(projected - comparisonActual);
    const itemMetadata = metadata[key];

    return {
      key,
      label: THRESHOLD_LABELS[key],
      projected,
      comparisonActual,
      deltaVsComparison,
      absDeltaVsComparison:
        deltaVsComparison === null ? null : round2(Math.abs(deltaVsComparison)),
      rawSimulated: itemMetadata?.rawSimulated ?? null,
      baselineSimulated: itemMetadata?.baselineSimulated ?? null,
      anchoredMovement: itemMetadata?.anchoredMovement ?? null,
      movementCap: itemMetadata?.movementCap ?? null,
      movementWasCapped: itemMetadata?.movementWasCapped ?? false,
    };
  });
}

function nearestRank(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(percentile * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function historicalMovementCaps(
  measure: UnifiedMeasure,
  cutPointsByYear: Map<number, MeasureCutPoint[]>,
  comparisonYear: number | null,
  fallbackCap: number | null
): Record<ThresholdKey, number> {
  const historicalRows = [...cutPointsByYear.keys()]
    .filter((year) => comparisonYear !== null && year <= comparisonYear)
    .sort((left, right) => left - right)
    .map((year) => {
      const cutPoint = lookupOfficialCutPoint(measure, year, cutPointsByYear);
      return cutPoint
        ? {
            year,
            thresholds: cutPoint.thresholds,
          }
        : null;
    })
    .filter((row): row is { year: number; thresholds: MeasureCutPoint["thresholds"] } => row !== null);

  return THRESHOLD_KEYS.reduce((acc, key) => {
    const absDeltas: number[] = [];
    for (let index = 1; index < historicalRows.length; index += 1) {
      const previous = historicalRows[index - 1];
      const current = historicalRows[index];
      if (current.year !== previous.year + 1) continue;
      absDeltas.push(Math.abs(current.thresholds[key] - previous.thresholds[key]));
    }
    const recentP90AbsDelta = nearestRank(absDeltas, 0.9);
    acc[key] = round2(Math.max(1, recentP90AbsDelta ?? fallbackCap ?? 5));
    return acc;
  }, {} as Record<ThresholdKey, number>);
}

function buildHistoricalMovementAudit(
  measure: UnifiedMeasure,
  cutPointsByYear: Map<number, MeasureCutPoint[]>,
  comparisonYear: number | null,
  thresholds: MethodologyForecastThreshold[]
): HistoricalMovementAudit | null {
  if (comparisonYear === null) return null;

  const historicalRows = [...cutPointsByYear.keys()]
    .filter((year) => year <= comparisonYear)
    .sort((left, right) => left - right)
    .map((year) => {
      const cutPoint = lookupOfficialCutPoint(measure, year, cutPointsByYear);
      return cutPoint
        ? {
            year,
            thresholds: cutPoint.thresholds,
          }
        : null;
    })
    .filter((row): row is { year: number; thresholds: MeasureCutPoint["thresholds"] } => row !== null);

  if (historicalRows.length < 2) {
    return {
      comparisonYear,
      historicalYears: historicalRows.map((row) => row.year),
      checks: [],
      warningCount: 0,
    };
  }

  const checks = THRESHOLD_KEYS.map((key) => {
    const recentDeltas: number[] = [];
    for (let index = 1; index < historicalRows.length; index += 1) {
      const previous = historicalRows[index - 1];
      const current = historicalRows[index];
      if (current.year !== previous.year + 1) continue;
      recentDeltas.push(round2(current.thresholds[key] - previous.thresholds[key]));
    }

    const threshold = thresholds.find((item) => item.key === key);
    const projectedDelta = threshold?.deltaVsComparison ?? null;
    const absDeltas = recentDeltas.map((delta) => Math.abs(delta));
    const recentMinDelta = recentDeltas.length > 0 ? Math.min(...recentDeltas) : null;
    const recentMaxDelta = recentDeltas.length > 0 ? Math.max(...recentDeltas) : null;
    const recentP90AbsDelta = nearestRank(absDeltas, 0.9);
    const recentMaxAbsDelta = absDeltas.length > 0 ? Math.max(...absDeltas) : null;
    const isOutsideRecentRange =
      projectedDelta !== null &&
      recentMinDelta !== null &&
      recentMaxDelta !== null &&
      (projectedDelta < recentMinDelta || projectedDelta > recentMaxDelta);
    const isAboveRecentP90 =
      projectedDelta !== null &&
      recentP90AbsDelta !== null &&
      Math.abs(projectedDelta) > recentP90AbsDelta;

    const message =
      projectedDelta !== null && (isOutsideRecentRange || isAboveRecentP90)
        ? `${THRESHOLD_LABELS[key]} movement ${projectedDelta > 0 ? "+" : ""}${projectedDelta.toFixed(2)} is outside recent official movement patterns (${recentMinDelta === null || recentMaxDelta === null ? "no range" : `${recentMinDelta > 0 ? "+" : ""}${recentMinDelta} to ${recentMaxDelta > 0 ? "+" : ""}${recentMaxDelta}`}).`
        : null;

    return {
      key,
      label: THRESHOLD_LABELS[key],
      projectedDelta,
      recentDeltas,
      recentMinDelta,
      recentMaxDelta,
      recentP90AbsDelta,
      recentMaxAbsDelta,
      isOutsideRecentRange,
      isAboveRecentP90,
      message,
    };
  });

  return {
    comparisonYear,
    historicalYears: historicalRows.map((row) => row.year),
    checks,
    warningCount: checks.filter((check) => check.message !== null).length,
  };
}

export type MethodologyForecastOptions = {
  baselineSamples?: MeasureScoreSample[];
  baselineYear?: number | null;
};

export function analyzeCutPointMethodologyForecast(
  measureNorm: string,
  forecastYear: number,
  rawSamples: MeasureScoreSample[],
  options: MethodologyForecastOptions = {}
): MethodologyForecastResponse {
  const measure = getMeasureByNormalizedName(measureNorm);
  if (!measure) {
    return {
      status: "unsupported",
      measure: measureNorm,
      displayName: measureNorm,
      reason: "Measure not found.",
    };
  }

  if (isQualityImprovementMeasure(measure.displayName)) {
    return {
      status: "unsupported",
      measure: measureNorm,
      displayName: measure.displayName,
      reason:
        "Quality Improvement measures use a special split-clustering methodology and are excluded from this first pass.",
    };
  }

  if (rawSamples.length === 0) {
    return {
      status: "unavailable",
      measure: measureNorm,
      displayName: measure.displayName,
      forecastYear,
      reason: "No approved projected scores were available for this measure.",
    };
  }

  const officialCutPointsByYear = ensureOfficialCutPoints();
  const comparisonYear = findLatestOfficialYearAtOrBefore(
    officialCutPointsByYear,
    forecastYear - 1
  ) ?? findLatestOfficialYearAtOrBefore(officialCutPointsByYear, forecastYear);
  const priorOfficialYear = comparisonYear;
  const comparisonOfficial = comparisonYear
    ? lookupOfficialCutPoint(measure, comparisonYear, officialCutPointsByYear)
    : null;
  const priorOfficial = priorOfficialYear
    ? lookupOfficialCutPoint(measure, priorOfficialYear, officialCutPointsByYear)
    : null;
  const inverted = isInvertedMeasure(measure.displayName);
  const cahps = isCahpsMeasure(measure.displayName);

  const simulation = simulateThresholdsForForecast(rawSamples, forecastYear, cahps, inverted);
  if (simulation.status !== "ready") {
    return {
      status: "unavailable",
      measure: measureNorm,
      displayName: measure.displayName,
      forecastYear,
      reason: simulation.reason,
    };
  }

  const baselineSamples = options.baselineSamples ?? [];
  const baselineSimulation =
    comparisonOfficial && baselineSamples.length > 0
      ? simulateThresholdsForForecast(baselineSamples, forecastYear, cahps, inverted)
      : null;
  const canAnchor = comparisonOfficial && baselineSimulation?.status === "ready";

  let finalThresholds: ThresholdValues;
  let thresholdMetadata: ForecastThresholdMetadata = {};
  let guardrailsApplied = false;
  let guardrailCap: number | null = null;
  const notes = [...simulation.notes];

  if (canAnchor) {
    const fallbackCap = cahps
      ? 5
      : (simulation.bounds.isPercentageScale
          ? 5
          : Math.max(0, simulation.fences.upper - simulation.fences.lower) * 0.05);
    const movementCaps = historicalMovementCaps(
      measure,
      officialCutPointsByYear,
      comparisonYear,
      fallbackCap
    );
    const rawAnchored = THRESHOLD_KEYS.reduce((acc, key) => {
      const rawMovement = simulation.thresholds[key] - baselineSimulation.thresholds[key];
      const cappedMovement = clamp(rawMovement, -movementCaps[key], movementCaps[key]);
      acc[key] = round2(comparisonOfficial.thresholds[key] + cappedMovement);
      thresholdMetadata[key] = {
        rawSimulated: simulation.thresholds[key],
        baselineSimulated: baselineSimulation.thresholds[key],
        anchoredMovement: round2(cappedMovement),
        movementCap: movementCaps[key],
        movementWasCapped: round2(rawMovement) !== round2(cappedMovement),
      };
      return acc;
    }, {} as ThresholdValues);
    finalThresholds = enforceThresholdOrder(rawAnchored, simulation.bounds, inverted);
    for (const key of THRESHOLD_KEYS) {
      const metadata = thresholdMetadata[key];
      if (!metadata) continue;
      metadata.anchoredMovement = round2(finalThresholds[key] - comparisonOfficial.thresholds[key]);
    }
    guardrailsApplied = true;
    guardrailCap = Math.max(...THRESHOLD_KEYS.map((key) => movementCaps[key]));
    notes.push(
      `Anchored projected cut-point movement to ${comparisonYear} official cut points by comparing the projected simulation to the ${
        options.baselineYear ?? comparisonYear
      } baseline simulation.`
    );
    notes.push(
      "Movement caps use this measure's recent official year-over-year cut-point movement (minimum 1 point per threshold)."
    );
    const cappedCount = THRESHOLD_KEYS.filter((key) => thresholdMetadata[key]?.movementWasCapped).length;
    if (cappedCount > 0) {
      notes.push(`${cappedCount} threshold movement${cappedCount === 1 ? " was" : "s were"} capped to historical movement ranges.`);
    }
  } else {
    const useGuardrails = !cahps && Boolean(priorOfficial);
    const guarded = useGuardrails
      ? applyGuardrails(
          simulation.thresholds,
          {
            twoStar: priorOfficial!.thresholds.twoStar,
            threeStar: priorOfficial!.thresholds.threeStar,
            fourStar: priorOfficial!.thresholds.fourStar,
            fiveStar: priorOfficial!.thresholds.fiveStar,
          },
          simulation.bounds,
          Math.max(0, simulation.fences.upper - simulation.fences.lower),
          inverted
        )
      : { thresholds: simulation.thresholds, cap: null };
    finalThresholds = enforceThresholdOrder(guarded.thresholds, simulation.bounds, inverted);
    guardrailsApplied = useGuardrails;
    guardrailCap = guarded.cap;
    thresholdMetadata = THRESHOLD_KEYS.reduce((acc, key) => {
      acc[key] = {
        rawSimulated: simulation.thresholds[key],
        baselineSimulated: null,
        anchoredMovement: comparisonOfficial
          ? round2(finalThresholds[key] - comparisonOfficial.thresholds[key])
          : null,
        movementCap: guarded.cap,
        movementWasCapped: round2(simulation.thresholds[key]) !== round2(finalThresholds[key]),
      };
      return acc;
    }, {} as ForecastThresholdMetadata);
    if (comparisonOfficial && baselineSimulation?.status === "unavailable") {
      notes.push(`Baseline simulation was unavailable (${baselineSimulation.reason}), so raw simulated thresholds were used.`);
    } else if (!comparisonOfficial) {
      notes.push("No official baseline cut points were available, so raw simulated thresholds were used.");
    }
  }

  const forecastThresholds = buildForecastThresholds(
    finalThresholds,
    comparisonOfficial,
    thresholdMetadata
  );
  if (comparisonOfficial && comparisonYear !== null) {
    notes.push(`Compared projected thresholds against the latest official year available (${comparisonYear}).`);
  } else {
    notes.push("No official comparison year was available for this forecast.");
  }

  return {
    status: "ready",
    measure: measureNorm,
    displayName: measure.displayName,
    forecastYear,
    comparisonYear,
    inverted,
    sampleSize: simulation.sampleSize,
    rawSampleSize: simulation.rawSampleSize,
    resampleRuns: simulation.resampleRuns,
    outliersRemoved: simulation.outliersRemoved,
    tukeyApplied: simulation.tukeyApplied,
    guardrailsApplied,
    guardrailCap,
    thresholds: forecastThresholds,
    historicalMovement: buildHistoricalMovementAudit(
      measure,
      officialCutPointsByYear,
      comparisonYear,
      forecastThresholds
    ),
    notes,
    methodology: {
      method: cahps ? "cahps-percentile" : "clustering",
      foldCount: RESAMPLE_FOLD_COUNT,
      seed: RESAMPLE_SEED,
      tukeyStartsIn: TUKEY_START_YEAR,
      exclusions: ["Quality Improvement measures"],
    },
  };
}

export function analyzeCutPointMethodologyBacktest(
  measureNorm: string,
  contractFilter?: Set<string>,
): MethodologyBacktestResponse {
  const measure = getMeasureByNormalizedName(measureNorm);
  if (!measure) {
    return { status: "unsupported", measure: measureNorm, displayName: measureNorm, reason: "Measure not found." };
  }

  if (isQualityImprovementMeasure(measure.displayName)) {
    return { status: "unsupported", measure: measureNorm, displayName: measure.displayName, reason: "Quality Improvement measures use a special split-clustering methodology and are excluded from this first pass." };
  }

  const officialCutPointsByYear = ensureOfficialCutPoints();
  const cahps = isCahpsMeasure(measure.displayName);
  const inverted = isInvertedMeasure(measure.displayName);

  const results = cahps
    ? runCahpsBacktest(measure, measureNorm, officialCutPointsByYear, contractFilter)
    : runClusteringBacktest(measure, measureNorm, inverted, officialCutPointsByYear, contractFilter);

  if (results.length === 0) {
    return {
      status: "unsupported",
      measure: measureNorm,
      displayName: measure.displayName,
      reason: "No backtest years were available for this measure with the current score and cut point files.",
    };
  }

  const sortedResults = results.sort((a, b) => a.year - b.year);
  const bestYear = [...sortedResults].sort((a, b) => a.meanAbsoluteError - b.meanAbsoluteError)[0]?.year ?? null;
  const worstYear = [...sortedResults].sort((a, b) => b.meanAbsoluteError - a.meanAbsoluteError)[0]?.year ?? null;

  return {
    status: "ready",
    measure: measureNorm,
    displayName: measure.displayName,
    inverted,
    supportedYears: sortedResults.map((r) => r.year),
    years: sortedResults,
    summary: {
      comparedYears: sortedResults.length,
      avgMeanAbsoluteError: round2(
        sortedResults.reduce((sum, r) => sum + r.meanAbsoluteError, 0) / sortedResults.length
      ),
      bestYear,
      worstYear,
    },
    methodology: {
      method: cahps ? "cahps-percentile" : "clustering",
      foldCount: RESAMPLE_FOLD_COUNT,
      seed: RESAMPLE_SEED,
      tukeyStartsIn: TUKEY_START_YEAR,
      exclusions: ["Quality Improvement measures"],
    },
  };
}

/** Combined accuracy stats over a pooled set of per-threshold absolute errors. */
export type MethodologyOverallAccuracy = {
  thresholdComparisons: number;
  meanAbsoluteError: number;
  medianAbsoluteError: number;
  maxAbsoluteError: number;
  exactMatchPct: number;
  withinOnePointPct: number;
};

export type MethodologyOverallThresholdSummary = {
  key: ThresholdKey;
  label: string;
  count: number;
  meanAbsoluteError: number;
  clientCount: number;
  clientMeanAbsoluteError: number | null;
};

export type MethodologyOverallMeasureSummary = {
  measure: string;
  displayName: string;
  method: "clustering" | "cahps-percentile";
  comparedYears: number;
  thresholdCount: number;
  meanAbsoluteError: number;
  maxAbsoluteError: number;
  clientThresholdCount: number;
  clientMeanAbsoluteError: number | null;
};

export type MethodologyOverallResponse = {
  status: "ready";
  generatedAt: string;
  clientContractCount: number;
  measuresIncluded: number;
  measuresExcluded: number;
  excluded: { displayName: string; reason: string }[];
  fullMarket: MethodologyOverallAccuracy;
  client: MethodologyOverallAccuracy | null;
  byThreshold: MethodologyOverallThresholdSummary[];
  measures: MethodologyOverallMeasureSummary[];
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function summarizeAbsErrors(errors: number[]): MethodologyOverallAccuracy {
  if (errors.length === 0) {
    return {
      thresholdComparisons: 0,
      meanAbsoluteError: 0,
      medianAbsoluteError: 0,
      maxAbsoluteError: 0,
      exactMatchPct: 0,
      withinOnePointPct: 0,
    };
  }
  const sorted = [...errors].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    thresholdComparisons: errors.length,
    meanAbsoluteError: round2(mean(errors)),
    medianAbsoluteError: round2(median),
    maxAbsoluteError: round2(Math.max(...errors)),
    exactMatchPct: round2((errors.filter((e) => e === 0).length / errors.length) * 100),
    withinOnePointPct: round2((errors.filter((e) => e <= 1).length / errors.length) * 100),
  };
}

let overallCache: MethodologyOverallResponse | null = null;

/**
 * Big-picture accuracy across every backtestable measure: pools the individual
 * 2★–5★ absolute errors (|simulated − actual|) from each supported measure/year
 * into a single combined mean absolute error, for both the full H+R market and
 * the client-only population. Deterministic (seeded), so the result is cached
 * for the process lifetime.
 */
export function analyzeCutPointMethodologyOverall(): MethodologyOverallResponse {
  if (overallCache) return overallCache;

  const clientIds = loadClientContractIds();
  const { measures } = getAvailableOptions();

  const fullErrors: number[] = [];
  const clientErrors: number[] = [];
  const byThresholdFull = new Map<ThresholdKey, number[]>();
  const byThresholdClient = new Map<ThresholdKey, number[]>();
  for (const key of THRESHOLD_KEYS) {
    byThresholdFull.set(key, []);
    byThresholdClient.set(key, []);
  }

  const measureSummaries: MethodologyOverallMeasureSummary[] = [];
  const excluded: { displayName: string; reason: string }[] = [];

  for (const m of measures) {
    const full = analyzeCutPointMethodologyBacktest(m.normalizedName, undefined);
    if (full.status !== "ready") {
      excluded.push({ displayName: full.displayName, reason: full.reason });
      continue;
    }

    const client = analyzeCutPointMethodologyBacktest(m.normalizedName, clientIds);
    const fullMeasureErrors: number[] = [];
    const clientMeasureErrors: number[] = [];

    for (const yearRow of full.years) {
      for (const tc of yearRow.thresholdComparisons) {
        fullErrors.push(tc.absError);
        fullMeasureErrors.push(tc.absError);
        byThresholdFull.get(tc.key)!.push(tc.absError);
      }
    }

    if (client.status === "ready") {
      for (const yearRow of client.years) {
        for (const tc of yearRow.thresholdComparisons) {
          clientErrors.push(tc.absError);
          clientMeasureErrors.push(tc.absError);
          byThresholdClient.get(tc.key)!.push(tc.absError);
        }
      }
    }

    measureSummaries.push({
      measure: m.normalizedName,
      displayName: full.displayName,
      method: full.methodology.method,
      comparedYears: full.summary.comparedYears,
      thresholdCount: fullMeasureErrors.length,
      meanAbsoluteError: round2(mean(fullMeasureErrors)),
      maxAbsoluteError: fullMeasureErrors.length ? round2(Math.max(...fullMeasureErrors)) : 0,
      clientThresholdCount: clientMeasureErrors.length,
      clientMeanAbsoluteError: clientMeasureErrors.length ? round2(mean(clientMeasureErrors)) : null,
    });
  }

  measureSummaries.sort((a, b) => b.meanAbsoluteError - a.meanAbsoluteError);

  const byThreshold: MethodologyOverallThresholdSummary[] = THRESHOLD_KEYS.map((key) => {
    const full = byThresholdFull.get(key)!;
    const client = byThresholdClient.get(key)!;
    return {
      key,
      label: THRESHOLD_LABELS[key],
      count: full.length,
      meanAbsoluteError: round2(mean(full)),
      clientCount: client.length,
      clientMeanAbsoluteError: client.length ? round2(mean(client)) : null,
    };
  });

  overallCache = {
    status: "ready",
    generatedAt: new Date().toISOString(),
    clientContractCount: clientIds.size,
    measuresIncluded: measureSummaries.length,
    measuresExcluded: excluded.length,
    excluded,
    fullMarket: summarizeAbsErrors(fullErrors),
    client: clientErrors.length ? summarizeAbsErrors(clientErrors) : null,
    byThreshold,
    measures: measureSummaries,
  };

  return overallCache;
}

/** One row per threshold for measures with a ready backtest; one row for unsupported measures. */
export type MethodologyBacktestExportThresholdRow = {
  rowKind: "threshold";
  measureNormalized: string;
  displayName: string;
  inverted: boolean;
  year: number;
  thresholdKey: string;
  thresholdLabel: string;
  actual: number;
  fullMarketSimulated: number;
  fullMarketDelta: number;
  clientSimulated: number | null;
  clientDelta: number | null;
  /** Client simulated minus full market simulated (same as UI “Diff”). */
  diffSimulated: number | null;
  sampleSizeFullMarket: number;
  sampleSizeClient: number | null;
  meanAbsoluteErrorFull: number;
  meanAbsoluteErrorClient: number | null;
  tukeyApplied: boolean;
  guardrailsApplied: boolean;
  methodologyMethod: "clustering" | "cahps-percentile";
  methodologyFoldCount: number;
  methodologySeed: number;
  methodologyTukeyStartsIn: number;
};

export type MethodologyBacktestExportUnsupportedRow = {
  rowKind: "unsupported";
  measureNormalized: string;
  displayName: string;
  reason: string;
};

export type MethodologyBacktestExportRow =
  | MethodologyBacktestExportThresholdRow
  | MethodologyBacktestExportUnsupportedRow;

export type MethodologyBacktestExportBundle = {
  generatedAt: string;
  clientContractCount: number;
  rows: MethodologyBacktestExportRow[];
};

export function buildMethodologyBacktestExport(): MethodologyBacktestExportBundle {
  const clientIds = loadClientContractIds();
  const { measures } = getAvailableOptions();
  const rows: MethodologyBacktestExportRow[] = [];

  for (const m of measures) {
    const full = analyzeCutPointMethodologyBacktest(m.normalizedName, undefined);
    const client = analyzeCutPointMethodologyBacktest(m.normalizedName, clientIds);

    if (full.status !== "ready") {
      rows.push({
        rowKind: "unsupported",
        measureNormalized: m.normalizedName,
        displayName: full.displayName,
        reason: full.reason,
      });
      continue;
    }

    const clientYearMap =
      client.status === "ready" ? new Map(client.years.map((y) => [y.year, y])) : new Map<number, MethodologyBacktestYear>();

    for (const yearRow of full.years) {
      const cy = clientYearMap.get(yearRow.year);
      for (const tc of yearRow.thresholdComparisons) {
        const clientComp = cy?.thresholdComparisons.find((c) => c.key === tc.key);
        const diffSimulated =
          clientComp !== undefined ? round2(clientComp.simulated - tc.simulated) : null;
        rows.push({
          rowKind: "threshold",
          measureNormalized: m.normalizedName,
          displayName: full.displayName,
          inverted: full.inverted,
          year: yearRow.year,
          thresholdKey: tc.key,
          thresholdLabel: tc.label,
          actual: tc.actual,
          fullMarketSimulated: tc.simulated,
          fullMarketDelta: tc.delta,
          clientSimulated: clientComp?.simulated ?? null,
          clientDelta: clientComp?.delta ?? null,
          diffSimulated,
          sampleSizeFullMarket: yearRow.sampleSize,
          sampleSizeClient: cy?.sampleSize ?? null,
          meanAbsoluteErrorFull: yearRow.meanAbsoluteError,
          meanAbsoluteErrorClient: cy?.meanAbsoluteError ?? null,
          tukeyApplied: yearRow.tukeyApplied,
          guardrailsApplied: yearRow.guardrailsApplied,
          methodologyMethod: full.methodology.method,
          methodologyFoldCount: full.methodology.foldCount,
          methodologySeed: full.methodology.seed,
          methodologyTukeyStartsIn: full.methodology.tukeyStartsIn,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    clientContractCount: clientIds.size,
    rows,
  };
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV aligned with the “Actual vs Simulated Cut Points” table (one row per measure × year × threshold). */
export function methodologyBacktestExportToCsv(bundle: MethodologyBacktestExportBundle): string {
  const headers = [
    "measure_normalized",
    "display_name",
    "row_kind",
    "unsupported_reason",
    "year",
    "threshold_key",
    "threshold_label",
    "actual",
    "full_market_simulated",
    "full_market_delta",
    "client_simulated",
    "client_delta",
    "diff_simulated",
    "inverted",
    "sample_size_full_market",
    "sample_size_client",
    "mae_full_market",
    "mae_client",
    "tukey_applied",
    "guardrails_applied",
    "methodology_method",
    "methodology_fold_count",
    "methodology_seed",
    "methodology_tukey_starts_year",
  ];

  const lines = [headers.join(",")];

  for (const row of bundle.rows) {
    if (row.rowKind === "unsupported") {
      const cols = new Array(headers.length).fill("");
      cols[0] = csvEscape(row.measureNormalized);
      cols[1] = csvEscape(row.displayName);
      cols[2] = "unsupported";
      cols[3] = csvEscape(row.reason);
      lines.push(cols.join(","));
      continue;
    }

    lines.push(
      [
        csvEscape(row.measureNormalized),
        csvEscape(row.displayName),
        csvEscape("threshold"),
        "",
        csvEscape(row.year),
        csvEscape(row.thresholdKey),
        csvEscape(row.thresholdLabel),
        csvEscape(row.actual),
        csvEscape(row.fullMarketSimulated),
        csvEscape(row.fullMarketDelta),
        row.clientSimulated === null ? "" : csvEscape(row.clientSimulated),
        row.clientDelta === null ? "" : csvEscape(row.clientDelta),
        row.diffSimulated === null ? "" : csvEscape(row.diffSimulated),
        csvEscape(row.inverted),
        csvEscape(row.sampleSizeFullMarket),
        row.sampleSizeClient === null ? "" : csvEscape(row.sampleSizeClient),
        csvEscape(row.meanAbsoluteErrorFull),
        row.meanAbsoluteErrorClient === null ? "" : csvEscape(row.meanAbsoluteErrorClient),
        csvEscape(row.tukeyApplied),
        csvEscape(row.guardrailsApplied),
        csvEscape(row.methodologyMethod),
        csvEscape(row.methodologyFoldCount),
        csvEscape(row.methodologySeed),
        csvEscape(row.methodologyTukeyStartsIn),
      ].join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}
