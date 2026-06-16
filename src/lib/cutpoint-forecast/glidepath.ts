import {
  type GlidepathConfidenceLabel,
  type GlidepathMeasureType,
  type GlidepathProjection,
  type ImportedMonthlyMeasureRow,
} from "./types";

type ObservationPoint = {
  year: number;
  month: number;
  score: number;
};

type TrendFit = {
  slope: number;
  intercept: number;
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
]);

const HOS_MEASURE_CODES = new Set(["C04", "C05", "C06"]);

export function classifyMeasureType(
  measureNormalized: string,
  measureCode: string | null,
  metricCategory: "Part C" | "Part D" | "Other"
): GlidepathMeasureType {
  if (CAHPS_MEASURE_NAMES.has(measureNormalized)) return "cahps";
  if (HOS_MEASURE_NAMES.has(measureNormalized)) return "hos";
  if (measureCode && HOS_MEASURE_CODES.has(measureCode.toUpperCase())) return "hos";
  if (metricCategory === "Part D") return "pharmacy";
  return "hedis";
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function collapseObservedRows(rows: ImportedMonthlyMeasureRow[]): ObservationPoint[] {
  const byPeriod = new Map<string, ObservationPoint>();

  for (const row of rows) {
    if (row.rate === null) continue;
    const key = `${row.year}-${row.normalizedMonth}`;
    byPeriod.set(key, {
      year: row.year,
      month: row.normalizedMonth,
      score: row.rate,
    });
  }

  return [...byPeriod.values()].sort(
    (left, right) => left.year - right.year || left.month - right.month
  );
}

export function inferYearEndMonth(
  rows: ImportedMonthlyMeasureRow[],
  forecastYear: number
): number {
  const hasCloseoutMonth = rows.some(
    (row) => row.year <= forecastYear && row.normalizedMonth === 13
  );
  return hasCloseoutMonth ? 13 : 12;
}

function fitLinearTrend(points: ObservationPoint[]): TrendFit | null {
  if (points.length < 2) return null;

  const xs = points.map((point) => point.month);
  const ys = points.map((point) => point.score);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < points.length; index += 1) {
    const dx = xs[index] - meanX;
    numerator += dx * (ys[index] - meanY);
    denominator += dx * dx;
  }

  if (denominator === 0) return null;
  const slope = numerator / denominator;
  return {
    slope,
    intercept: meanY - slope * meanX,
  };
}

function predictTrend(points: ObservationPoint[], targetMonth: number): number | null {
  const fit = fitLinearTrend(points);
  if (!fit) return null;
  return fit.intercept + fit.slope * targetMonth;
}

function predictSeasonality(
  allPoints: ObservationPoint[],
  forecastYear: number,
  targetMonth: number,
  currentLastMonth: number,
  currentLastScore: number
): { projected: number; delta: number } | null {
  const priorYearPoints = allPoints.filter((point) => point.year === forecastYear - 1);
  if (priorYearPoints.length === 0) return null;

  const priorSameMonth = priorYearPoints.find((point) => point.month === currentLastMonth);
  const priorFinal = [...priorYearPoints]
    .reverse()
    .find((point) => point.month <= targetMonth);

  if (!priorSameMonth || !priorFinal) return null;
  const delta = priorFinal.score - priorSameMonth.score;
  return {
    projected: currentLastScore + delta,
    delta,
  };
}

function confidenceLabel(value: number): GlidepathConfidenceLabel {
  if (value >= 0.75) return "high";
  if (value >= 0.45) return "medium";
  return "low";
}

function priorYearFinalScore(
  allPoints: ObservationPoint[],
  forecastYear: number
): number | null {
  const priorPoints = allPoints.filter((point) => point.year === forecastYear - 1);
  if (priorPoints.length === 0) return null;
  return priorPoints.at(-1)!.score;
}

