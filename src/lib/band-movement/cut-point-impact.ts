import path from "node:path";

import {
  loadMeasureCutPoints,
  matchCutPointToMeasureName,
} from "@/lib/percentile-analysis/measure-matching";
import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";
import {
  analyzeHistoricalBandMovement,
  getAvailableOptions,
  type HistoricalTransition,
  type PerFromScoreRow,
  type UnifiedMeasure,
} from "./analysis";

export type { PerFromScoreRow };

const DATA_DIR = path.join(process.cwd(), "data");
const CUT_POINTS_PATH = path.join(
  DATA_DIR,
  "Stars 2016-2028 Cut Points 12.2025_with_weights.xlsx"
);
const FORECAST_YEARS = [2027, 2028] as const;
const HISTORICAL_YEARS = Array.from({ length: 11 }, (_, i) => 2016 + i); // 2016-2026

type StarRating = 1 | 2 | 3 | 4 | 5;
type ThresholdKey = "twoStar" | "threeStar" | "fourStar" | "fiveStar";
const THRESHOLD_KEYS: ThresholdKey[] = ["twoStar", "threeStar", "fourStar", "fiveStar"];
const THRESHOLD_STAR: Record<ThresholdKey, StarRating> = {
  twoStar: 2,
  threeStar: 3,
  fourStar: 4,
  fiveStar: 5,
};

export type CutPointImpactRow = {
  fromYear: number;
  toYear: number;
  cohortSize: number;
  avgScoreChange: number | null;
  medianScoreChange: number | null;
  cutPointDelta: number;
  cutPointFrom: number;
  cutPointTo: number;
  distributionMeanFrom: number | null;
  distributionMeanTo: number | null;
  /** Avg score change by from-year score (within this star band). */
  perFromScore: PerFromScoreRow[];
};

export type LinearFit = {
  slope: number;
  intercept: number;
  r: number;
  rSquared: number;
  n: number;
};

export type ProjectionConfidence = "reasonable" | "low" | "suppressed";

export type ProjectionWarning = {
  code: "weak_correlation" | "extreme_delta" | "contradicts_trend" | "insufficient_data";
  message: string;
};

export type ProjectionMethod = "blended" | "regression_only" | "forecast_only";

export type CutPointImpactSummary = {
  thresholdKey: ThresholdKey;
  thresholdLabel: string;
  starLevel: StarRating;
  dataPoints: CutPointImpactRow[];
  fit: LinearFit | null;
  latestCutPoint: number | null;
  latestAvgScoreChange: number | null;
  projectedNextCutPoint: number | null;
  projectedDelta: number | null;
  projectionConfidence: ProjectionConfidence;
  projectionWarnings: ProjectionWarning[];
  projectionMethod: ProjectionMethod | null;
  regressionOnlyProjection: number | null;
  forecastCutPoints: { year: number; value: number }[];
};

export type HistoricalCutPointYear = {
  year: number;
  thresholds: Record<ThresholdKey, number>;
};

export type CutPointImpactResponse = {
  measure: string;
  displayName: string;
  perBand: CutPointImpactSummary[];
  historicalCutPoints: HistoricalCutPointYear[];
  transitionCount: number;
  projectionYear: number;
};

let forecastCache: Map<number, MeasureCutPoint[]> | null = null;
let historicalCache: Map<number, MeasureCutPoint[]> | null = null;

function ensureForecastCutPoints(): Map<number, MeasureCutPoint[]> {
  if (forecastCache) return forecastCache;
  try {
    forecastCache = loadMeasureCutPoints(CUT_POINTS_PATH, [...FORECAST_YEARS]);
  } catch {
    forecastCache = new Map();
  }
  return forecastCache;
}

function ensureHistoricalCutPoints(): Map<number, MeasureCutPoint[]> {
  if (historicalCache) return historicalCache;
  try {
    historicalCache = loadMeasureCutPoints(CUT_POINTS_PATH, HISTORICAL_YEARS);
  } catch {
    historicalCache = new Map();
  }
  return historicalCache;
}

