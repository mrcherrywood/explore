import {
  MIN_OVERALL_MEASURE_COUNT,
  OVERALL_DEDUP_DROP_CODES,
} from "@/lib/clover-impact/analysis";
import {
  OFFICIAL_RECALC_REMOVED_CODES,
  QI_MEASURE_CODES,
} from "@/lib/clover-impact/scenarios";
import {
  calculateContractStats,
  calculateRewardFactor,
  computePercentileThresholds,
  type ContractMeasure,
  type PercentileThresholds,
} from "@/lib/reward-factor";
import { loadMeasureStarsFromFile } from "@/lib/reward-factor/backtest";
import { getMeasureRemovalForYear } from "@/lib/reward-factor/measure-removal-projection";
import { formatMeasureAcronyms } from "./measure-acronyms";
import { toBaselineMeasureCode } from "./measure-resolve";
import type { PlanPreviewPredictionsResult } from "./predictions";

export type PlanPreviewFinalScoreLeg = {
  measureCount: number;
  baseMean: number;
  weightedVariance: number;
  rewardFactor: number;
  meanCategory: string;
  varianceCategory: string;
  /** clamp(baseMean + reward factor) + CAI (unrounded). */
  finalScoreRaw: number;
};

export type PlanPreviewFinalScore = {
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  caiValue: number | null;
  /** QI stars carried forward from the baseline published year. */
  withQi: PlanPreviewFinalScoreLeg | null;
  withoutQi: PlanPreviewFinalScoreLeg | null;
  /** QI is not estimable from PP1 data, so the without-QI leg drives ratings. */
  selectedLeg: "with_qi" | "without_qi" | null;
  finalScoreRaw: number | null;
  finalRating: number | null;
  /** Part C summary rating (baseline scenario only); null otherwise. */
  partCFinalRating: number | null;
  /** Part D MA-PD summary rating (baseline scenario only); null otherwise. */
  partDFinalRating: number | null;
  qualifiesOverall: boolean;
  reason: string | null;
};

export type PlanPreviewScenarioId =
  | "baseline"
  | "removal2028"
  | "removal2029"
  | "cloverRecalc";

export type PlanPreviewFinalScoresResult = {
  id: PlanPreviewScenarioId;
  label: string;
  description: string;
  removedCodes: string[];
  caiSource: "overall" | "part_c";
  starsYear: number;
  baselineYear: number | null;
  /** Recomputed PERCENTILE.INC thresholds over the anchored population, per QI leg. */
  thresholds: {
    withQi: PercentileThresholds | null;
    withoutQi: PercentileThresholds | null;
  };
  populationSize: number;
  contracts: PlanPreviewFinalScore[];
  notes: string[];
};

export type PlanPreviewCaiRecords = {
  overall: Record<string, number>;
  partC: Record<string, number>;
  partD: Record<string, number>;
};

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function isHRContract(contractId: string): boolean {
  return contractId.startsWith("H") || contractId.startsWith("R");
}

function hasPartCAndPartD(measures: ContractMeasure[]): boolean {
  return (
    measures.some((m) => m.category === "Part C") &&
    measures.some((m) => m.category === "Part D")
  );
}

function dedupeOverallMeasures(measures: ContractMeasure[]): ContractMeasure[] {
  return measures.filter(
    (measure) => !OVERALL_DEDUP_DROP_CODES.has(measure.code.toUpperCase())
  );
}

function withoutCodes(measures: ContractMeasure[], codes: Set<string>): ContractMeasure[] {
  if (codes.size === 0) return measures;
  return measures.filter((measure) => !codes.has(measure.code.toUpperCase()));
}

/**
 * Anchored Overall MA-PD population: baseline published measure stars (deduped,
 * H+R, Part C and Part D, at least the minimum measure count) with each accrued
 * contract's measure set replaced by its predicted stars plus carried-forward
 * QI stars from the baseline year.
 */
