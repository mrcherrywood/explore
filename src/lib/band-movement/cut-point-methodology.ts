import path from "node:path";

import {
  getAvailableMeasureYears,
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
  "getting needed care",
  "getting appointments and care quickly",
  "customer service",
  "rating of health care quality",
  "rating of health plan",
  "care coordination",
  "getting needed prescription drugs",
  "rating of drug plan",
]);

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

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function ensureOfficialCutPoints(): Map<number, MeasureCutPoint[]> {
  if (!officialCutPointsCache) {
    officialCutPointsCache = loadMeasureCutPoints(CUT_POINTS_PATH, [2022, ...getAvailableMeasureYears()]);
  }
  return officialCutPointsCache;
}

function isCahpsMeasure(displayName: string): boolean {
  return CAHPS_MEASURE_NAMES.has(normalizeMeasureName(displayName));
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
  const fences = computeTukeyFences(samples.map((sample) => sample.score), bounds);
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

function lookupOfficialCutPoint(
  measure: UnifiedMeasure,
  year: number,
  cutPointsByYear: Map<number, MeasureCutPoint[]>
): MeasureCutPoint | null {
  const codePrefix = (measure.codesByYear[year] ?? Object.values(measure.codesByYear)[0] ?? "C")[0];
  const cutPoints = cutPointsByYear.get(year) ?? [];
  return matchCutPointToMeasureName(measure.displayName, codePrefix, cutPoints);
}

export function analyzeCutPointMethodologyBacktest(measureNorm: string): MethodologyBacktestResponse {
  const measure = getMeasureByNormalizedName(measureNorm);
  if (!measure) {
    return { status: "unsupported", measure: measureNorm, displayName: measureNorm, reason: "Measure not found." };
  }

  if (isCahpsMeasure(measure.displayName)) {
    return { status: "unsupported", measure: measureNorm, displayName: measure.displayName, reason: "CAHPS measures use a different CMS methodology and are excluded from this backtest." };
  }

  if (isQualityImprovementMeasure(measure.displayName)) {
    return { status: "unsupported", measure: measureNorm, displayName: measure.displayName, reason: "Quality Improvement measures use a special split-clustering methodology and are excluded from this first pass." };
  }

  const officialCutPointsByYear = ensureOfficialCutPoints();
  const inverted = isInvertedMeasure(measure.displayName);
  const results: MethodologyBacktestYear[] = [];

  for (const year of getAvailableMeasureYears()) {
    const rawSamples = getMeasureYearScoreSamples(measureNorm, year);
    const official = lookupOfficialCutPoint(measure, year, officialCutPointsByYear);
    if (!official || rawSamples.length < RESAMPLE_FOLD_COUNT) continue;

    const bounds = inferScaleBounds(rawSamples.map((sample) => sample.score));
    const tukeyApplied = year >= TUKEY_START_YEAR;
    const filtered = tukeyApplied ? applyTukeyFilter(rawSamples, bounds) : {
      samples: rawSamples,
      outliersRemoved: 0,
      fences: { lower: bounds.min, upper: bounds.max },
    };
    if (filtered.samples.length < 5) continue;

    const foldAssignments = assignResampleFolds(filtered.samples);
    const resampledThresholds: ThresholdValues[] = [];
    for (let fold = 0; fold < RESAMPLE_FOLD_COUNT; fold += 1) {
      const trainingScores = foldAssignments
        .filter((sample) => sample.fold !== fold)
        .map((sample) => sample.score);
      if (trainingScores.length < 5) continue;
      const clusters = clusterScoresWard(trainingScores, 5);
      resampledThresholds.push(deriveThresholdsFromClusters(clusters, inverted));
    }
    if (resampledThresholds.length === 0) continue;

    const averaged = averageThresholds(resampledThresholds);
    const priorOfficial = lookupOfficialCutPoint(measure, year - 1, officialCutPointsByYear);
    const guarded = applyGuardrails(
      averaged,
      priorOfficial
        ? {
            twoStar: priorOfficial.thresholds.twoStar,
            threeStar: priorOfficial.thresholds.threeStar,
            fourStar: priorOfficial.thresholds.fourStar,
            fiveStar: priorOfficial.thresholds.fiveStar,
          }
        : null,
      bounds,
      Math.max(0, filtered.fences.upper - filtered.fences.lower),
      inverted
    );
    const finalThresholds = enforceThresholdOrder(guarded.thresholds, bounds, inverted);

    const thresholdComparisons = THRESHOLD_KEYS.map((key) => {
      const actual = official.thresholds[key];
      const simulated = finalThresholds[key];
      const delta = round2(simulated - actual);
      return {
        key,
        label: THRESHOLD_LABELS[key],
        actual,
        simulated,
        delta,
        absError: round2(Math.abs(delta)),
      };
    });
    const meanAbsoluteError = round2(
      thresholdComparisons.reduce((sum, comparison) => sum + comparison.absError, 0) / thresholdComparisons.length
    );

    results.push({
      year,
      rawSampleSize: rawSamples.length,
      sampleSize: filtered.samples.length,
      resampleRuns: resampledThresholds.length,
      outliersRemoved: filtered.outliersRemoved,
      tukeyApplied,
      guardrailsApplied: Boolean(priorOfficial),
      guardrailCap: guarded.cap,
      meanAbsoluteError,
      maxAbsoluteError: Math.max(...thresholdComparisons.map((comparison) => comparison.absError)),
      thresholdComparisons,
      notes: [
        tukeyApplied
          ? `Tukey outer-fence deletion applied before clustering (${round2(filtered.fences.lower)} to ${round2(filtered.fences.upper)} kept).`
          : "Pre-2024 backtests skip Tukey deletion because CMS had not adopted it yet.",
        priorOfficial
          ? `Guardrails limited each threshold to ${guarded.cap} points around the prior-year official cut point.`
          : "No prior-year official cut point was available, so guardrails were not applied.",
      ],
    });
  }

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
    supportedYears: sortedResults.map((result) => result.year),
    years: sortedResults,
    summary: {
      comparedYears: sortedResults.length,
      avgMeanAbsoluteError: round2(
        sortedResults.reduce((sum, result) => sum + result.meanAbsoluteError, 0) / sortedResults.length
      ),
      bestYear,
      worstYear,
    },
    methodology: {
      foldCount: RESAMPLE_FOLD_COUNT,
      seed: RESAMPLE_SEED,
      tukeyStartsIn: TUKEY_START_YEAR,
      exclusions: ["CAHPS measures", "Quality Improvement measures"],
    },
  };
}
