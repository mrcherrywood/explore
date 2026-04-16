/**
 * Reward Factor Backtest
 *
 * Validates threshold computation against CMS published values
 * by loading actual measure star data from local JSON files
 * and measure weights from the cut points workbook.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { ContractMeasure, RatingType, PercentileThresholds } from "./types";
import {
  calculateContractStats,
  computePercentileThresholds,
  calculateRewardFactor,
} from "./calculations";
import {
  getOfficialForScenario,
  hasOfficialThresholdsForYear,
  computeDifferences,
} from "./official-threshold-data";
import {
  loadMeasureCutPoints,
  matchCutPointToMeasureName,
} from "@/lib/percentile-analysis/measure-matching";
import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";

const DATA_DIR = path.join(process.cwd(), "data");
const CUT_POINTS_PATH = path.join(DATA_DIR, "Stars 2016-2028 Cut Points 12.2025_with_weights.xlsx");
const QI_MEASURES = new Set(["C30", "D04"]);
const AVAILABLE_BACKTEST_YEARS = [2023, 2024, 2025, 2026] as const;

type PercentileMethod = "inc" | "exc";

export type BacktestThresholdSet = {
  label: string;
  computed: PercentileThresholds;
  official: PercentileThresholds | null;
  differences: Record<string, number> | null;
  percentDifferences: Record<string, number> | null;
  contractCount: number;
};

export type BacktestRatingResult = {
  ratingType: RatingType;
  ratingLabel: string;
  withoutQI: BacktestThresholdSet;
  withQI: BacktestThresholdSet;
  rFactorDistribution: Record<number, number>;
  totalContracts: number;
};

export type BacktestResult = {
  year: number;
  ratingResults: BacktestRatingResult[];
  populationSize: number;
  hasOfficialThresholds: boolean;
};

// --- File loading ---

type RawContractRow = Record<string, string>;

function isMeasureKey(key: string): boolean {
  return /^[CD]\d+:/.test(key);
}

function extractMeasureCode(key: string): string | null {
  const match = key.match(/^([CD]\d+):/);
  return match ? match[1].toUpperCase() : null;
}

function extractMeasureName(key: string): string {
  return key.replace(/^[CD]\d+:\s*/, "").trim();
}

function parseStarValue(value: string): number | null {
  const trimmed = value.trim();
  const num = Number(trimmed);
  if (Number.isFinite(num) && num >= 1 && num <= 5) return Math.round(num);
  return null;
}

/**
 * Build a CMS code → weight map by matching JSON column names against cut point measure names.
 */
function buildWeightMap(
  measureKeys: string[],
  cutPoints: MeasureCutPoint[],
): Map<string, number> {
  const weightByCode = new Map<string, number>();
  for (const key of measureKeys) {
    const code = extractMeasureCode(key);
    if (!code) continue;
    const name = extractMeasureName(key);
    const prefix = code.startsWith("D") ? "D" : "C";
    const matched = matchCutPointToMeasureName(name, prefix, cutPoints);
    if (matched && matched.weight != null) {
      weightByCode.set(code, matched.weight);
    } else {
      weightByCode.set(code, 1);
    }
  }
  return weightByCode;
}

/**
 * Load measure stars from the local JSON file for a given year.
 * Returns measures grouped by contract. Includes ALL contract types
 * (H, R, S, E) so each rating type can filter its own population.
 */
export function loadMeasureStarsFromFile(year: number): Map<string, ContractMeasure[]> {
  const filePath = path.join(DATA_DIR, String(year), `measure_stars_${year}.json`);
  const raw: RawContractRow[] = JSON.parse(readFileSync(filePath, "utf-8"));

  const cutPointsByYear = loadMeasureCutPoints(CUT_POINTS_PATH, [year]);
  const cutPoints = cutPointsByYear.get(year) ?? [];

  const byContract = new Map<string, ContractMeasure[]>();
  let measureKeys: string[] = [];
  let weightByCode: Map<string, number> | null = null;

  for (const row of raw) {
    const contractId = (row.CONTRACT_ID ?? "").trim().toUpperCase();
    if (!contractId) continue;

    if (measureKeys.length === 0) {
      measureKeys = Object.keys(row).filter(isMeasureKey);
      weightByCode = buildWeightMap(measureKeys, cutPoints);
    }

    const measures: ContractMeasure[] = [];
    for (const key of measureKeys) {
      const code = extractMeasureCode(key);
      if (!code) continue;

      const starValue = parseStarValue(row[key] ?? "");
      if (starValue === null) continue;

      const weight = weightByCode!.get(code) ?? 1;
      const category = code.startsWith("D") ? "Part D" : "Part C";

      measures.push({ code, starValue, weight, category });
    }

    if (measures.length > 0) {
      byContract.set(contractId, measures);
    }
  }

  return byContract;
}