function applyMeasureTypeConstraint(
  rawProjected: number,
  measureType: GlidepathMeasureType,
  baselineScore: number,
  allPoints: ObservationPoint[],
  forecastYear: number,
  notes: string[]
): number {
  if (measureType === "cahps" || measureType === "hos") {
    const priorFinal = priorYearFinalScore(allPoints, forecastYear);
    if (priorFinal !== null) {
      notes.push(
        `${measureType === "cahps" ? "CAHPS" : "HOS"} measure: carried forward prior-year final score (${round2(priorFinal)}). Adjust manually if needed.`
      );
      return priorFinal;
    }
    notes.push(
      `${measureType === "cahps" ? "CAHPS" : "HOS"} measure: no prior-year data available; carried forward last observed score.`
    );
    return baselineScore;
  }

  const maxDelta = measureType === "pharmacy" ? 1 : 2;
  const priorFinal = priorYearFinalScore(allPoints, forecastYear);
  const guardrailAnchor = priorFinal ?? baselineScore;
  const clamped = clamp(rawProjected, guardrailAnchor - maxDelta, guardrailAnchor + maxDelta);
  if (clamped !== rawProjected) {
    notes.push(
      `${measureType === "pharmacy" ? "Pharmacy" : "HEDIS"} measure: model projection clamped to ±${maxDelta} from ${
        priorFinal !== null ? "prior-year final score" : "last observed score"
      } (${round2(guardrailAnchor)}).`
    );
  }
  return clamped;
}

