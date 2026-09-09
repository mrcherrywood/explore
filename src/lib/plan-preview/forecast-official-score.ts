import { OVERALL_DEDUP_DROP_CODES } from "@/lib/clover-impact/analysis";
import { QI_MEASURE_CODES } from "@/lib/clover-impact/scenarios";
import {
  calculateContractStats,
  calculateRewardFactor,
  type ContractMeasure,
  type PercentileThresholds,
} from "@/lib/reward-factor";

import { toBaselineMeasureCode } from "./measure-resolve";
import type { PlanPreviewContractMeasurePrediction } from "./predictions";
import type { OfficialStarRow } from "./store-official";

const QI_WEIGHT = 5;

export type ForecastOfficialQiMeasure = {
  measureCode: string;
  star: number;
};

export type ForecastOfficialScore = {
  measureCount: number;
  /** Official improvement-measure stars folded into the projection (per Improvement Measure Usage). */
  qiIncluded: boolean;
  qiMeasures: ForecastOfficialQiMeasure[];
  /**
   * Same projection with QI left out. Null when CMS did not use improvement
   * measures, so the main fields are already the without-QI score.
   */
  withoutQi: {
    measureCount: number;
    baseMean: number;
    finalScoreRaw: number;
    finalRating: number;
  } | null;
  baseMean: number;
  weightedVariance: number;
  rewardFactor: number;
  caiValue: number;
  finalScoreRaw: number;
  finalRating: number;
};

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function scoreMeasureSet(
  contractId: string,
  measures: ContractMeasure[],
  thresholds: PercentileThresholds,
  caiValue: number,
): Omit<ForecastOfficialScore, "qiIncluded" | "qiMeasures" | "withoutQi"> | null {
  const stats = calculateContractStats(contractId, measures, null);
  if (stats.measureCount <= 1) return null;
  const result = calculateRewardFactor(stats, thresholds, "overall_mapd");
  const finalScoreRaw = result.adjustedRating + caiValue;
  return {
    measureCount: stats.measureCount,
    baseMean: result.weightedMean,
    weightedVariance: result.weightedVariance,
    rewardFactor: result.rFactor,
    caiValue,
    finalScoreRaw,
    finalRating: roundToHalf(Math.min(5, Math.max(1, finalScoreRaw))),
  };
}

/**
 * Score the PP1 forecast the way CMS scored the official rating: forecast
 * measure stars, the contract's actual Quality Improvement stars from the
 * PP2 star file, the official reward-factor thresholds for the contract's
 * improvement / new-measure variant, and the official CAI. Isolates cut-point
 * forecast error from the QI and threshold unknowns PP1 had to model.
 */
export function scoreForecastOnOfficialInputs(options: {
  contractId: string;
  baselineYear: number;
  predictedMeasures: PlanPreviewContractMeasurePrediction[];
  officialStars: OfficialStarRow[];
  thresholds: PercentileThresholds | null;
  caiValue: number | null;
  improvementIncluded: boolean;
}): ForecastOfficialScore | null {
  const { baselineYear, thresholds } = options;
  if (!thresholds) return null;

  // QI_MEASURE_CODES is 2026-coded; the name check keeps this right for
  // baseline years where CMS numbered the improvement measures differently.
  const isQi = (normalized: string, code: string) =>
    /quality improvement/i.test(normalized) ||
    QI_MEASURE_CODES.has(toBaselineMeasureCode(normalized, code, baselineYear).toUpperCase());

  const forecast: ContractMeasure[] = options.predictedMeasures
    .filter(
      (measure) =>
        measure.forecastStar !== null && !isQi(measure.measureNormalized, measure.measureCode)
    )
    .map((measure) => {
      const code = toBaselineMeasureCode(measure.measureNormalized, measure.measureCode, baselineYear);
      return {
        code,
        starValue: measure.forecastStar as number,
        weight: measure.weight,
        category: code.startsWith("D") ? "Part D" : "Part C",
      };
    });
  if (forecast.length === 0) return null;

  const officialQiRows = options.officialStars.filter(
    (row) => row.star !== null && isQi(row.measureNormalized, row.measureCode),
  );
  const officialQi: ContractMeasure[] = options.improvementIncluded
    ? officialQiRows.map((row) => {
        const code = toBaselineMeasureCode(row.measureNormalized, row.measureCode, baselineYear);
        return {
          code,
          starValue: row.star as number,
          weight: QI_WEIGHT,
          category: code.startsWith("D") ? "Part D" : "Part C",
        };
      })
    : [];
  const qiMeasures: ForecastOfficialQiMeasure[] = officialQiRows
    .filter((row) => row.star !== null)
    .map((row) => ({
      measureCode: row.measureCode.toUpperCase(),
      star: row.star as number,
    }))
    .sort((left, right) => left.measureCode.localeCompare(right.measureCode, undefined, { numeric: true }));

  const caiValue = options.caiValue ?? 0;
  const withoutQiMeasures = forecast.filter(
    (measure) => !OVERALL_DEDUP_DROP_CODES.has(measure.code.toUpperCase()),
  );
  const withQiMeasures = [...forecast, ...officialQi].filter(
    (measure) => !OVERALL_DEDUP_DROP_CODES.has(measure.code.toUpperCase()),
  );
  const scored = scoreMeasureSet(options.contractId, withQiMeasures, thresholds, caiValue);
  if (!scored) return null;

  const withoutQiScored =
    officialQi.length > 0
      ? scoreMeasureSet(options.contractId, withoutQiMeasures, thresholds, caiValue)
      : null;

  return {
    ...scored,
    qiIncluded: officialQi.length > 0,
    qiMeasures,
    withoutQi: withoutQiScored
      ? {
          measureCount: withoutQiScored.measureCount,
          baseMean: withoutQiScored.baseMean,
          finalScoreRaw: withoutQiScored.finalScoreRaw,
          finalRating: withoutQiScored.finalRating,
        }
      : null,
  };
}