export type ContractMetadata = {
  contractName: string | null;
  parentOrganization: string | null;
  organizationMarketingName: string | null;
};

/**
 * Load contract metadata (name, parent org) from the same JSON files used
 * for measure stars. Lightweight — only reads non-measure columns.
 */
export function loadContractMetadata(year: number): Map<string, ContractMetadata> {
  const filePath = path.join(DATA_DIR, String(year), `measure_stars_${year}.json`);
  const raw: RawContractRow[] = JSON.parse(readFileSync(filePath, "utf-8"));
  const meta = new Map<string, ContractMetadata>();

  for (const row of raw) {
    const contractId = (row.CONTRACT_ID ?? "").trim().toUpperCase();
    if (!contractId) continue;
    meta.set(contractId, {
      contractName: row["Contract Name"]?.trim() || null,
      parentOrganization: row["Parent Organization"]?.trim() || null,
      organizationMarketingName: row["Organization Marketing Name"]?.trim() || null,
    });
  }

  return meta;
}

// --- Population filtering ---

function isHRContract(id: string): boolean {
  return id.startsWith("H") || id.startsWith("R");
}

function isPDPContract(id: string): boolean {
  return id.startsWith("S");
}

function contractHasPartD(measures: ContractMeasure[]): boolean {
  return measures.some((m) => m.category === "Part D");
}

function contractHasPartC(measures: ContractMeasure[]): boolean {
  return measures.some((m) => m.category === "Part C");
}

// Shared measures between Part C and Part D that CMS counts only once
// in the Overall MA-PD calculation. We keep the Part C instance and drop Part D.
const OVERALL_DEDUP_DROP_CODES = new Set(["D03", "D02"]); // D03=Members Choosing to Leave, D02=Complaints

// Minimum valid-measure counts by rating type.
// CMS Tables 6/7 require ~50% of applicable measures; these approximate that.
const MIN_MEASURE_COUNTS: Record<RatingType, number> = {
  part_c: 10,
  part_d_mapd: 4,
  part_d_pdp: 4,
  overall_mapd: 15,
};

/**
 * Filter population for a given rating type:
 * - part_c: H+R contracts, Part C measures only
 * - part_d_mapd: H+R contracts with Part D, Part D measures only
 * - part_d_pdp: S contracts (PDP), Part D measures only
 * - overall_mapd: H+R contracts with both Part C and Part D, all measures
 *   (deduplicates shared measures C29/D03 and C28/D02)
 */
function filterPopulationForRatingType(
  allContracts: Map<string, ContractMeasure[]>,
  ratingType: RatingType,
): Map<string, ContractMeasure[]> {
  const filtered = new Map<string, ContractMeasure[]>();
  const minCount = MIN_MEASURE_COUNTS[ratingType] ?? 2;

  for (const [contractId, measures] of allContracts) {
    let include = false;
    let filteredMeasures = measures;

    switch (ratingType) {
      case "part_c":
        include = isHRContract(contractId) && contractHasPartC(measures);
        filteredMeasures = measures.filter((m) => m.category === "Part C");
        break;
      case "part_d_mapd":
        include = isHRContract(contractId) && contractHasPartD(measures);
        filteredMeasures = measures.filter((m) => m.category === "Part D");
        break;
      case "part_d_pdp":
        include = isPDPContract(contractId) && contractHasPartD(measures);
        filteredMeasures = measures.filter((m) => m.category === "Part D");
        break;
      case "overall_mapd":
        include = isHRContract(contractId) && contractHasPartC(measures) && contractHasPartD(measures);
        filteredMeasures = measures.filter((m) => !OVERALL_DEDUP_DROP_CODES.has(m.code));
        break;
    }

    if (include && filteredMeasures.length >= minCount) {
      filtered.set(contractId, filteredMeasures);
    }
  }

  return filtered;
}

// --- Backtest core ---