function lookupHistoricalCutPoints(
  measure: UnifiedMeasure,
  cutPointsByYear: Map<number, MeasureCutPoint[]>
): HistoricalCutPointYear[] {
  const results: HistoricalCutPointYear[] = [];
  const codePrefix = Object.values(measure.codesByYear)[0]?.[0] ?? "C";

  for (const year of HISTORICAL_YEARS) {
    const cutPoints = cutPointsByYear.get(year);
    if (!cutPoints) continue;
    const match = matchCutPointToMeasureName(measure.displayName, codePrefix, cutPoints);
    if (match) {
      results.push({
        year,
        thresholds: {
          twoStar: match.thresholds.twoStar,
          threeStar: match.thresholds.threeStar,
          fourStar: match.thresholds.fourStar,
          fiveStar: match.thresholds.fiveStar,
        },
      });
    }
  }

  return results;
}

function linearRegression(
  xs: number[],
  ys: number[]
): LinearFit | null {
  const n = xs.length;
  if (n < 2) return null;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssXX = 0;
  let ssYY = 0;
  let ssXY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    ssXX += dx * dx;
    ssYY += dy * dy;
    ssXY += dx * dy;
  }

  if (ssXX === 0) return null;

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const denom = Math.sqrt(ssXX * ssYY);
  const r = denom === 0 ? 0 : ssXY / denom;

  return {
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(4)),
    r: Number(r.toFixed(4)),
    rSquared: Number((r * r).toFixed(4)),
    n,
  };
}

function lookupForecastCutPoints(
  measure: UnifiedMeasure,
  forecastCutPoints: Map<number, MeasureCutPoint[]>
): { year: number; thresholds: Record<ThresholdKey, number> }[] {
  const results: { year: number; thresholds: Record<ThresholdKey, number> }[] = [];
  const codePrefix = Object.values(measure.codesByYear)[0]?.[0] ?? "C";

  for (const year of FORECAST_YEARS) {
    const cutPoints = forecastCutPoints.get(year);
    if (!cutPoints) continue;
    const match = matchCutPointToMeasureName(measure.displayName, codePrefix, cutPoints);
    if (match) {
      results.push({
        year,
        thresholds: {
          twoStar: match.thresholds.twoStar,
          threeStar: match.thresholds.threeStar,
          fourStar: match.thresholds.fourStar,
          fiveStar: match.thresholds.fiveStar,
        },
      });
    }
  }

  return results;
}

function assessProjection(
  projectedDelta: number,
  fit: LinearFit,
  historicalCutPoints: HistoricalCutPointYear[],
  thresholdKey: ThresholdKey
): { confidence: ProjectionConfidence; warnings: ProjectionWarning[]; cappedDelta: number } {
  const warnings: ProjectionWarning[] = [];

  const historicalValues = historicalCutPoints.map((h) => h.thresholds[thresholdKey]);
  const historicalDeltas: number[] = [];
  for (let i = 1; i < historicalValues.length; i++) {
    historicalDeltas.push(historicalValues[i] - historicalValues[i - 1]);
  }

  const recentDeltas = historicalDeltas.slice(-5);
  const recentMaxDelta = recentDeltas.length > 0
    ? Math.max(...recentDeltas.map(Math.abs))
    : 3;
  const deltaCap = Math.max(recentMaxDelta * 1.5, 3);

  let cappedDelta = projectedDelta;
  if (Math.abs(projectedDelta) > deltaCap) {
    cappedDelta = Math.sign(projectedDelta) * deltaCap;
    warnings.push({
      code: "extreme_delta",
      message: `Projected change (${projectedDelta > 0 ? "+" : ""}${projectedDelta.toFixed(1)}) exceeded recent range; capped to ${cappedDelta > 0 ? "+" : ""}${cappedDelta.toFixed(1)}`,
    });
  }

  if (fit.n <= 2) {
    warnings.push({
      code: "insufficient_data",
      message: `Only ${fit.n} data points — r is always ±1.00 with 2 points, not a real signal`,
    });
  }

  if (Math.abs(fit.r) < 0.5 && fit.n > 2) {
    warnings.push({
      code: "weak_correlation",
      message: `Weak correlation (r=${fit.r.toFixed(2)}) — score movement explains little of the cut point variation`,
    });
  }

  if (historicalDeltas.length >= 3) {
    const lastDeltas = historicalDeltas.slice(-3);
    const avgRecentDirection = lastDeltas.reduce((a, b) => a + b, 0) / lastDeltas.length;

    if (avgRecentDirection > 0.3 && cappedDelta < -0.5) {
      warnings.push({
        code: "contradicts_trend",
        message: `Cut points have been rising historically, but model projects a decline`,
      });
    } else if (avgRecentDirection < -0.3 && cappedDelta > 0.5) {
      warnings.push({
        code: "contradicts_trend",
        message: `Cut points have been falling historically, but model projects an increase`,
      });
    }
  }

  let confidence: ProjectionConfidence = "reasonable";
  if (warnings.length >= 2) {
    confidence = "suppressed";
  } else if (warnings.length > 0 || fit.n <= 3) {
    confidence = "low";
  }

  return { confidence, warnings, cappedDelta };
}

