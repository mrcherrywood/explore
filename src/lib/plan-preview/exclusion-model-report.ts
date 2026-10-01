import { loadLatestEnrollment } from "@/lib/clover-impact/analysis";

import { matchesParentOrganization, UNKNOWN_PARENT_ORG } from "./clover-removal-report-data";
import {
  EXCLUSION_MODELS,
  exclusionCrosswalk,
  exclusionRemovalCodes,
  type ExclusionCrosswalkRow,
  type ExclusionModel,
  type ExclusionModelId,
} from "./exclusion-models";
import {
  buildAnchoredPopulation,
  buildCustomRemovalScenario,
  type PlanPreviewFinalScore,
} from "./final-scores";
import { caiFromOfficialSummaries, overlayOfficialStarsOnPredictions } from "./official-scenarios";
import type { PlanPreviewPredictionsResult } from "./predictions";
import type { OfficialStarRow, OfficialSummaryRow } from "./store-official";

export type ExclusionModelScoreValue = {
  finalScoreRaw: number;
  finalRating: number;
  rewardFactor: number;
};

export type ExclusionModelScore = {
  id: ExclusionModelId | "published";
  score: ExclusionModelScoreValue | null;
};

export type ExclusionModelContract = {
  contractId: string;
  contractName: string | null;
  enrollment: number | null;
  publishedRating: number | null;
  publishedFinal: number | null;
  baseline: ExclusionModelScoreValue | null;
  models: ExclusionModelScore[];
};

export type ExclusionModelReport = {
  starsYear: number;
  parentOrganization: string;
  generatedAt: string;
  enrollmentSource: { year: number; month: number; fileName: string };
  models: ExclusionModel[];
  crosswalk: ExclusionCrosswalkRow[];
  contracts: ExclusionModelContract[];
  excluded: Array<{ contractId: string; contractName: string | null; reason: string }>;
};

function legScore(row: PlanPreviewFinalScore): ExclusionModelScoreValue | null {
  if (row.finalScoreRaw == null || row.finalRating == null) return null;
  const leg = row.selectedLeg === "with_qi" ? row.withQi : row.withoutQi;
  if (!leg) return null;
  return {
    finalScoreRaw: row.finalScoreRaw,
    finalRating: row.finalRating,
    rewardFactor: leg.rewardFactor,
  };
}

export function buildExclusionModelReport(input: {
  starsYear: number;
  parentOrganization: string;
  officialStars: OfficialStarRow[];
  officialSummaries: OfficialSummaryRow[];
  weightByCode: Map<string, number>;
  predictions?: PlanPreviewPredictionsResult | null;
}): ExclusionModelReport {
  const { starsYear } = input;
  const parent = input.parentOrganization.trim();
  const overlaid = overlayOfficialStarsOnPredictions(
    input.predictions ?? null,
    input.officialStars,
    input.weightByCode,
    starsYear,
  );
  if (overlaid.baselineYear === null) {
    throw new Error("No published baseline year is available to score exclusion models.");
  }
  const baselineYear = overlaid.baselineYear;

  const population = buildAnchoredPopulation(overlaid, baselineYear);
  const enrollment = loadLatestEnrollment();
  const cai = caiFromOfficialSummaries(input.officialSummaries);
  const scoreByContract = (removedCodes: readonly string[], useOfficialRewardFactorThresholds: boolean) => {
    const scenario = buildCustomRemovalScenario(overlaid, cai, removedCodes, {
      preferWithQi: true,
      useOfficialRewardFactorThresholds,
    });
    return new Map(scenario.contracts.map((row) => [row.contractId, legScore(row)]));
  };
  const baselineByContract = scoreByContract([], true);
  const modelScores = EXCLUSION_MODELS.map((model) => ({
    id: model.id,
    byContract: scoreByContract(exclusionRemovalCodes(model, baselineYear), false),
  }));
  const parentIds = new Set<string>();
  const names = new Map<string, string | null>();

  for (const row of input.officialStars) {
    if (!matchesParentOrganization(row.parentOrganization, parent)) continue;
    parentIds.add(row.contractId);
    names.set(row.contractId, row.contractName);
  }
  for (const row of input.officialSummaries) {
    if (!matchesParentOrganization(row.parentOrganization, parent)) continue;
    parentIds.add(row.contractId);
    if (!names.has(row.contractId)) names.set(row.contractId, row.contractName);
  }

  const overallById = new Map(
    input.officialSummaries
      .filter((row) => row.ratingType === "overall")
      .map((row) => [row.contractId, row]),
  );

  const excluded: ExclusionModelReport["excluded"] = [];
  const contracts: ExclusionModelContract[] = [];

  for (const contractId of [...parentIds].sort()) {
    const summary = overallById.get(contractId);
    const measures = population.get(contractId) ?? [];
    const contractName = names.get(contractId) ?? summary?.contractName ?? null;
    if (!summary) {
      excluded.push({ contractId, contractName, reason: "No published Overall rating." });
      continue;
    }
    if (measures.length === 0) {
      excluded.push({ contractId, contractName, reason: "Too few measures for an Overall rating." });
      continue;
    }
    contracts.push({
      contractId,
      contractName,
      enrollment: enrollment.enrollmentByContract.get(contractId) ?? null,
      publishedRating: summary.finalRating ?? null,
      publishedFinal: summary.finalSummary ?? null,
      baseline: baselineByContract.get(contractId) ?? null,
      models: modelScores.map((model) => ({
        id: model.id,
        score: model.byContract.get(contractId) ?? null,
      })),
    });
  }

  if (contracts.length === 0) {
    throw new Error(
      `No rated ${parent || UNKNOWN_PARENT_ORG} contracts have Plan Preview 2 Overall results for Stars ${starsYear}.`,
    );
  }

  return {
    starsYear,
    parentOrganization: parent,
    generatedAt: new Date().toISOString(),
    enrollmentSource: enrollment.source,
    models: EXCLUSION_MODELS,
    crosswalk: exclusionCrosswalk(),
    contracts,
    excluded,
  };
}
