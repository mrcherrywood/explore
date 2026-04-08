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
import { loadClientContractIds } from "./cut-point-methodology";
import {
  CAHPS_MEASURE_NAMES,
  computeSingleYearMae,
  createSeededRandom,
  round2,
  shuffleArray,
  type YearContext,
} from "./roster-accuracy-curve";

const RESAMPLE_FOLD_COUNT = 10;
const TUKEY_START_YEAR = 2024;
const TRIALS_PER_STEP = 8;
const DECIMAL_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

export type DecimalUpliftPoint = {
  pctDecimal: number;
  decimalCount: number;
  avgMae: number;
  minMae: number;
  maxMae: number;
  trials: number;
};

export type DecimalUpliftCurveResponse = {
  status: "ready";
  measure: string;
  displayName: string;
  method: "clustering" | "cahps-percentile";
  clientRosterAvgSize: number;
  baselineMae: number;
  fullDecimalMae: number;
  uplift: number;
  curve: DecimalUpliftPoint[];
  years: number[];
} | {
  status: "unsupported";
  measure: string;
  displayName: string;
  reason: string;
};

/**
 * Simulate decimal precision by adding Uniform(-0.5, 0.5) noise to an
 * integer score.  This breaks artificial ties created by CMS rounding.
 * Clamped to [0, 100] to stay within the valid score range.
 */
function simulateDecimalScore(integerScore: number, rand: () => number): number {
  const noise = rand() - 0.5;
  return Math.max(0, Math.min(100, Number((integerScore + noise).toFixed(2))));
}

function buildDecimalSamples(
  clientSamples: MeasureScoreSample[],
  pctDecimal: number,
  rand: () => number,
): MeasureScoreSample[] {
  if (pctDecimal <= 0) return clientSamples;

  const upgradeCount = Math.round(clientSamples.length * pctDecimal);
  if (upgradeCount >= clientSamples.length) {
    return clientSamples.map((s) => ({
      contractId: s.contractId,
      score: simulateDecimalScore(s.score, rand),
    }));
  }

  const shuffled = shuffleArray(clientSamples, rand);
  return shuffled.map((s, i) => ({
    contractId: s.contractId,
    score: i < upgradeCount ? simulateDecimalScore(s.score, rand) : s.score,
  }));
}

function runDecimalTrials(
  pctDecimal: number,
  yearContexts: YearContext[],
  clientIds: Set<string>,
  inverted: boolean,
  isCahps: boolean,
): { avgMae: number; minMae: number; maxMae: number; trials: number } {
  const trialMaes: number[] = [];

  for (let trial = 0; trial < TRIALS_PER_STEP; trial += 1) {
    const rand = createSeededRandom(42 + trial * 6271 + Math.round(pctDecimal * 10000));
    let validYears = 0;
    let totalMae = 0;

    for (const ctx of yearContexts) {
      const clientSamples = ctx.allSamples.filter((s) => clientIds.has(s.contractId));
      if (clientSamples.length < RESAMPLE_FOLD_COUNT) continue;

      const upgraded = buildDecimalSamples(clientSamples, pctDecimal, rand);
      const mae = computeSingleYearMae(
        upgraded, ctx.official, inverted, isCahps, ctx.tukeyApplied, ctx.priorOfficial,
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

export function analyzeDecimalUpliftCurve(
  measureNorm: string,
  officialCutPointsByYear: Map<number, MeasureCutPoint[]>,
): DecimalUpliftCurveResponse {
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

  const clientSamplesPerYear = yearContexts.map((ctx) =>
    ctx.allSamples.filter((s) => clientIds.has(s.contractId)).length
  );
  const avgClientSize = Math.round(
    clientSamplesPerYear.reduce((s, v) => s + v, 0) / clientSamplesPerYear.length
  );

  const curve: DecimalUpliftPoint[] = [];
  for (const pct of DECIMAL_STEPS) {
    const result = runDecimalTrials(pct, yearContexts, clientIds, inverted, isCahps);
    if (result.trials === 0) continue;
    curve.push({
      pctDecimal: Math.round(pct * 100),
      decimalCount: Math.round(avgClientSize * pct),
      avgMae: result.avgMae,
      minMae: result.minMae,
      maxMae: result.maxMae,
      trials: result.trials,
    });
  }

  const baseline = curve.find((p) => p.pctDecimal === 0);
  const fullDecimal = curve.find((p) => p.pctDecimal === 100);

  return {
    status: "ready",
    measure: measureNorm,
    displayName: measure.displayName,
    method: isCahps ? "cahps-percentile" : "clustering",
    clientRosterAvgSize: avgClientSize,
    baselineMae: baseline?.avgMae ?? 0,
    fullDecimalMae: fullDecimal?.avgMae ?? 0,
    uplift: round2((baseline?.avgMae ?? 0) - (fullDecimal?.avgMae ?? 0)),
    curve,
    years: yearContexts.map((ctx) => ctx.year),
  };
}
