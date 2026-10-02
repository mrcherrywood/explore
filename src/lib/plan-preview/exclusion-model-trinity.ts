import type { ContractMeasure } from "@/lib/reward-factor";

import type { PlanPreviewFinalScoresResult } from "./final-scores";
import { toBaselineMeasureCode } from "./measure-resolve";
import type { OfficialStarRow } from "./store-official";

/** Trinity contracts explained on the exclusion-model detail pages. */
export const TRINITY_REWARD_CONTRACTS = ["H3668", "H9179"] as const;

export const TRINITY_PARENT_ORGANIZATION = "Trinity Health Corporation";

export function isTrinityParent(parentOrganization: string): boolean {
  return parentOrganization.trim().toLowerCase() === TRINITY_PARENT_ORGANIZATION.toLowerCase();
}

export type TrinityScenarioId = "none" | "five-c" | "five-c-plus-d" | "scenario-3" | "scenario-4";

export type TrinityDroppedMeasure = {
  code: string;
  name: string;
  star: number | null;
  weight: number | null;
  inFiveC: boolean;
  /** True when this scenario column removes the measure. */
  columns: boolean[];
  /** Present in the Overall scoring set for this contract. */
  inPopulation: boolean;
  /** Already omitted from Overall before this scenario, such as Part D complaints. */
  alreadyOutOfOverall: boolean;
};

export type TrinityDetailPage = {
  key: string;
  note: string;
  subtitle: string | null;
  dropHeaders: string[];
  dropped: TrinityDroppedMeasure[];
  scenarios: TrinityScenarioMath[];
};

export type TrinityScenarioMath = {
  id: TrinityScenarioId;
  label: string;
  keptCount: number;
  weightedMean: number;
  weightedVariance: number;
  meanCategory: string;
  varianceCategory: string;
  mean65th: number;
  mean85th: number;
  variance30th: number;
  variance70th: number;
  rewardFactor: number;
  cai: number | null;
  finalScoreRaw: number;
  finalRating: number;
  thresholdsRecomputed: boolean;
  /** Plain-language reason for this reward factor. Computed on the server so the page stays free of Node imports. */
  reason: string;
};

export type TrinityContractDetail = {
  contractId: string;
  contractName: string | null;
  publishedRating: number | null;
  /** First page. Kept so existing callers can read the Five C detail directly. */
  dropped: TrinityDroppedMeasure[];
  scenarios: TrinityScenarioMath[];
  pages: TrinityDetailPage[];
};

export type TrinityRewardDetail = {
  contracts: TrinityContractDetail[];
};

export type TrinityScenarioInput = {
  id: TrinityScenarioId;
  label: string;
  removedCodes: readonly string[];
  thresholdsRecomputed: boolean;
  result: PlanPreviewFinalScoresResult;
};

export function rewardFactorReason(scenario: Pick<TrinityScenarioMath, "meanCategory" | "varianceCategory" | "rewardFactor">): string {
  if (scenario.meanCategory === "below_threshold") {
    return "The mean is below the 65th percentile, so the reward factor is 0.";
  }
  if (scenario.varianceCategory === "high") {
    return "The variance is in the high band, so the reward factor is 0.";
  }
  const mean = scenario.meanCategory === "high" ? "high" : "relatively high";
  const variance = scenario.varianceCategory === "low" ? "low" : "medium";
  return `A ${mean} mean and ${variance} variance produce a ${scenario.rewardFactor.toFixed(1)} reward factor.`;
}

export function assembleTrinityRewardDetail(input: {
  contractIds: readonly string[];
  population: Map<string, ContractMeasure[]>;
  officialStars: OfficialStarRow[];
  names: Map<string, string | null>;
  publishedRating: Map<string, number | null>;
  drops: ReadonlyArray<TrinityDropInput>;
  baselineYear: number;
  scenarios: readonly TrinityScenarioInput[];
  sections?: readonly TrinitySectionInput[];
}): TrinityRewardDetail {
  const starsByContract = new Map<string, OfficialStarRow[]>();
  for (const row of input.officialStars) {
    const existing = starsByContract.get(row.contractId);
    if (existing) existing.push(row);
    else starsByContract.set(row.contractId, [row]);
  }

  const contracts: TrinityContractDetail[] = [];
  for (const contractId of input.contractIds) {
    const measures = input.population.get(contractId) ?? [];
    const official = starsByContract.get(contractId) ?? [];
    const sections = input.sections ?? [
      {
        key: "five",
        note: "",
        subtitle: null,
        dropHeaders: ["Five C", "Five C + D"],
        drops: input.drops,
        scenarios: input.scenarios,
      },
    ];
    const pages = sections
      .map((section) => ({
        key: section.key,
        note: section.note,
        subtitle: section.subtitle,
        dropHeaders: [...section.dropHeaders],
        dropped: section.drops.map((drop) => droppedMeasure(drop, measures, official, input.baselineYear)),
        scenarios: section.scenarios
          .map((scenario) => scenarioMath(contractId, scenario))
          .filter((scenario): scenario is TrinityScenarioMath => scenario !== null),
      }))
      .filter((page) => page.scenarios.length > 0);
    if (pages.length === 0) continue;
    const named = [...input.scenarios, ...sections.flatMap((section) => section.scenarios)]
      .map((scenario) => scenario.result.contracts.find((row) => row.contractId === contractId)?.contractName)
      .find((name) => name);
    contracts.push({
      contractId,
      contractName: named ?? input.names.get(contractId) ?? null,
      publishedRating: input.publishedRating.get(contractId) ?? null,
      dropped: pages[0].dropped,
      scenarios: pages[0].scenarios,
      pages,
    });
  }
  return { contracts };
}

