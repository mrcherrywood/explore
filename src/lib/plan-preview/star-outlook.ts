/**
 * Experimental PP1 star outlook: asymmetric cut-point ease band so
 * conservative base-case stars can show client-favorable upside without a
 * classical confidence interval.
 */

import {
  getCachedCutPointMethodologyOverall,
  type MethodologyForecastThreshold,
} from "@/lib/band-movement/cut-point-methodology";
import { OVERALL_DEDUP_DROP_CODES } from "@/lib/clover-impact/analysis";

import { isScoreDeltaImprovement } from "./score-delta-direction";
import { starFromThresholds, type PlanPreviewStarSource } from "./predictions";

export type ThresholdValues = {
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
};

export type MeasureStarOutlook = {
  baseStar: number;
  upsideStar: number;
  downsideStar: number;
  easeRadius: number;
  hasUpside: boolean;
  cutPressure: boolean;
  /** Points from the PP1 score to the next higher star cut under base thresholds. */
  pointsToUpside: number | null;
};

export type OverallStarOutlook = {
  baseMean: number;
  upsideMean: number;
  baseRounded: number;
  upsideRounded: number;
  /** True when upside rounds to a higher half-star than the base case. */
  hasUpside: boolean;
};

type ThresholdKey = keyof ThresholdValues;

const THRESHOLD_KEYS: ThresholdKey[] = ["twoStar", "threeStar", "fourStar", "fiveStar"];

const DEFAULT_FALLBACK_MAE = 1;

