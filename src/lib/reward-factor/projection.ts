/**
 * Reward Factor Projection Module
 *
 * Models reward factor thresholds from projected measure data.
 * Supports full-market (augmented with historical data) and client-only modes.
 * QI measures (C30/D04) handled via sensitivity sweep since they can't be reliably projected.
 */

import path from "node:path";
import type { ContractMeasure, RatingType, PercentileThresholds, RewardFactorResult } from "./types";
import {
  calculateContractStats,
  computePercentileThresholds,
  calculateRewardFactor,
} from "./calculations";
import {
  loadMeasureCutPoints,
  deriveMeasureStarRating,
  isInvertedMeasure,
} from "@/lib/percentile-analysis/measure-matching";
import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";

const DATA_DIR = path.join(process.cwd(), "data");
const CUT_POINTS_PATH = path.join(DATA_DIR, "Stars 2016-2028 Cut Points 12.2025_with_weights.xlsx");

const QI_MEASURES = new Set(["C30", "D04"]);
const QI_WEIGHT = 5;

export type ProjectedMeasureInput = {
  contractId: string;
  measureCode: string;
  projectedScore?: number | null;
  projectedStar?: number | null;
};

export type ProjectionMode = "full_market" | "client_only";

export type QISensitivityResult = {
  qiStar: number;
  thresholds: PercentileThresholds;
};

export type ProjectionResult = {
  primaryThresholds: PercentileThresholds;
  qiSensitivity: QISensitivityResult[];
  qiBand: { min: PercentileThresholds; max: PercentileThresholds };
  contractResults: ContractProjectionResult[];
  populationSize: number;
  clientContractCount: number;
};

export type ContractProjectionResult = {
  contractId: string;
  isClient: boolean;
  weightedMean: number;
  weightedVariance: number;
  measureCount: number;
  rFactor: number;
  meanCategory: string;
  varianceCategory: string;
  qiSensitiveRFactorRange: [number, number];
};

/**
 * Parse and validate CSV rows into structured projected measures.
 * Filters out QI measures (C30/D04) since they're handled via sensitivity sweep.
 */
export function parseProjectedData(rows: Record<string, string>[]): ProjectedMeasureInput[] {
  const results: ProjectedMeasureInput[] = [];

  for (const row of rows) {
    const contractId = (row.contract_id ?? row.contractId ?? "").trim().toUpperCase();
    const measureCode = (row.measure_code ?? row.measureCode ?? "").trim().toUpperCase();

    if (!contractId || !measureCode) continue;
    if (QI_MEASURES.has(measureCode)) continue;

    const scoreStr = row.projected_score ?? row.projectedScore ?? "";
    const starStr = row.projected_star ?? row.projectedStar ?? "";

    const projectedScore = scoreStr ? Number(scoreStr) : null;
    const projectedStar = starStr ? Number(starStr) : null;

    if (projectedScore === null && projectedStar === null) continue;
    if (projectedScore !== null && !Number.isFinite(projectedScore)) continue;
    if (projectedStar !== null && (!Number.isFinite(projectedStar) || projectedStar < 1 || projectedStar > 5)) continue;

    results.push({ contractId, measureCode, projectedScore, projectedStar });
  }

  return results;
}

/**
 * Convert projected scores to star ratings using cut points.
 * Rows with an explicit projectedStar are left as-is.
 */