export function backtestRatingType(
  allContracts: Map<string, ContractMeasure[]>,
  ratingType: RatingType,
  year: number,
  pctMethod: PercentileMethod = "inc",
): BacktestRatingResult {
  const population = filterPopulationForRatingType(allContracts, ratingType);

  const ratingLabel = ratingType === "overall_mapd" ? "Overall (MA-PD)"
    : ratingType === "part_c" ? "Part C"
    : ratingType === "part_d_mapd" ? "Part D (MA-PD)"
    : "Part D (PDP)";

  // WITHOUT QI: exclude C30/D04
  const statsWithoutQI = [];
  for (const [contractId, measures] of population) {
    const filtered = measures.filter((m) => !QI_MEASURES.has(m.code));
    const s = calculateContractStats(contractId, filtered);
    if (s.measureCount > 1) statsWithoutQI.push(s);
  }
  const computedWithoutQI = computePercentileThresholds(statsWithoutQI, pctMethod);
  const officialWithoutQI = getOfficialForScenario(year, ratingType, false);
  const diffWithoutQI = officialWithoutQI ? computeDifferences(computedWithoutQI, officialWithoutQI) : null;

  // WITH QI: include all measures
  const statsWithQI = [];
  for (const [contractId, measures] of population) {
    const s = calculateContractStats(contractId, measures);
    if (s.measureCount > 1) statsWithQI.push(s);
  }
  const computedWithQI = computePercentileThresholds(statsWithQI, pctMethod);
  const officialWithQI = getOfficialForScenario(year, ratingType, true);
  const diffWithQI = officialWithQI ? computeDifferences(computedWithQI, officialWithQI) : null;

  // r-Factor distribution using "with QI" thresholds
  const rFactorDist: Record<number, number> = { 0: 0, 0.1: 0, 0.2: 0, 0.3: 0, 0.4: 0 };
  for (const stats of statsWithQI) {
    const rf = calculateRewardFactor(stats, computedWithQI, ratingType);
    rFactorDist[rf.rFactor] = (rFactorDist[rf.rFactor] ?? 0) + 1;
  }

  return {
    ratingType,
    ratingLabel,
    withoutQI: {
      label: "Without Improvement Measures",
      computed: computedWithoutQI,
      official: officialWithoutQI,
      differences: diffWithoutQI?.differences ?? null,
      percentDifferences: diffWithoutQI?.percentDifferences ?? null,
      contractCount: statsWithoutQI.length,
    },
    withQI: {
      label: "With Improvement Measures",
      computed: computedWithQI,
      official: officialWithQI,
      differences: diffWithQI?.differences ?? null,
      percentDifferences: diffWithQI?.percentDifferences ?? null,
      contractCount: statsWithQI.length,
    },
    rFactorDistribution: rFactorDist,
    totalContracts: statsWithQI.length,
  };
}

/**
 * Run full backtest from local data files.
 */
export function runBacktest(year: number, pctMethod: PercentileMethod = "inc"): BacktestResult {
  const allContracts = loadMeasureStarsFromFile(year);
  const ratingTypes: RatingType[] = ["overall_mapd", "part_c", "part_d_mapd", "part_d_pdp"];

  const ratingResults = ratingTypes.map((rt) =>
    backtestRatingType(allContracts, rt, year, pctMethod)
  );

  return {
    year,
    ratingResults,
    populationSize: allContracts.size,
    hasOfficialThresholds: hasOfficialThresholdsForYear(year),
  };
}

export function getAvailableBacktestYears(): number[] {
  return [...AVAILABLE_BACKTEST_YEARS];
}

// --- Per-contract reward factor overview ---

export type ContractRewardFactorRow = {
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  weightedMean: number;
  weightedVariance: number;
  measureCount: number;
  meanCategory: string;
  varianceCategory: string;
  rFactor: number;
};

export type RewardFactorOverviewResult = {
  year: number;
  ratingType: RatingType;
  ratingLabel: string;
  thresholdsWithQI: BacktestThresholdSet;
  thresholdsWithoutQI: BacktestThresholdSet;
  contracts: ContractRewardFactorRow[];
  rFactorDistribution: Record<number, number>;
  populationSize: number;
};

/**
 * Compute reward factor for every contract in the population for a given
 * year and rating type, using the "with QI" thresholds.
 *
 * When `excludedCodes` is provided, those measures are stripped from every
 * contract before computing stats/thresholds (used for projected years).
 * `sourceYear` controls which data file to load (defaults to `year`).
 */