function buildAnchoredPopulation(
  predictions: PlanPreviewPredictionsResult,
  baselineYear: number
): Map<string, ContractMeasure[]> {
  const baseline = loadMeasureStarsFromFile(baselineYear);
  const population = new Map<string, ContractMeasure[]>();

  for (const [contractId, measures] of baseline) {
    if (!isHRContract(contractId) || !hasPartCAndPartD(measures)) continue;
    const deduped = dedupeOverallMeasures(measures);
    if (deduped.length >= MIN_OVERALL_MEASURE_COUNT) {
      population.set(contractId, deduped);
    }
  }

  for (const contract of predictions.contracts) {
    // Codes are translated to their baseline-year equivalents so the
    // 2026-coded dedup/QI/scenario-removal sets apply to the right measures
    // (CMS renumbers codes between years).
    const predicted: ContractMeasure[] = contract.measures
      .filter((measure) => measure.predictedStar !== null)
      .map((measure) => {
        const code = toBaselineMeasureCode(
          measure.measureNormalized,
          measure.measureCode,
          baselineYear
        );
        return {
          code,
          starValue: measure.predictedStar as number,
          weight: measure.weight,
          category: code.startsWith("D") ? "Part D" : "Part C",
        };
      });
    if (predicted.length === 0) continue;

    const carriedQi = (baseline.get(contract.contractId) ?? []).filter((measure) =>
      QI_MEASURE_CODES.has(measure.code.toUpperCase())
    );
    const combined = dedupeOverallMeasures([...predicted, ...carriedQi]);
    if (hasPartCAndPartD(combined) && combined.length >= MIN_OVERALL_MEASURE_COUNT) {
      population.set(contract.contractId, combined);
    } else {
      population.delete(contract.contractId);
    }
  }

  return population;
}

type LegComputation = {
  thresholds: PercentileThresholds | null;
  statsByContract: Map<string, ReturnType<typeof calculateContractStats>>;
};

function computeLeg(
  population: Map<string, ContractMeasure[]>,
  removedCodes: Set<string>,
  dropQi: boolean
): LegComputation {
  const statsByContract = new Map<string, ReturnType<typeof calculateContractStats>>();
  const stats = [];
  for (const [contractId, measures] of population) {
    let legMeasures = withoutCodes(measures, removedCodes);
    if (dropQi) legMeasures = withoutCodes(legMeasures, QI_MEASURE_CODES);
    const contractStats = calculateContractStats(contractId, legMeasures, null);
    if (contractStats.measureCount <= 1) continue;
    statsByContract.set(contractId, contractStats);
    stats.push(contractStats);
  }
  return {
    thresholds: stats.length > 0 ? computePercentileThresholds(stats) : null,
    statsByContract,
  };
}

function buildLegScore(
  leg: LegComputation,
  contractId: string,
  caiValue: number | null
): PlanPreviewFinalScoreLeg | null {
  const stats = leg.statsByContract.get(contractId);
  if (!stats || !leg.thresholds) return null;
  const result = calculateRewardFactor(stats, leg.thresholds, "overall_mapd");
  return {
    measureCount: stats.measureCount,
    baseMean: result.weightedMean,
    weightedVariance: result.weightedVariance,
    rewardFactor: result.rFactor,
    meanCategory: result.meanCategory,
    varianceCategory: result.varianceCategory,
    finalScoreRaw: result.adjustedRating + (caiValue ?? 0),
  };
}

/** Part C / Part D summary legs over the anchored population (without QI). */
function computeCategoryLeg(
  population: Map<string, ContractMeasure[]>,
  category: "Part C" | "Part D"
): LegComputation {
  const statsByContract = new Map<string, ReturnType<typeof calculateContractStats>>();
  const stats = [];
  for (const [contractId, measures] of population) {
    const legMeasures = withoutCodes(
      measures.filter((measure) => measure.category === category),
      QI_MEASURE_CODES
    );
    const contractStats = calculateContractStats(contractId, legMeasures, null);
    if (contractStats.measureCount <= 1) continue;
    statsByContract.set(contractId, contractStats);
    stats.push(contractStats);
  }
  return {
    thresholds: stats.length > 0 ? computePercentileThresholds(stats) : null,
    statsByContract,
  };
}