export function convertToStars(
  projected: ProjectedMeasureInput[],
  cutPoints: MeasureCutPoint[],
  measureWeights: Map<string, { weight: number; category: string }>
): ContractMeasure[] {
  const results: ContractMeasure[] = [];

  const cutPointByCode = new Map<string, MeasureCutPoint>();
  for (const cp of cutPoints) {
    if (cp.hlCode) cutPointByCode.set(cp.hlCode.toUpperCase(), cp);
  }

  for (const item of projected) {
    let starValue = item.projectedStar ?? null;

    if (starValue === null && item.projectedScore != null) {
      const cp = cutPointByCode.get(item.measureCode);
      if (!cp) continue;
      const inverted = isInvertedMeasure(cp.measureName);
      starValue = deriveMeasureStarRating(item.projectedScore, cp, inverted);
    }

    if (starValue === null || starValue <= 0) continue;

    const measureInfo = measureWeights.get(item.measureCode);
    const weight = measureInfo?.weight ?? cutPointByCode.get(item.measureCode)?.weight ?? 1;
    const category = measureInfo?.category ?? (item.measureCode.startsWith("D") ? "Part D" : "Part C");

    results.push({
      code: item.measureCode,
      starValue,
      weight,
      category,
    });
  }

  return results;
}

/**
 * Build the full population for threshold computation.
 * In full_market mode, historical data is used for non-client contracts.
 * Client projected data overlays on top.
 */
export function buildPopulation(
  clientMeasuresByContract: Map<string, ContractMeasure[]>,
  historicalMeasuresByContract: Map<string, ContractMeasure[]>,
  mode: ProjectionMode
): Map<string, ContractMeasure[]> {
  if (mode === "client_only") return clientMeasuresByContract;

  const population = new Map<string, ContractMeasure[]>();

  for (const [contractId, measures] of historicalMeasuresByContract) {
    const filtered = measures.filter((m) => !QI_MEASURES.has(m.code.toUpperCase()));
    if (filtered.length > 0) population.set(contractId, filtered);
  }

  for (const [contractId, measures] of clientMeasuresByContract) {
    population.set(contractId, measures);
  }

  return population;
}

/**
 * Compute percentile thresholds from a population, filtering by rating type.
 */
export function computeThresholdsForRatingType(
  population: Map<string, ContractMeasure[]>,
  ratingType: RatingType
): PercentileThresholds {
  const filterCategory = ratingType === "part_c" ? "Part C"
    : ratingType === "part_d_mapd" || ratingType === "part_d_pdp" ? "Part D"
    : null;

  const stats = [];
  for (const [contractId, measures] of population) {
    const s = calculateContractStats(contractId, measures, filterCategory);
    if (s.measureCount > 1) stats.push(s);
  }

  return computePercentileThresholds(stats);
}

/**
 * Sweep QI stars 1-5 across population to produce sensitivity band.
 * For each QI star level, injects C30 (Part C, weight 5) and D04 (Part D, weight 5)
 * into every contract, then recomputes thresholds.
 */
export function sweepQISensitivity(
  population: Map<string, ContractMeasure[]>,
  ratingType: RatingType
): { sensitivity: QISensitivityResult[]; band: { min: PercentileThresholds; max: PercentileThresholds } } {
  const results: QISensitivityResult[] = [];
  const filterCategory = ratingType === "part_c" ? "Part C"
    : ratingType === "part_d_mapd" || ratingType === "part_d_pdp" ? "Part D"
    : null;

  for (let qiStar = 1; qiStar <= 5; qiStar++) {
    const augmented = new Map<string, ContractMeasure[]>();
    for (const [contractId, measures] of population) {
      const withQI = [...measures];
      if (!filterCategory || filterCategory === "Part C") {
        withQI.push({ code: "C30", starValue: qiStar, weight: QI_WEIGHT, category: "Part C" });
      }
      if (!filterCategory || filterCategory === "Part D") {
        withQI.push({ code: "D04", starValue: qiStar, weight: QI_WEIGHT, category: "Part D" });
      }
      augmented.set(contractId, withQI);
    }

    const stats = [];
    for (const [contractId, measures] of augmented) {
      const s = calculateContractStats(contractId, measures, filterCategory);
      if (s.measureCount > 1) stats.push(s);
    }

    results.push({ qiStar, thresholds: computePercentileThresholds(stats) });
  }

  const allMeans65 = results.map((r) => r.thresholds.mean65th);
  const allMeans85 = results.map((r) => r.thresholds.mean85th);
  const allVar30 = results.map((r) => r.thresholds.variance30th);
  const allVar70 = results.map((r) => r.thresholds.variance70th);

  return {
    sensitivity: results,
    band: {
      min: {
        mean65th: Math.min(...allMeans65),
        mean85th: Math.min(...allMeans85),
        variance30th: Math.min(...allVar30),
        variance70th: Math.min(...allVar70),
      },
      max: {
        mean65th: Math.max(...allMeans65),
        mean85th: Math.max(...allMeans85),
        variance30th: Math.max(...allVar30),
        variance70th: Math.max(...allVar70),
      },
    },
  };
}