type TrinityDropInput = {
  code: string;
  name: string;
  scoringCode?: string;
  normalized?: string;
  inFiveC?: boolean;
  columns?: boolean[];
  alreadyOutOfOverall?: boolean;
};

type TrinitySectionInput = {
  key: string;
  note: string;
  subtitle: string | null;
  dropHeaders: string[];
  drops: readonly TrinityDropInput[];
  scenarios: readonly TrinityScenarioInput[];
};

function droppedMeasure(
  drop: TrinityDropInput,
  measures: readonly ContractMeasure[],
  official: readonly OfficialStarRow[],
  baselineYear: number,
): TrinityDroppedMeasure {
  const scoringCode = drop.scoringCode ?? drop.code;
  const measure = measures.find((row) => row.code.toUpperCase() === scoringCode.toUpperCase());
  const officialMatch = official.find((row) => drop.normalized && row.measureNormalized === drop.normalized);
  const labeled = measure ? officialName(measure, official, baselineYear) : officialMatch?.measureDisplayName ?? null;
  const star = measure?.starValue ?? (officialMatch?.status === "scored" ? officialMatch.star : null);
  return {
    code: drop.code,
    name: labeled ?? drop.name,
    star,
    weight: measure?.weight ?? null,
    inFiveC: drop.inFiveC ?? drop.columns?.[0] ?? false,
    columns: drop.columns ?? [Boolean(drop.inFiveC), true],
    inPopulation: Boolean(measure),
    alreadyOutOfOverall: drop.alreadyOutOfOverall ?? false,
  };
}

function officialName(
  measure: ContractMeasure,
  official: readonly OfficialStarRow[],
  baselineYear: number,
): string | null {
  const match =
    official.find((row) => measure.normalizedName && row.measureNormalized === measure.normalizedName) ??
    official.find(
      (row) =>
        toBaselineMeasureCode(row.measureNormalized, row.measureCode, baselineYear).toUpperCase() ===
        measure.code.toUpperCase(),
    ) ??
    official.find((row) => row.measureCode.toUpperCase() === measure.code.toUpperCase());
  return match?.measureDisplayName ?? null;
}

function scenarioMath(contractId: string, scenario: TrinityScenarioInput): TrinityScenarioMath | null {
  const row = scenario.result.contracts.find((contract) => contract.contractId === contractId);
  if (!row || row.finalScoreRaw == null || row.finalRating == null || !row.selectedLeg) return null;
  const leg = row.selectedLeg === "with_qi" ? row.withQi : row.withoutQi;
  const thresholds = row.selectedLeg === "with_qi" ? scenario.result.thresholds.withQi : scenario.result.thresholds.withoutQi;
  if (!leg || !thresholds) return null;
  const math = {
    id: scenario.id,
    label: scenario.label,
    keptCount: leg.measureCount,
    weightedMean: leg.baseMean,
    weightedVariance: leg.weightedVariance,
    meanCategory: leg.meanCategory,
    varianceCategory: leg.varianceCategory,
    mean65th: thresholds.mean65th,
    mean85th: thresholds.mean85th,
    variance30th: thresholds.variance30th,
    variance70th: thresholds.variance70th,
    rewardFactor: leg.rewardFactor,
    cai: row.caiValue,
    finalScoreRaw: row.finalScoreRaw,
    finalRating: row.finalRating,
    thresholdsRecomputed: scenario.thresholdsRecomputed,
  };
  return { ...math, reason: rewardFactorReason(math) };
}