function categoryFinalRating(
  leg: LegComputation,
  contractId: string,
  caiValue: number | null,
  ratingType: "part_c" | "part_d_mapd"
): number | null {
  const stats = leg.statsByContract.get(contractId);
  if (!stats || !leg.thresholds) return null;
  const result = calculateRewardFactor(stats, leg.thresholds, ratingType);
  const raw = result.adjustedRating + (caiValue ?? 0);
  return roundToHalf(Math.min(5, Math.max(1, raw)));
}

type ScenarioDef = {
  id: PlanPreviewScenarioId;
  label: string;
  description: string;
  removedCodes: Set<string>;
  caiSource: "overall" | "part_c";
  notes: string[];
};

function scenarioDefs(): ScenarioDef[] {
  const removal2028 = getMeasureRemovalForYear(2028);
  const removal2029 = getMeasureRemovalForYear(2029);
  return [
    {
      id: "baseline",
      label: "All measures",
      description: "Every accrued measure scores at the predicted cut points.",
      removedCodes: new Set<string>(),
      caiSource: "overall",
      notes: [],
    },
    {
      id: "removal2028",
      label: "Stars 2028 removals",
      description:
        "CMS Stars 2028 retirements: " +
        (removal2028
          ? formatMeasureAcronyms(removal2028.removedMeasures.map((m) => m.code))
          : "—") +
        ".",
      removedCodes: removal2028?.removedCodes ?? new Set<string>(),
      caiSource: "overall",
      notes: [],
    },
    {
      id: "removal2029",
      label: "Stars 2029 removals",
      description:
        "CMS Stars 2029 retirements: " +
        (removal2029
          ? formatMeasureAcronyms(removal2029.removedMeasures.map((m) => m.code))
          : "—") +
        ".",
      removedCodes: removal2029?.removedCodes ?? new Set<string>(),
      caiSource: "overall",
      notes: [],
    },
    {
      id: "cloverRecalc",
      label: "Clover-style recalc",
      description:
        "Part C HEDIS/CAHPS/HOS only — drops all Part D plus SNP, Complaints (C), MCL (C), Timely Appeals, Review Appeals, and Call Center (C).",
      removedCodes: OFFICIAL_RECALC_REMOVED_CODES,
      caiSource: "part_c",
      notes: [
        "The result is a Part C summary rating, so the uploaded Part C CAI is applied instead of the Overall MA-PD CAI.",
      ],
    },
  ];
}

