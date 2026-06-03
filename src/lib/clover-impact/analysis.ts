import { readFileSync } from "node:fs";
import path from "node:path";
import {
  calculateContractStats,
  calculateRewardFactor,
  computePercentileThresholds,
  type ContractMeasure,
  type PercentileThresholds,
} from "@/lib/reward-factor";
import {
  loadContractMetadata,
  loadMeasureStarsFromFile,
  type ContractMetadata,
} from "@/lib/reward-factor/backtest";
import {
  CLOVER_CHART_SCORES,
  CLOVER_COMPUTED_SCENARIOS,
  CLOVER_RULING_SUMMARY,
  CLOVER_SCENARIO_MEASURE_NOTES,
  QI_MEASURE_CODES,
  type CloverChartScoreId,
  type CloverComputedScenario,
  type CloverComputedScenarioId,
} from "./scenarios";

const DATA_DIR = path.join(process.cwd(), "data");
const SOURCE_YEAR = 2026;
const PRIOR_YEAR = 2025;
const HOLD_HARMLESS_THRESHOLD = 4.0;
const MIN_OVERALL_MEASURE_COUNT = 15;
const OVERALL_DEDUP_DROP_CODES = new Set(["D02", "D03"]);
const OVERALL_CAI_VALUE_BY_FAC_2026 = new Map<number, number>([
  [1, -0.063262],
  [2, -0.040422],
  [3, -0.017803],
  [4, 0.003256],
  [5, 0.01879],
  [6, 0.045683],
  [7, 0.058145],
  [8, 0.101257],
  [9, 0.145515],
]);

type RawSummaryRow = Record<string, string | number | null | undefined>;
type RawEnrollmentRow = {
  CONTRACT_ID?: string | null;
  Enrollment?: string | number | null;
};
type RawCaiRow = RawSummaryRow & {
  CONTRACT_ID?: string | number | null;
  "Overall FAC"?: string | number | null;
  "CAI Value"?: string | number | null;
};

export type CloverScenarioMeasureScore = {
  code: string;
  name: string;
  category: string;
  measureValue: string | null;
  starValue: number;
  weight: number;
};

export type CloverScenarioDetail = {
  score: number | null;
  baseMean: number | null;
  weightedVariance: number | null;
  rewardFactor: number | null;
  caiValue: number | null;
  measureCount: number;
  removedMeasureCount: number;
  holdHarmlessApplied: boolean;
};

export type CloverScenarioScores = Record<CloverChartScoreId, number | null>;

export type CloverContractImpact = {
  contractId: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  parentOrganization: string | null;
  totalEnrollment: number | null;
  officialScores: {
    stars2025: number | null;
    stars2026: number | null;
  };
  scores: CloverScenarioScores;
  calculated2026Detail: CloverScenarioDetail | null;
  changesFromStars2026: Record<CloverComputedScenarioId, number | null>;
  scenarioDetails: Record<CloverComputedScenarioId, CloverScenarioDetail>;
  scenarioMeasureScores: Record<CloverComputedScenarioId, CloverScenarioMeasureScore[]>;
};

export type CloverScenarioSummary = {
  id: CloverComputedScenarioId;
  label: string;
  averageScore: number | null;
  averageChangeFromStars2026: number | null;
  contractsGaining: number;
  contractsLosing: number;
  halfStarGainers: number;
  halfStarLosers: number;
  thresholds: {
    withQI: PercentileThresholds | null;
    withoutQI: PercentileThresholds | null;
  };
};

export type CloverImpactResult = {
  sourceYear: number;
  priorYear: number;
  rulingSummary: string;
  chartScores: typeof CLOVER_CHART_SCORES;
  scenarioNotes: typeof CLOVER_SCENARIO_MEASURE_NOTES;
  computedScenarios: Array<{
    id: CloverComputedScenarioId;
    label: string;
    shortLabel: string;
    description: string;
    removedCodes: string[];
    holdQiConstant: boolean;
  }>;
  contracts: CloverContractImpact[];
  summaries: CloverScenarioSummary[];
  enrollmentSource: {
    year: number;
    month: number;
    fileName: string;
  };
};