export function analyzeCutPointImpact(
  measureNorm: string
): CutPointImpactResponse | null {
  const { measures } = getAvailableOptions();
  const measure = measures.find((m) => m.normalizedName === measureNorm);
  if (!measure) return null;

  const stars: StarRating[] = [1, 2, 3, 4, 5];
  const allHistories = new Map<StarRating, HistoricalTransition[]>();

  for (const s of stars) {
    const { history } = analyzeHistoricalBandMovement(measureNorm, s);
    allHistories.set(s, history);
  }

  const forecastCutPoints = ensureForecastCutPoints();
  const forecasts = lookupForecastCutPoints(measure, forecastCutPoints);

  const historicalCutPointsByYear = ensureHistoricalCutPoints();
  const historicalCutPoints = lookupHistoricalCutPoints(measure, historicalCutPointsByYear);

  const perBand: CutPointImpactSummary[] = [];

  for (const thresholdKey of THRESHOLD_KEYS) {
    const starLevel = THRESHOLD_STAR[thresholdKey];
    const history = allHistories.get(starLevel) ?? [];
    const dataPoints: CutPointImpactRow[] = [];

    for (const t of history) {
      if (!t.cutPoints) continue;

      const groups = [t.movement.improvedScores, t.movement.heldScores, t.movement.declinedScores];
      let totalCount = 0;
      let weightedSum = 0;

      for (const group of groups) {
        if (group.avgScoreChange !== null && group.count > 0) {
          weightedSum += group.avgScoreChange * group.count;
          totalCount += group.count;
        }
      }

      const avgScoreChange = totalCount > 0 ? Number((weightedSum / totalCount).toFixed(2)) : null;
      const medianScoreChange =
        t.scoreStats?.from.median != null && t.scoreStats?.to.median != null
          ? Number((t.scoreStats.to.median - t.scoreStats.from.median).toFixed(2))
          : null;

      dataPoints.push({
        fromYear: t.fromYear,
        toYear: t.toYear,
        cohortSize: t.movement.cohortSize,
        avgScoreChange,
        medianScoreChange,
        cutPointDelta: t.cutPoints.delta[thresholdKey],
        cutPointFrom: t.cutPoints.fromYear[thresholdKey],
        cutPointTo: t.cutPoints.toYear[thresholdKey],
        distributionMeanFrom: t.scoreStats?.from.mean ?? null,
        distributionMeanTo: t.scoreStats?.to.mean ?? null,
        perFromScore: t.perFromScore,
      });
    }

    const validXY = dataPoints.filter((d) => d.avgScoreChange !== null);
    const fit = linearRegression(
      validXY.map((d) => d.avgScoreChange!),
      validXY.map((d) => d.cutPointDelta)
    );

    const lastPoint = dataPoints[dataPoints.length - 1] ?? null;
    const latestCutPoint = lastPoint?.cutPointTo ?? null;
    const latestAvgScoreChange = lastPoint?.avgScoreChange ?? null;

    let projectedNextCutPoint: number | null = null;
    let projectedDelta: number | null = null;
    let projectionConfidence: ProjectionConfidence = "suppressed";
    let projectionWarnings: ProjectionWarning[] = [];
    let projectionMethod: ProjectionMethod | null = null;
    let regressionOnlyProjection: number | null = null;

    const forecastCutPointsForThreshold = forecasts.map((f) => ({
      year: f.year,
      value: f.thresholds[thresholdKey],
    }));
    const workbookForecast = forecastCutPointsForThreshold[0]?.value ?? null;

    if (fit && latestCutPoint !== null && latestAvgScoreChange !== null) {
      const rawDelta = fit.slope * latestAvgScoreChange + fit.intercept;
      const assessment = assessProjection(rawDelta, fit, historicalCutPoints, thresholdKey);
      projectionWarnings = assessment.warnings;

      const regressionValue = Number((latestCutPoint + assessment.cappedDelta).toFixed(2));
      regressionOnlyProjection = regressionValue;

      if (workbookForecast !== null) {
        const WORKBOOK_WEIGHT = 0.7;
        const REGRESSION_WEIGHT = 0.3;
        const blended = workbookForecast * WORKBOOK_WEIGHT + regressionValue * REGRESSION_WEIGHT;
        projectedNextCutPoint = Number(blended.toFixed(2));
        projectedDelta = Number((projectedNextCutPoint - latestCutPoint).toFixed(2));
        projectionMethod = "blended";
        projectionConfidence = assessment.confidence === "suppressed" ? "low" : assessment.confidence;
      } else if (assessment.confidence !== "suppressed") {
        projectedNextCutPoint = regressionValue;
        projectedDelta = Number(assessment.cappedDelta.toFixed(2));
        projectionMethod = "regression_only";
        projectionConfidence = assessment.confidence;
      } else {
        projectedDelta = Number(rawDelta.toFixed(2));
        projectionConfidence = "suppressed";
        projectionMethod = "regression_only";
      }
    } else if (workbookForecast !== null && latestCutPoint !== null) {
      projectedNextCutPoint = workbookForecast;
      projectedDelta = Number((workbookForecast - latestCutPoint).toFixed(2));
      projectionMethod = "forecast_only";
      projectionConfidence = "low";
    }

    if (projectedNextCutPoint !== null && projectedNextCutPoint > 100) {
      projectedNextCutPoint = 100;
      projectedDelta = latestCutPoint !== null ? Number((100 - latestCutPoint).toFixed(2)) : projectedDelta;
    }
    if (regressionOnlyProjection !== null && regressionOnlyProjection > 100) {
      regressionOnlyProjection = 100;
    }

    const thresholdLabel = `${starLevel}★`;

    perBand.push({
      thresholdKey,
      thresholdLabel,
      starLevel,
      dataPoints,
      fit,
      latestCutPoint,
      latestAvgScoreChange,
      projectedNextCutPoint,
      projectedDelta,
      projectionConfidence,
      projectionWarnings,
      projectionMethod,
      regressionOnlyProjection,
      forecastCutPoints: forecastCutPointsForThreshold,
    });
  }

  const refHistory = allHistories.get(3) ?? allHistories.get(4) ?? [];

  const lastTransition = perBand[0]?.dataPoints[perBand[0].dataPoints.length - 1];
  const projectionYear = lastTransition ? lastTransition.toYear + 1 : 2027;

  return {
    measure: measureNorm,
    displayName: measure.displayName,
    perBand,
    historicalCutPoints,
    transitionCount: refHistory.length,
    projectionYear,
  };
}