/**
 * Compute per-contract reward factor results using primary thresholds,
 * with QI sensitivity range annotation.
 */
export function computeContractResults(
  population: Map<string, ContractMeasure[]>,
  primaryThresholds: PercentileThresholds,
  qiSensitivity: QISensitivityResult[],
  ratingType: RatingType,
  clientContractIds: Set<string>
): ContractProjectionResult[] {
  const filterCategory = ratingType === "part_c" ? "Part C"
    : ratingType === "part_d_mapd" || ratingType === "part_d_pdp" ? "Part D"
    : null;

  const results: ContractProjectionResult[] = [];

  for (const [contractId, measures] of population) {
    const stats = calculateContractStats(contractId, measures, filterCategory);
    if (stats.measureCount <= 1) continue;

    const primary = calculateRewardFactor(stats, primaryThresholds, ratingType);

    const qiRFactors: number[] = [];
    for (const qi of qiSensitivity) {
      const withQI = [...measures];
      if (!filterCategory || filterCategory === "Part C") {
        withQI.push({ code: "C30", starValue: qi.qiStar, weight: QI_WEIGHT, category: "Part C" });
      }
      if (!filterCategory || filterCategory === "Part D") {
        withQI.push({ code: "D04", starValue: qi.qiStar, weight: QI_WEIGHT, category: "Part D" });
      }
      const qiStats = calculateContractStats(contractId, withQI, filterCategory);
      const qiResult = calculateRewardFactor(qiStats, qi.thresholds, ratingType);
      qiRFactors.push(qiResult.rFactor);
    }

    results.push({
      contractId,
      isClient: clientContractIds.has(contractId),
      weightedMean: primary.weightedMean,
      weightedVariance: primary.weightedVariance,
      measureCount: stats.measureCount,
      rFactor: primary.rFactor,
      meanCategory: primary.meanCategory,
      varianceCategory: primary.varianceCategory,
      qiSensitiveRFactorRange: [Math.min(...qiRFactors), Math.max(...qiRFactors)],
    });
  }

  return results.sort((a, b) => b.rFactor - a.rFactor || b.weightedMean - a.weightedMean);
}

/**
 * Load cut points for a given year.
 */
export function loadCutPointsForYear(year: number): MeasureCutPoint[] {
  const byYear = loadMeasureCutPoints(CUT_POINTS_PATH, [year]);
  return byYear.get(year) ?? [];
}

/**
 * Run full projection pipeline.
 */
export function runProjection(
  clientMeasuresByContract: Map<string, ContractMeasure[]>,
  historicalMeasuresByContract: Map<string, ContractMeasure[]>,
  mode: ProjectionMode,
  ratingType: RatingType
): ProjectionResult {
  const population = buildPopulation(clientMeasuresByContract, historicalMeasuresByContract, mode);
  const primaryThresholds = computeThresholdsForRatingType(population, ratingType);
  const { sensitivity: qiSensitivity, band: qiBand } = sweepQISensitivity(population, ratingType);

  const clientIds = new Set(clientMeasuresByContract.keys());
  const contractResults = computeContractResults(population, primaryThresholds, qiSensitivity, ratingType, clientIds);

  return {
    primaryThresholds,
    qiSensitivity,
    qiBand,
    contractResults,
    populationSize: population.size,
    clientContractCount: clientIds.size,
  };
}
