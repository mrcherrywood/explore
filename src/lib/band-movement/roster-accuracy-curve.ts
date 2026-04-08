import {
  getAvailableMeasureYears,
  getMeasureByNormalizedName,
  getMeasureYearScoreSamples,
  type MeasureScoreSample,
} from "./analysis";
import {
  isInvertedMeasure,
  matchCutPointToMeasureName,
  normalizeMeasureName,
} from "@/lib/percentile-analysis/measure-matching";
import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";
import {
  applyTukeyFilter,
  assignResampleFolds,
  clusterScoresWard,
  deriveThresholdsFromClusters,
  applyGuardrails,
  computeCahpsPercentileThresholds,
  loadClientContractIds,
} from "./cut-point-methodology";

const RESAMPLE_FOLD_COUNT = 10;
const TUKEY_START_YEAR = 2024;
const TRIALS_PER_SIZE = 5;
const THRESHOLD_KEYS = ["twoStar", "threeStar", "fourStar", "fiveStar"] as const;

type ThresholdValues = Record<(typeof THRESHOLD_KEYS)[number], number>;

export const CAHPS_MEASURE_NAMES = new Set([
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

export type RosterCurvePoint = {
  rosterSize: number;
  avgMae: number;
  minMae: number;
  maxMae: number;
  trials: number;
  isClientRoster: boolean;
  isFullMarket: boolean;
};

export type RosterAccuracyCurveResponse = {
  status: "ready";
  measure: string;
  displayName: string;
  method: "clustering" | "cahps-percentile";
  clientRosterSize: number;
  fullMarketAvgSize: number;
  curve: RosterCurvePoint[];
  years: number[];
} | {
  status: "unsupported";
  measure: string;
  displayName: string;
  reason: string;
};

export function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function shuffleArray<T>(arr: T[], rand: () => number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const swapIdx = Math.floor(rand() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[swapIdx];
    shuffled[swapIdx] = temp;
  }
  return shuffled;
}

export function computeSingleYearMae(
  samples: MeasureScoreSample[],
  official: MeasureCutPoint,
  inverted: boolean,
  isCahps: boolean,
  tukeyApplied: boolean,
  priorOfficial: MeasureCutPoint | null,
): number | null {
  if (isCahps) {
    if (samples.length < 10) return null;
    const thresholds = computeCahpsPercentileThresholds(samples.map((s) => s.score));
    return computeMaeFromThresholds(thresholds, official);
  }

  if (samples.length < RESAMPLE_FOLD_COUNT) return null;

  const bounds = { min: 0, max: 100, isPercentageScale: true as const };
  const filtered = tukeyApplied
    ? applyTukeyFilter(samples, bounds)
    : { samples, outliersRemoved: 0, fences: { lower: 0, upper: 100 } };
  if (filtered.samples.length < 5) return null;

  const foldAssignments = assignResampleFolds(filtered.samples);
  const resampledThresholds: ThresholdValues[] = [];
  for (let fold = 0; fold < RESAMPLE_FOLD_COUNT; fold += 1) {
    const trainingScores = foldAssignments.filter((s) => s.fold !== fold).map((s) => s.score);
    if (trainingScores.length < 5) continue;
    resampledThresholds.push(deriveThresholdsFromClusters(clusterScoresWard(trainingScores, 5), inverted));
  }
  if (resampledThresholds.length === 0) return null;

  const averaged = averageThresholds(resampledThresholds);
  const guarded = applyGuardrails(
    averaged,
    priorOfficial
      ? { twoStar: priorOfficial.thresholds.twoStar, threeStar: priorOfficial.thresholds.threeStar, fourStar: priorOfficial.thresholds.fourStar, fiveStar: priorOfficial.thresholds.fiveStar }
      : null,
    bounds,
    Math.max(0, filtered.fences.upper - filtered.fences.lower),
    inverted,
  );

  return computeMaeFromThresholds(guarded.thresholds, official);
}

export function averageThresholds(results: ThresholdValues[]): ThresholdValues {
  return THRESHOLD_KEYS.reduce((acc, key) => {
    acc[key] = round2(results.reduce((sum, item) => sum + item[key], 0) / results.length);
    return acc;
  }, {} as ThresholdValues);
}

export function computeMaeFromThresholds(simulated: ThresholdValues, official: MeasureCutPoint): number {
  const errors = THRESHOLD_KEYS.map((key) => Math.abs(simulated[key] - official.thresholds[key]));
  return round2(errors.reduce((sum, e) => sum + e, 0) / errors.length);
}

export type YearContext = {
  year: number;
  allSamples: MeasureScoreSample[];
  official: MeasureCutPoint;
  priorOfficial: MeasureCutPoint | null;
  tukeyApplied: boolean;
};

function buildSizeSteps(clientSize: number, maxSize: number): number[] {
  const steps: Set<number> = new Set();
  const startSize = 20;
  const stepSize = Math.max(10, Math.round(maxSize / 20));

  for (let n = startSize; n < maxSize; n += stepSize) {
    steps.add(n);
  }
  steps.add(clientSize);
  steps.add(maxSize);

  return [...steps].sort((a, b) => a - b);
}

function runTrialsAtSize(
  size: number,
  yearContexts: YearContext[],
  inverted: boolean,
  isCahps: boolean,
  trialSeed: number,
): { avgMae: number; minMae: number; maxMae: number; trials: number } {
  const trialMaes: number[] = [];

  for (let trial = 0; trial < TRIALS_PER_SIZE; trial += 1) {
    const rand = createSeededRandom(trialSeed + trial * 7919);
    let validYears = 0;
    let totalMae = 0;

    for (const ctx of yearContexts) {
      const subsample = size >= ctx.allSamples.length
        ? ctx.allSamples
        : shuffleArray(ctx.allSamples, rand).slice(0, size);

      const mae = computeSingleYearMae(
        subsample, ctx.official, inverted, isCahps, ctx.tukeyApplied, ctx.priorOfficial,
      );
      if (mae !== null) {
        totalMae += mae;
        validYears += 1;
      }
    }

    if (validYears > 0) {
      trialMaes.push(round2(totalMae / validYears));
    }
  }

  if (trialMaes.length === 0) {
    return { avgMae: Number.NaN, minMae: Number.NaN, maxMae: Number.NaN, trials: 0 };
  }

  return {
    avgMae: round2(trialMaes.reduce((s, v) => s + v, 0) / trialMaes.length),
    minMae: round2(Math.min(...trialMaes)),
    maxMae: round2(Math.max(...trialMaes)),
    trials: trialMaes.length,
  };
}

export function analyzeRosterAccuracyCurve(
  measureNorm: string,
  officialCutPointsByYear: Map<number, MeasureCutPoint[]>,
): RosterAccuracyCurveResponse {
  const measure = getMeasureByNormalizedName(measureNorm);
  if (!measure) {
    return { status: "unsupported", measure: measureNorm, displayName: measureNorm, reason: "Measure not found." };
  }
  if (/quality improvement/i.test(measure.displayName)) {
    return { status: "unsupported", measure: measureNorm, displayName: measure.displayName, reason: "Quality Improvement measures excluded." };
  }

  const isCahps = CAHPS_MEASURE_NAMES.has(normalizeMeasureName(measure.displayName));
  const inverted = isInvertedMeasure(measure.displayName);
  const clientIds = loadClientContractIds();

  const yearContexts: YearContext[] = [];
  for (const year of getAvailableMeasureYears()) {
    const allSamples = getMeasureYearScoreSamples(measureNorm, year);
    const codePrefix = (measure.codesByYear[year] ?? Object.values(measure.codesByYear)[0] ?? "C")[0];
    const official = matchCutPointToMeasureName(measure.displayName, codePrefix, officialCutPointsByYear.get(year) ?? []);
    const priorOfficial = matchCutPointToMeasureName(measure.displayName, codePrefix, officialCutPointsByYear.get(year - 1) ?? []);
    if (!official || allSamples.length < RESAMPLE_FOLD_COUNT) continue;
    yearContexts.push({ year, allSamples, official, priorOfficial, tukeyApplied: year >= TUKEY_START_YEAR });
  }

  if (yearContexts.length === 0) {
    return { status: "unsupported", measure: measureNorm, displayName: measure.displayName, reason: "No backtest years available." };
  }

  const avgMarketSize = Math.round(
    yearContexts.reduce((sum, ctx) => sum + ctx.allSamples.length, 0) / yearContexts.length
  );
  const clientSamplesPerYear = yearContexts.map((ctx) =>
    ctx.allSamples.filter((s) => clientIds.has(s.contractId)).length
  );
  const avgClientSize = Math.round(
    clientSamplesPerYear.reduce((s, v) => s + v, 0) / clientSamplesPerYear.length
  );

  const sizeSteps = buildSizeSteps(avgClientSize, avgMarketSize);

  const curve: RosterCurvePoint[] = [];
  for (const size of sizeSteps) {
    const result = runTrialsAtSize(size, yearContexts, inverted, isCahps, size * 31337);
    if (result.trials === 0) continue;
    curve.push({
      rosterSize: size,
      ...result,
      isClientRoster: size === avgClientSize,
      isFullMarket: size === avgMarketSize,
    });
  }

  return {
    status: "ready",
    measure: measureNorm,
    displayName: measure.displayName,
    method: isCahps ? "cahps-percentile" : "clustering",
    clientRosterSize: avgClientSize,
    fullMarketAvgSize: avgMarketSize,
    curve,
    years: yearContexts.map((ctx) => ctx.year),
  };
}