let maeByMeasureCache: Map<string, number> | null = null;
let fallbackMaeCache: number | null = null;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Convert forecast threshold rows into the banding shape. */
export function thresholdValuesFromForecast(
  thresholds: MethodologyForecastThreshold[] | null | undefined
): ThresholdValues | null {
  if (!thresholds || thresholds.length === 0) return null;
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

function ensureMaeCaches(): void {
  if (maeByMeasureCache && fallbackMaeCache !== null) return;

  // Reuse a warm Combined Accuracy cache when some other request already
  // computed it. Do not compute it here — the full-measure backtest can
  // exceed the report route budget and leave the page stuck on “Building…”.
  try {
    const overall = getCachedCutPointMethodologyOverall();
    if (overall) {
      maeByMeasureCache = new Map(
        overall.measures.map((row) => [row.measure, row.meanAbsoluteError] as const)
      );
      fallbackMaeCache = overall.fullMarket.meanAbsoluteError;
      return;
    }
  } catch {
    // fall through to the default radius
  }

  maeByMeasureCache = new Map();
  fallbackMaeCache = DEFAULT_FALLBACK_MAE;
}

/**
 * Historical methodology absolute error for a measure (points). Injectable
 * override keeps unit tests off the full backtest path.
 */
export function resolveEaseRadius(
  measureNormalized: string,
  override?: number | ((measureNormalized: string) => number)
): number {
  if (typeof override === "number") return Math.max(0, override);
  if (typeof override === "function") return Math.max(0, override(measureNormalized));

  ensureMaeCaches();
  const cached = maeByMeasureCache!.get(measureNormalized);
  if (cached !== undefined && Number.isFinite(cached)) return Math.max(0, cached);
  return Math.max(0, fallbackMaeCache ?? DEFAULT_FALLBACK_MAE);
}

/** @internal test helper — clears process MAE caches. */
export function resetStarOutlookCachesForTests(): void {
  maeByMeasureCache = null;
  fallbackMaeCache = null;
}

function softenValue(value: number, ease: number, inverted: boolean): number {
  return inverted ? value + ease : value - ease;
}

function tightenValue(value: number, ease: number, inverted: boolean): number {
  return inverted ? value - ease : value + ease;
}

/** Softer = easier for the contract to reach a higher star. */
function softerOf(a: number, b: number, inverted: boolean): number {
  return inverted ? Math.max(a, b) : Math.min(a, b);
}

export function easeThresholds(
  applied: ThresholdValues,
  easeRadius: number,
  inverted: boolean,
  direction: "optimistic" | "pessimistic",
  model?: ThresholdValues | null
): ThresholdValues {
  const eased: ThresholdValues = {
    twoStar:
      direction === "optimistic"
        ? softenValue(applied.twoStar, easeRadius, inverted)
        : tightenValue(applied.twoStar, easeRadius, inverted),
    threeStar:
      direction === "optimistic"
        ? softenValue(applied.threeStar, easeRadius, inverted)
        : tightenValue(applied.threeStar, easeRadius, inverted),
    fourStar:
      direction === "optimistic"
        ? softenValue(applied.fourStar, easeRadius, inverted)
        : tightenValue(applied.fourStar, easeRadius, inverted),
    fiveStar:
      direction === "optimistic"
        ? softenValue(applied.fiveStar, easeRadius, inverted)
        : tightenValue(applied.fiveStar, easeRadius, inverted),
  };

  if (direction !== "optimistic" || !model) return eased;

  const merged = { ...eased };
  for (const key of THRESHOLD_KEYS) {
    merged[key] = softerOf(eased[key], model[key], inverted);
  }
  return merged;
}

function nextStarCut(
  currentStar: number,
  thresholds: ThresholdValues
): number | null {
  if (currentStar >= 5) return null;
  if (currentStar <= 1) return thresholds.twoStar;
  if (currentStar === 2) return thresholds.threeStar;
  if (currentStar === 3) return thresholds.fourStar;
  return thresholds.fiveStar;
}

export function pointsToNextStar(
  score: number,
  thresholds: ThresholdValues,
  inverted: boolean,
  currentStar: number
): number | null {
  const cut = nextStarCut(currentStar, thresholds);
  if (cut === null) return null;
  if (inverted) {
    return score > cut ? round2(score - cut) : 0;
  }
  return score < cut ? round2(cut - score) : 0;
}

export type BuildMeasureStarOutlookInput = {
  /** Score used for cut-point banding (whole-number style when applicable). */
  score: number;
  /**
   * Score used for YoY improvement / cut-pressure (defaults to `score`).
   * Pass the display PP1 score when banding rounds away the raw delta.
   */
  comparisonScore?: number;
  inverted: boolean;
  starSource: PlanPreviewStarSource | null;
  predictedStar: number | null;
  publishedBaselineStar: number | null;
  publishedBaselineScore: number | null;
  appliedThresholds: ThresholdValues | null;
  modelThresholds?: ThresholdValues | null;
  /** Injected MAE (or resolver) for tests / overrides. */
  easeRadius?: number | ((measureNormalized: string) => number);
  measureNormalized: string;
};

/**
 * Per-measure asymmetric outlook. Returns null when the star is not cut-point
 * banded or thresholds are missing.
 */
export function buildMeasureStarOutlook(
  input: BuildMeasureStarOutlookInput
): MeasureStarOutlook | null {
  if (input.starSource !== "cut_points") return null;
  if (input.predictedStar === null || input.appliedThresholds === null) return null;

  const easeRadius = resolveEaseRadius(input.measureNormalized, input.easeRadius);
  const optimistic = easeThresholds(
    input.appliedThresholds,
    easeRadius,
    input.inverted,
    "optimistic",
    input.modelThresholds ?? null
  );
  const pessimistic = easeThresholds(
    input.appliedThresholds,
    easeRadius,
    input.inverted,
    "pessimistic"
  );

  // Prefer the engine's predicted star so outlook stays aligned with the report.
  const bandedBase = starFromThresholds(
    input.score,
    input.appliedThresholds,
    input.inverted
  );
  const baseStar = input.predictedStar ?? bandedBase;
  const upsideStar = Math.max(
    baseStar,
    starFromThresholds(input.score, optimistic, input.inverted)
  );
  const downsideStar = Math.min(
    baseStar,
    starFromThresholds(input.score, pessimistic, input.inverted)
  );

  const hasUpside = upsideStar > baseStar;
  const comparisonScore = input.comparisonScore ?? input.score;
  const scoreImproved =
    input.publishedBaselineScore !== null &&
    isScoreDeltaImprovement(
      comparisonScore - input.publishedBaselineScore,
      input.inverted
    );
  const cutPressure =
    scoreImproved &&
    input.publishedBaselineStar !== null &&
    baseStar < input.publishedBaselineStar;

  return {
    baseStar,
    upsideStar,
    downsideStar,
    easeRadius: round2(easeRadius),
    hasUpside,
    cutPressure,
    pointsToUpside: hasUpside
      ? pointsToNextStar(input.score, input.appliedThresholds, input.inverted, baseStar)
      : null,
  };
}

export type OverallOutlookMeasure = {
  measureCode: string;
  weight: number;
  predictedStar: number | null;
  outlook: MeasureStarOutlook | null;
};

export type BuildOverallStarOutlookInput = {
  measures: OverallOutlookMeasure[];
  /** Without-QI reward factor from the baseline scenario. */
  rewardFactor: number;
  /** Overall CAI applied in the baseline scenario (0 when missing). */
  caiValue: number;
  /** Official base-case rounded rating from the scenario engine. */
  baseRounded: number;
};

/**
 * Approximate overall envelope: swap in upside measure stars, keep the same
 * reward factor and CAI (no RF recompute).
 */
export function buildOverallStarOutlook(
  input: BuildOverallStarOutlookInput
): OverallStarOutlook | null {
  let baseSum = 0;
  let upsideSum = 0;
  let weightSum = 0;

  for (const measure of input.measures) {
    if (measure.predictedStar === null) continue;
    if (OVERALL_DEDUP_DROP_CODES.has(measure.measureCode.toUpperCase())) continue;
    if (!Number.isFinite(measure.weight) || measure.weight <= 0) continue;

    const upsideStar = measure.outlook?.upsideStar ?? measure.predictedStar;
    baseSum += measure.predictedStar * measure.weight;
    upsideSum += upsideStar * measure.weight;
    weightSum += measure.weight;
  }

  if (weightSum <= 0) return null;

  const baseMean = round2(baseSum / weightSum);
  const upsideMean = round2(upsideSum / weightSum);
  // Match final-scores: clamp(mean + RF, 1–5) + CAI, then round to half star.
  const upsideFinal =
    Math.min(5, Math.max(1, upsideMean + input.rewardFactor)) + input.caiValue;
  const upsideRounded = roundToHalf(Math.min(5, Math.max(1, upsideFinal)));
  const baseRounded = input.baseRounded;

  return {
    baseMean,
    upsideMean,
    baseRounded,
    upsideRounded,
    hasUpside: upsideRounded > baseRounded,
  };
}