function computeScenario(
  scenario: ScenarioDef,
  predictions: PlanPreviewPredictionsResult,
  population: Map<string, ContractMeasure[]>,
  cai: PlanPreviewCaiRecords
): PlanPreviewFinalScoresResult {
  const { starsYear, baselineYear } = predictions;
  const caiByContract = scenario.caiSource === "part_c" ? cai.partC : cai.overall;
  const withQiLeg = computeLeg(population, scenario.removedCodes, false);
  const withoutQiLeg = computeLeg(population, scenario.removedCodes, true);
  // Part C / Part D trend projections use the all-measures (baseline) population.
  const partCLeg =
    scenario.id === "baseline" ? computeCategoryLeg(population, "Part C") : null;
  const partDLeg =
    scenario.id === "baseline" ? computeCategoryLeg(population, "Part D") : null;

  const contracts: PlanPreviewFinalScore[] = [];
  for (const contract of predictions.contracts) {
    const caiValue = caiByContract[contract.contractId] ?? null;
    const inPopulation = population.has(contract.contractId);
    const hasCarriedQi = inPopulation
      ? population
          .get(contract.contractId)!
          .some((measure) => QI_MEASURE_CODES.has(measure.code.toUpperCase()))
      : false;

    const withQi = hasCarriedQi
      ? buildLegScore(withQiLeg, contract.contractId, caiValue)
      : null;
    const withoutQi = buildLegScore(withoutQiLeg, contract.contractId, caiValue);
    const partCFinalRating =
      partCLeg !== null
        ? categoryFinalRating(
            partCLeg,
            contract.contractId,
            cai.partC[contract.contractId] ?? null,
            "part_c"
          )
        : null;
    const partDFinalRating =
      partDLeg !== null
        ? categoryFinalRating(
            partDLeg,
            contract.contractId,
            cai.partD[contract.contractId] ?? null,
            "part_d_mapd"
          )
        : null;

    const base = {
      contractId: contract.contractId,
      contractName: contract.contractName,
      parentOrganization: contract.parentOrganization,
      caiValue,
      withQi,
      withoutQi,
      partCFinalRating,
      partDFinalRating,
    };

    if (!withQi && !withoutQi) {
      contracts.push({
        ...base,
        selectedLeg: null,
        finalScoreRaw: null,
        finalRating: null,
        qualifiesOverall: false,
        reason: inPopulation
          ? "Too few measures remain in this scenario to compute a rating."
          : `Contract does not qualify for an Overall MA-PD rating (needs Part C and Part D coverage with at least ${MIN_OVERALL_MEASURE_COUNT} rated measures).`,
      });
      continue;
    }

    // QI cannot be accurately estimated from plan preview 1 data, so the
    // without-QI leg drives every rating (with-QI kept only as a fallback
    // when the no-QI leg cannot be computed).
    const selectedLeg = withoutQi ? ("without_qi" as const) : ("with_qi" as const);
    const selected = selectedLeg === "with_qi" ? withQi! : withoutQi!;

    contracts.push({
      ...base,
      selectedLeg,
      finalScoreRaw: selected.finalScoreRaw,
      finalRating: roundToHalf(Math.min(5, Math.max(1, selected.finalScoreRaw))),
      qualifiesOverall: true,
      reason: null,
    });
  }

  return {
    id: scenario.id,
    label: scenario.label,
    description: scenario.description,
    removedCodes: [...scenario.removedCodes].sort(),
    caiSource: scenario.caiSource,
    starsYear,
    baselineYear,
    thresholds: { withQi: withQiLeg.thresholds, withoutQi: withoutQiLeg.thresholds },
    populationSize: population.size,
    contracts,
    notes: [
      ...scenario.notes,
      "QI (C30/D04) is not scored in plan preview 1 files and cannot be accurately estimated yet, so all ratings exclude the QI measures (without-QI leg).",
      "Reward-factor thresholds are recomputed per leg from the baseline population with accrued contracts' predicted stars overlaid.",
      "CAI comes from the uploaded plan preview CAI file. Disaster/EUC 'higher-of' uplift is not modeled.",
    ],
  };
}

/**
 * Predict each accrued contract's final score for the plan preview stars year
 * under each scenario: predicted measure stars are overlaid onto the baseline
 * published population, scenario removals are applied to everyone, and
 * reward-factor thresholds are recomputed over that anchored population
 * (PERCENTILE.INC mean 65/85, variance 30/70) for both QI legs. QI cannot be
 * accurately estimated from PP1 data, so the without-QI leg drives ratings.
 */
export function buildPlanPreviewScenarios(
  predictions: PlanPreviewPredictionsResult,
  cai: PlanPreviewCaiRecords
): PlanPreviewFinalScoresResult[] {
  const { starsYear, baselineYear } = predictions;

  if (baselineYear === null) {
    return scenarioDefs().map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      description: scenario.description,
      removedCodes: [...scenario.removedCodes].sort(),
      caiSource: scenario.caiSource,
      starsYear,
      baselineYear,
      thresholds: { withQi: null, withoutQi: null },
      populationSize: 0,
      contracts: [],
      notes: ["No published baseline year is available to build the population."],
    }));
  }

  const population = buildAnchoredPopulation(predictions, baselineYear);
  return scenarioDefs().map((scenario) =>
    computeScenario(scenario, predictions, population, cai)
  );
}

/** Baseline (all measures) final scores. */
export function buildPlanPreviewFinalScores(
  predictions: PlanPreviewPredictionsResult,
  caiByContract: Record<string, number>
): PlanPreviewFinalScoresResult {
  return buildPlanPreviewScenarios(predictions, {
    overall: caiByContract,
    partC: {},
    partD: {},
  })[0];
}