export function projectSeriesToYearEnd(
  rows: ImportedMonthlyMeasureRow[],
  forecastYear: number
): GlidepathProjection | null {
  if (rows.length === 0) return null;

  const allPoints = collapseObservedRows(rows);
  if (allPoints.length === 0) return null;

  const template = rows[0];
  const measureType = classifyMeasureType(
    template.measureNormalized,
    template.measureCode,
    template.metricCategory
  );

  const currentYearPoints = allPoints.filter((point) => point.year === forecastYear);

  if (currentYearPoints.length === 0) {
    const priorFinal = priorYearFinalScore(allPoints, forecastYear);
    const carryScore = priorFinal ?? allPoints.at(-1)?.score ?? null;
    if (carryScore === null) return null;

    const projectedScore = round2(clamp(carryScore, 0, 100));
    return {
      contractId: template.contractId,
      measureName: template.measureName,
      measureDisplayName: template.measureDisplayName,
      measureNormalized: template.measureNormalized,
      measureCode: template.measureCode,
      hlCode: template.hlCode,
      metricCategory: template.metricCategory,
      measureType,
      projectedScore,
      modelScore: projectedScore,
      confidence: round2(clamp(0.25, 0.1, 0.95)),
      confidenceLabel: "low",
      trendSlope: null,
      seasonalityDelta: null,
      lastObservedYear: allPoints.at(-1)?.year ?? null,
      lastObservedMonth: allPoints.at(-1)?.month ?? null,
      lastObservedScore: round2(allPoints.at(-1)?.score ?? 0),
      supportingPoints: 0,
      notes: ["No current-year data available; carried forward prior-year final score. Adjust manually if needed."],
    };
  }

  const targetMonth = inferYearEndMonth(rows, forecastYear);
  const latestCurrentPoint = currentYearPoints.at(-1)!;
  const baselinePoint = latestCurrentPoint;

  // For non-survey measures month 12 is the final rate (hybrid measures extend
  // to a later closeout month, e.g. 13). Once the data reaches that closeout
  // month, the observed value IS the final rate — use it directly with no
  // trend/seasonality modeling and no guardrail (it's actual, not a projection).
  if (
    (measureType === "hedis" || measureType === "pharmacy") &&
    latestCurrentPoint.month >= targetMonth
  ) {
    const finalScore = round2(clamp(latestCurrentPoint.score, 0, 100));
    const isHybridCloseout = latestCurrentPoint.month >= 13;
    return {
      contractId: template.contractId,
      measureName: template.measureName,
      measureDisplayName: template.measureDisplayName,
      measureNormalized: template.measureNormalized,
      measureCode: template.measureCode,
      hlCode: template.hlCode,
      metricCategory: template.metricCategory,
      measureType,
      projectedScore: finalScore,
      modelScore: finalScore,
      confidence: 0.95,
      confidenceLabel: "high",
      trendSlope: null,
      seasonalityDelta: null,
      lastObservedYear: latestCurrentPoint.year,
      lastObservedMonth: latestCurrentPoint.month,
      lastObservedScore: finalScore,
      supportingPoints: currentYearPoints.length,
      notes: [
        `${isHybridCloseout ? "Final hybrid rate" : "Final rate"} observed at month ${latestCurrentPoint.month}; used directly as the actual year-end rate (no projection or guardrail applied).`,
      ],
    };
  }

  const trendProjected =
    currentYearPoints.length >= 2
      ? predictTrend(currentYearPoints, targetMonth)
      : null;
  const seasonalityProjected = predictSeasonality(
    allPoints,
    forecastYear,
    targetMonth,
    baselinePoint.month,
    baselinePoint.score
  );

  let projected = baselinePoint.score;
  const notes: string[] = [];

  if (seasonalityProjected) {
    projected = seasonalityProjected.projected;
    notes.push(
      `Projected from prior-year close adjusted by the current-vs-prior gap through month ${baselinePoint.month}.`
    );
    if (trendProjected !== null) {
      notes.push("Current-year trend was reviewed as a sense check but did not override the prior-year close-based projection.");
    }
  } else if (trendProjected !== null) {
    projected = trendProjected;
    notes.push("Projected from the current-year month-over-month trend.");
  } else {
    notes.push("Carried forward the latest observed score because there was not enough history to model a trend.");
  }

  projected = applyMeasureTypeConstraint(
    projected,
    measureType,
    baselinePoint.score,
    allPoints,
    forecastYear,
    notes
  );

  const trendFit = fitLinearTrend(currentYearPoints);
  const projectedScore = round2(clamp(projected, 0, 100));
  const seasonalityDelta = seasonalityProjected ? round2(seasonalityProjected.delta) : null;
  const trendSlope = trendFit ? round2(trendFit.slope) : null;

  let confidence = currentYearPoints.length >= 4 ? 0.8 : currentYearPoints.length >= 2 ? 0.6 : 0.35;
  if (seasonalityProjected) confidence += 0.1;
  if (trendProjected !== null && seasonalityProjected) {
    const disagreement = Math.abs(trendProjected - seasonalityProjected.projected);
    if (disagreement > 8) {
      confidence -= 0.15;
      notes.push("Trend and seasonality disagreed materially, so confidence was reduced.");
    }
  }
  if (latestCurrentPoint === null) {
    confidence -= 0.1;
    notes.push("No scored observations were available yet for the target year.");
  }
  confidence = round2(clamp(confidence, 0.1, 0.95));

  return {
    contractId: template.contractId,
    measureName: template.measureName,
    measureDisplayName: template.measureDisplayName,
    measureNormalized: template.measureNormalized,
    measureCode: template.measureCode,
    hlCode: template.hlCode,
    metricCategory: template.metricCategory,
    measureType,
    projectedScore,
    modelScore: projectedScore,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    trendSlope,
    seasonalityDelta,
    lastObservedYear: baselinePoint.year,
    lastObservedMonth: baselinePoint.month,
    lastObservedScore: round2(baselinePoint.score),
    supportingPoints: currentYearPoints.length,
    notes,
  };
}

export function buildGlidepathProjections(
  rows: ImportedMonthlyMeasureRow[],
  forecastYear: number
): GlidepathProjection[] {
  const groupedRows = new Map<string, ImportedMonthlyMeasureRow[]>();

  for (const row of rows) {
    const key = `${row.contractId}::${row.measureNormalized}`;
    const existing = groupedRows.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groupedRows.set(key, [row]);
    }
  }

  const projections: GlidepathProjection[] = [];
  for (const seriesRows of groupedRows.values()) {
    const projection = projectSeriesToYearEnd(seriesRows, forecastYear);
    if (projection) projections.push(projection);
  }

  return projections.sort((left, right) => {
    return (
      left.contractId.localeCompare(right.contractId) ||
      left.measureDisplayName.localeCompare(right.measureDisplayName)
    );
  });
}