function parseRating(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function loadOfficialOverallRatings(year: number): Map<string, number> {
  const filePath = path.join(DATA_DIR, String(year), `summary_rating_${year}.json`);
  const rows: RawSummaryRow[] = JSON.parse(readFileSync(filePath, "utf-8"));
  const ratings = new Map<string, number>();
  const overallKey = `${year} Overall`;

  for (const row of rows) {
    const contractId = String(row.CONTRACT_ID ?? "").trim().toUpperCase();
    if (!contractId) continue;

    const rating = parseRating(row[overallKey]);
    if (rating !== null) {
      ratings.set(contractId, rating);
    }
  }

  return ratings;
}

function loadCaiAdjustments(year: number): Map<string, number> {
  const filePath = path.join(DATA_DIR, String(year), `cai_${year}.json`);
  const rows: RawCaiRow[] = JSON.parse(readFileSync(filePath, "utf-8"));
  const adjustments = new Map<string, number>();

  for (const row of rows) {
    const contractId = String(row.CONTRACT_ID ?? "").trim().toUpperCase();
    if (!contractId) continue;

    const explicitCaiValue = parseRating(row["CAI Value"]);
    if (explicitCaiValue !== null) {
      adjustments.set(contractId, explicitCaiValue);
      continue;
    }

    const overallFac = parseRating(row["Overall FAC"]);
    if (year === 2026 && overallFac !== null) {
      const mappedCaiValue = OVERALL_CAI_VALUE_BY_FAC_2026.get(overallFac);
      if (mappedCaiValue !== undefined) {
        adjustments.set(contractId, mappedCaiValue);
      }
    }
  }

  return adjustments;
}

function loadMeasureNames(year: number): Map<string, string> {
  const filePath = path.join(DATA_DIR, String(year), `measure_stars_${year}.json`);
  const rows: RawSummaryRow[] = JSON.parse(readFileSync(filePath, "utf-8"));
  const firstRow = rows[0] ?? {};
  const names = new Map<string, string>();

  for (const key of Object.keys(firstRow)) {
    const match = key.match(/^([CD]\d+):\s*(.+)$/);
    if (!match) continue;
    names.set(match[1].toUpperCase(), match[2].trim());
  }

  return names;
}

function loadMeasureValues(year: number): Map<string, Map<string, string>> {
  const filePath = path.join(DATA_DIR, String(year), `measure_data_${year}.json`);
  const rows: RawSummaryRow[] = JSON.parse(readFileSync(filePath, "utf-8"));
  const valuesByContract = new Map<string, Map<string, string>>();

  for (const row of rows) {
    const contractId = String(row.CONTRACT_ID ?? "").trim().toUpperCase();
    if (!contractId) continue;

    const valuesByCode = new Map<string, string>();
    for (const [key, value] of Object.entries(row)) {
      const match = key.match(/^([CD]\d+):/);
      if (!match) continue;

      const normalized = String(value ?? "").trim();
      if (!normalized || !Number.isFinite(Number.parseFloat(normalized.replace(/,/g, "")))) {
        continue;
      }

      valuesByCode.set(match[1].toUpperCase(), normalized);
    }

    valuesByContract.set(contractId, valuesByCode);
  }

  return valuesByContract;
}

function parseEnrollment(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;

  const trimmed = value.trim();
  if (!trimmed || trimmed === "*" || trimmed.toLowerCase() === "suppressed") return null;

  const parsed = Number.parseInt(trimmed.replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function loadLatestEnrollment(): {
  enrollmentByContract: Map<string, number>;
  source: CloverImpactResult["enrollmentSource"];
} {
  const source = {
    year: 2026,
    month: 5,
    fileName: "Monthly_Report_By_Plan_2026_05_condensed.json",
  };
  const filePath = path.join(DATA_DIR, String(source.year), source.fileName);
  const contents = readFileSync(filePath, "utf-8").replace(/:\s*NaN\b/g, ": null");
  const rows: RawEnrollmentRow[] = JSON.parse(contents);
  const enrollmentByContract = new Map<string, number>();

  for (const row of rows) {
    const contractId = String(row.CONTRACT_ID ?? "").trim().toUpperCase();
    if (!contractId) continue;

    const enrollment = parseEnrollment(row.Enrollment);
    if (enrollment === null) continue;

    enrollmentByContract.set(contractId, (enrollmentByContract.get(contractId) ?? 0) + enrollment);
  }

  return { enrollmentByContract, source };
}

function isHRContract(contractId: string): boolean {
  return contractId.startsWith("H") || contractId.startsWith("R");
}

function hasPartCAndPartD(measures: ContractMeasure[]): boolean {
  return measures.some((m) => m.category === "Part C") && measures.some((m) => m.category === "Part D");
}

function dedupeOverallMeasures(measures: ContractMeasure[]): ContractMeasure[] {
  return measures.filter((measure) => !OVERALL_DEDUP_DROP_CODES.has(measure.code.toUpperCase()));
}

function filterOverallMapdPopulation(
  contracts: Map<string, ContractMeasure[]>,
  official2026: Map<string, number>,
): Map<string, ContractMeasure[]> {
  const population = new Map<string, ContractMeasure[]>();

  for (const [contractId, measures] of contracts) {
    if (!isHRContract(contractId) || !official2026.has(contractId) || !hasPartCAndPartD(measures)) {
      continue;
    }

    const overallMeasures = dedupeOverallMeasures(measures);
    if (overallMeasures.length >= MIN_OVERALL_MEASURE_COUNT) {
      population.set(contractId, overallMeasures);
    }
  }

  return population;
}

function applyRemovedCodes(measures: ContractMeasure[], removedCodes: Set<string>): ContractMeasure[] {
  return measures.filter((measure) => !removedCodes.has(measure.code.toUpperCase()));
}

function countRemovedMeasures(measures: ContractMeasure[], removedCodes: Set<string>): number {
  let count = 0;
  for (const measure of measures) {
    if (removedCodes.has(measure.code.toUpperCase())) count += 1;
  }
  return count;
}

function emptyScenarioDetail(removedMeasureCount: number): CloverScenarioDetail {
  return {
    score: null,
    baseMean: null,
    weightedVariance: null,
    rewardFactor: null,
    caiValue: null,
    measureCount: 0,
    removedMeasureCount,
    holdHarmlessApplied: false,
  };
}

function addCaiAdjustment(score: number, caiValue: number | null | undefined): number {
  return score + (caiValue ?? 0);
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildScoreTemplate(official2025: number | null, official2026: number | null): CloverScenarioScores {
  return {
    stars2025: official2025,
    s26WithQI: official2026,
    s26NoQI: null,
    stars2026: official2026,
    s29Removal: null,
    model1: null,
    model2: null,
  };
}

function getContractMetadata(
  contractId: string,
  metadata2026: Map<string, ContractMetadata>,
  metadata2025: Map<string, ContractMetadata>,
): ContractMetadata {
  return metadata2026.get(contractId) ?? metadata2025.get(contractId) ?? {
    contractName: null,
    parentOrganization: null,
    organizationMarketingName: null,
  };
}

function buildScenarioMeasureScores(
  measures: ContractMeasure[],
  measureNames: Map<string, string>,
  measureValues: Map<string, string> | undefined,
): Record<CloverComputedScenarioId, CloverScenarioMeasureScore[]> {
  const result = {} as Record<CloverComputedScenarioId, CloverScenarioMeasureScore[]>;

  for (const scenario of CLOVER_COMPUTED_SCENARIOS) {
    result[scenario.id] = measures
      .filter((measure) => scenario.removedCodes.has(measure.code.toUpperCase()))
      .map((measure) => ({
        code: measure.code,
        name: measureNames.get(measure.code.toUpperCase()) ?? measure.code,
        category: measure.category,
        measureValue: measureValues?.get(measure.code.toUpperCase()) ?? null,
        starValue: measure.starValue,
        weight: measure.weight,
      }))
      .sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.code.localeCompare(b.code);
      });
  }

  return result;
}

type ScenarioComputation = {
  scenario: CloverComputedScenario;
  detailsByContract: Map<string, CloverScenarioDetail>;
  thresholds: {
    withQI: PercentileThresholds | null;
    withoutQI: PercentileThresholds | null;
  };
};

function computeCalculatedBaseline(
  population: Map<string, ContractMeasure[]>,
  caiAdjustments: Map<string, number>,
): Map<string, CloverScenarioDetail> {
  const detailsByContract = new Map<string, CloverScenarioDetail>();
  const stats = [];

  for (const [contractId, measures] of population) {
    const contractStats = calculateContractStats(contractId, measures, null);
    if (contractStats.measureCount > 1) stats.push(contractStats);
  }

  const thresholds = stats.length > 0 ? computePercentileThresholds(stats) : null;
  if (!thresholds) return detailsByContract;

  for (const contractStats of stats) {
    const result = calculateRewardFactor(contractStats, thresholds, "overall_mapd");
    const caiValue = caiAdjustments.get(contractStats.contractId) ?? null;
    detailsByContract.set(contractStats.contractId, {
      score: addCaiAdjustment(result.adjustedRating, caiValue),
      baseMean: result.weightedMean,
      weightedVariance: result.weightedVariance,
      rewardFactor: result.rFactor,
      caiValue,
      measureCount: contractStats.measureCount,
      removedMeasureCount: 0,
      holdHarmlessApplied: false,
    });
  }

  return detailsByContract;
}

function computeScenario(
  scenario: CloverComputedScenario,
  population: Map<string, ContractMeasure[]>,
  caiAdjustments: Map<string, number>,
): ScenarioComputation {
  const detailsByContract = new Map<string, CloverScenarioDetail>();
  const statsWithQI = [];
  const statsWithoutQI = [];

  for (const [contractId, measures] of population) {
    const scenarioMeasures = applyRemovedCodes(measures, scenario.removedCodes);
    const scenarioMeasuresWithoutQI = scenarioMeasures.filter((measure) => !QI_MEASURE_CODES.has(measure.code.toUpperCase()));

    const withQI = calculateContractStats(contractId, scenarioMeasures, null);
    const withoutQI = calculateContractStats(contractId, scenarioMeasuresWithoutQI, null);

    if (withQI.measureCount > 1) statsWithQI.push(withQI);
    if (withoutQI.measureCount > 1) statsWithoutQI.push(withoutQI);
  }

  const thresholdsWithQI = statsWithQI.length > 0 ? computePercentileThresholds(statsWithQI) : null;
  const thresholdsWithoutQI = statsWithoutQI.length > 0 ? computePercentileThresholds(statsWithoutQI) : null;
  const statsWithQIMap = new Map(statsWithQI.map((stats) => [stats.contractId, stats]));
  const statsWithoutQIMap = new Map(statsWithoutQI.map((stats) => [stats.contractId, stats]));

  for (const [contractId, measures] of population) {
    const removedMeasureCount = countRemovedMeasures(measures, scenario.removedCodes);
    const withQI = statsWithQIMap.get(contractId);
    const withoutQI = statsWithoutQIMap.get(contractId);

    if (scenario.id === "s26NoQI") {
      if (!withoutQI || !thresholdsWithoutQI) {
        detailsByContract.set(contractId, emptyScenarioDetail(removedMeasureCount));
        continue;
      }

      const result = calculateRewardFactor(withoutQI, thresholdsWithoutQI, "overall_mapd");
      const caiValue = caiAdjustments.get(contractId) ?? null;
      detailsByContract.set(contractId, {
        score: addCaiAdjustment(result.adjustedRating, caiValue),
        baseMean: result.weightedMean,
        weightedVariance: result.weightedVariance,
        rewardFactor: result.rFactor,
        caiValue,
        measureCount: withoutQI.measureCount,
        removedMeasureCount,
        holdHarmlessApplied: false,
      });
      continue;
    }

    if (!withQI || !thresholdsWithQI) {
      detailsByContract.set(contractId, emptyScenarioDetail(removedMeasureCount));
      continue;
    }

    let selectedStats = withQI;
    let selectedThresholds = thresholdsWithQI;
    let holdHarmlessApplied = false;

    if (
      withoutQI &&
      thresholdsWithoutQI &&
      withoutQI.weightedMean >= HOLD_HARMLESS_THRESHOLD &&
      withQI.weightedMean < HOLD_HARMLESS_THRESHOLD
    ) {
      selectedStats = withoutQI;
      selectedThresholds = thresholdsWithoutQI;
      holdHarmlessApplied = true;
    }

    const result = calculateRewardFactor(selectedStats, selectedThresholds, "overall_mapd");
    const caiValue = caiAdjustments.get(contractId) ?? null;
    detailsByContract.set(contractId, {
      score: addCaiAdjustment(result.adjustedRating, caiValue),
      baseMean: result.weightedMean,
      weightedVariance: result.weightedVariance,
      rewardFactor: result.rFactor,
      caiValue,
      measureCount: selectedStats.measureCount,
      removedMeasureCount,
      holdHarmlessApplied,
    });
  }

  return {
    scenario,
    detailsByContract,
    thresholds: {
      withQI: thresholdsWithQI,
      withoutQI: thresholdsWithoutQI,
    },
  };
}

function summarizeScenario(
  scenario: CloverComputedScenario,
  contracts: CloverContractImpact[],
  thresholds: ScenarioComputation["thresholds"],
): CloverScenarioSummary {
  const changes = contracts
    .map((contract) => contract.changesFromStars2026[scenario.id])
    .filter((value): value is number => value !== null);
  const scores = contracts
    .map((contract) => contract.scores[scenario.id])
    .filter((value): value is number => value !== null);

  let halfStarGainers = 0;
  let halfStarLosers = 0;

  for (const contract of contracts) {
    const official = contract.scores.stars2026;
    const score = contract.scores[scenario.id];
    if (official === null || score === null) continue;

    const bracketChange = roundToHalf(score) - roundToHalf(official);
    if (bracketChange > 0) halfStarGainers += 1;
    if (bracketChange < 0) halfStarLosers += 1;
  }

  return {
    id: scenario.id,
    label: scenario.label,
    averageScore: average(scores),
    averageChangeFromStars2026: average(changes),
    contractsGaining: changes.filter((change) => change > 0.01).length,
    contractsLosing: changes.filter((change) => change < -0.01).length,
    halfStarGainers,
    halfStarLosers,
    thresholds,
  };
}

export function analyzeCloverImpact(): CloverImpactResult {
  const official2025 = loadOfficialOverallRatings(PRIOR_YEAR);
  const official2026 = loadOfficialOverallRatings(SOURCE_YEAR);
  const metadata2025 = loadContractMetadata(PRIOR_YEAR);
  const metadata2026 = loadContractMetadata(SOURCE_YEAR);
  const measureNames2026 = loadMeasureNames(SOURCE_YEAR);
  const measureValues2026 = loadMeasureValues(SOURCE_YEAR);
  const caiAdjustments2026 = loadCaiAdjustments(SOURCE_YEAR);
  const measureStars2026 = loadMeasureStarsFromFile(SOURCE_YEAR);
  const enrollment = loadLatestEnrollment();
  const population = filterOverallMapdPopulation(measureStars2026, official2026);

  const calculated2026 = computeCalculatedBaseline(population, caiAdjustments2026);
  const scenarioComputations = CLOVER_COMPUTED_SCENARIOS.map((scenario) =>
    computeScenario(scenario, population, caiAdjustments2026),
  );
  const contracts: CloverContractImpact[] = [];

  for (const [contractId] of population) {
    const contractMeasures = population.get(contractId) ?? [];
    const metadata = getContractMetadata(contractId, metadata2026, metadata2025);
    const official2025Score = official2025.get(contractId) ?? null;
    const official2026Score = official2026.get(contractId) ?? null;
    const calculated2026Score = calculated2026.get(contractId)?.score ?? null;
    const scores = buildScoreTemplate(official2025Score, official2026Score);
    const changesFromStars2026 = {} as Record<CloverComputedScenarioId, number | null>;
    const scenarioDetails = {} as Record<CloverComputedScenarioId, CloverScenarioDetail>;

    scores.s26WithQI = calculated2026Score;

    for (const computation of scenarioComputations) {
      const detail = computation.detailsByContract.get(contractId) ?? emptyScenarioDetail(0);
      scenarioDetails[computation.scenario.id] = detail;
      scores[computation.scenario.id] = detail.score;
      changesFromStars2026[computation.scenario.id] =
        official2026Score !== null && detail.score !== null ? detail.score - official2026Score : null;
    }

    contracts.push({
      contractId,
      contractName: metadata.contractName,
      organizationMarketingName: metadata.organizationMarketingName,
      parentOrganization: metadata.parentOrganization,
      totalEnrollment: enrollment.enrollmentByContract.get(contractId) ?? null,
      officialScores: {
        stars2025: official2025Score,
        stars2026: official2026Score,
      },
      scores,
      calculated2026Detail: calculated2026.get(contractId) ?? null,
      changesFromStars2026,
      scenarioDetails,
      scenarioMeasureScores: buildScenarioMeasureScores(
        contractMeasures,
        measureNames2026,
        measureValues2026.get(contractId),
      ),
    });
  }

  contracts.sort((a, b) => {
    const aChange = a.changesFromStars2026.model1 ?? -Infinity;
    const bChange = b.changesFromStars2026.model1 ?? -Infinity;
    return bChange - aChange;
  });

  const summaries = scenarioComputations.map((computation) =>
    summarizeScenario(computation.scenario, contracts, computation.thresholds),
  );

  return {
    sourceYear: SOURCE_YEAR,
    priorYear: PRIOR_YEAR,
    rulingSummary: CLOVER_RULING_SUMMARY,
    chartScores: CLOVER_CHART_SCORES,
    scenarioNotes: CLOVER_SCENARIO_MEASURE_NOTES,
    computedScenarios: CLOVER_COMPUTED_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      shortLabel: scenario.shortLabel,
      description: scenario.description,
      removedCodes: Array.from(scenario.removedCodes).sort(),
      holdQiConstant: scenario.holdQiConstant,
    })),
    contracts,
    summaries,
    enrollmentSource: enrollment.source,
  };
}