export function getRewardFactorOverview(
  year: number,
  ratingType: RatingType = "overall_mapd",
  excludedCodes?: Set<string>,
  sourceYear?: number,
): RewardFactorOverviewResult {
  const dataYear = sourceYear ?? year;
  const allContracts = loadMeasureStarsFromFile(dataYear);
  const metadata = loadContractMetadata(dataYear);

  // Strip excluded measures from every contract before population filtering
  const effectiveContracts = excludedCodes && excludedCodes.size > 0
    ? stripMeasures(allContracts, excludedCodes)
    : allContracts;

  const population = filterPopulationForRatingType(effectiveContracts, ratingType);

  const ratingLabel = ratingType === "overall_mapd" ? "Overall (MA-PD)"
    : ratingType === "part_c" ? "Part C"
    : ratingType === "part_d_mapd" ? "Part D (MA-PD)"
    : "Part D (PDP)";

  // WITH QI thresholds (primary)
  const statsWithQI = [];
  for (const [contractId, measures] of population) {
    const s = calculateContractStats(contractId, measures);
    if (s.measureCount > 1) statsWithQI.push(s);
  }
  const computedWithQI = computePercentileThresholds(statsWithQI, "inc");
  const officialWithQI = getOfficialForScenario(year, ratingType, true);
  const diffWithQI = officialWithQI ? computeDifferences(computedWithQI, officialWithQI) : null;

  // WITHOUT QI thresholds
  const statsWithoutQI = [];
  for (const [contractId, measures] of population) {
    const filtered = measures.filter((m) => !QI_MEASURES.has(m.code));
    const s = calculateContractStats(contractId, filtered);
    if (s.measureCount > 1) statsWithoutQI.push(s);
  }
  const computedWithoutQI = computePercentileThresholds(statsWithoutQI, "inc");
  const officialWithoutQI = getOfficialForScenario(year, ratingType, false);
  const diffWithoutQI = officialWithoutQI ? computeDifferences(computedWithoutQI, officialWithoutQI) : null;

  // Per-contract r-factor using "with QI" thresholds
  const contracts: ContractRewardFactorRow[] = [];
  const rFactorDist: Record<number, number> = { 0: 0, 0.1: 0, 0.2: 0, 0.3: 0, 0.4: 0 };

  for (const stats of statsWithQI) {
    const rf = calculateRewardFactor(stats, computedWithQI, ratingType);
    rFactorDist[rf.rFactor] = (rFactorDist[rf.rFactor] ?? 0) + 1;
    const meta = metadata.get(stats.contractId);
    contracts.push({
      contractId: stats.contractId,
      contractName: meta?.contractName ?? null,
      parentOrganization: meta?.parentOrganization ?? null,
      weightedMean: stats.weightedMean,
      weightedVariance: stats.weightedVariance,
      measureCount: stats.measureCount,
      meanCategory: rf.meanCategory,
      varianceCategory: rf.varianceCategory,
      rFactor: rf.rFactor,
    });
  }

  contracts.sort((a, b) => b.rFactor - a.rFactor || b.weightedMean - a.weightedMean);

  return {
    year,
    ratingType,
    ratingLabel,
    thresholdsWithQI: {
      label: "With Improvement Measures",
      computed: computedWithQI,
      official: officialWithQI,
      differences: diffWithQI?.differences ?? null,
      percentDifferences: diffWithQI?.percentDifferences ?? null,
      contractCount: statsWithQI.length,
    },
    thresholdsWithoutQI: {
      label: "Without Improvement Measures",
      computed: computedWithoutQI,
      official: officialWithoutQI,
      differences: diffWithoutQI?.differences ?? null,
      percentDifferences: diffWithoutQI?.percentDifferences ?? null,
      contractCount: statsWithoutQI.length,
    },
    contracts,
    rFactorDistribution: rFactorDist,
    populationSize: population.size,
  };
}

function stripMeasures(
  contracts: Map<string, ContractMeasure[]>,
  codes: Set<string>,
): Map<string, ContractMeasure[]> {
  const result = new Map<string, ContractMeasure[]>();
  for (const [id, measures] of contracts) {
    const filtered = measures.filter((m) => !codes.has(m.code));
    if (filtered.length > 0) result.set(id, filtered);
  }
  return result;
}
