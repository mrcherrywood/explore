import { loadLatestEnrollment } from "@/lib/clover-impact/analysis";
import { getOfficialForScenario } from "@/lib/reward-factor/official-threshold-data";
import type { ContractMeasure } from "@/lib/reward-factor";

import {
  cloverCandidatePool,
  findContractMinRemovals,
  findSharedRemovalLadder,
  FOUR_STAR_CUTOFF,
  MAX_CLOVER_REMOVALS,
  type CloverRemovalLegScore,
  type CloverContractSearchInput,
  type CloverSharedLadderRow,
} from "./clover-min-removal";
import {
  buildAnchoredPopulation,
  buildCustomRemovalScenario,
} from "./final-scores";
import { measureAcronym } from "./measure-acronyms";
import { toBaselineMeasureCode } from "./measure-resolve";
import {
  caiFromOfficialSummaries,
  overlayOfficialStarsOnPredictions,
} from "./official-scenarios";
import type { OfficialStarRow, OfficialSummaryRow } from "./store-official";
import type { PlanPreviewPredictionsResult } from "./predictions";

export const UNKNOWN_PARENT_ORG = "Unknown parent organization";

export type CloverRemovalMeasureRef = {
  code: string;
  acronym: string;
  displayName: string;
  star: number | null;
  weight: number | null;
};

export type CloverRemovalContractPage = {
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  enrollment: number | null;
  publishedRating: number | null;
  publishedFinal: number | null;
  baseline: CloverRemovalLegScore | null;
  fullPool: CloverRemovalLegScore | null;
  candidates: CloverRemovalMeasureRef[];
  minK: number | null;
  minSets: Array<{ measures: CloverRemovalMeasureRef[]; score: CloverRemovalLegScore }>;
  reachableWithinMax: boolean;
  alreadyAtFour: boolean;
  sharedScore: CloverRemovalLegScore | null;
};

export type CloverRemovalExcludedContract = {
  contractId: string;
  contractName: string | null;
  reason: string;
};

export type CloverRemovalSensitivityRow = {
  contractId: string;
  officialAtFour: boolean;
  recomputedAtFour: boolean;
  recomputedScore: number | null;
  recomputedRating: number | null;
};

export type CloverRemovalReport = {
  starsYear: number;
  parentOrganization: string;
  generatedAt: string;
  enrollmentSource: { year: number; month: number; fileName: string };
  candidateMeasures: CloverRemovalMeasureRef[];
  maxRemovals: number;
  recommended: CloverSharedLadderRow | null;
  recommendedMeasures: CloverRemovalMeasureRef[];
  ladder: CloverSharedLadderRow[];
  contracts: CloverRemovalContractPage[];
  excluded: CloverRemovalExcludedContract[];
  sensitivity: CloverRemovalSensitivityRow[] | null;
  notes: string[];
};

export function matchesParentOrganization(
  value: string | null | undefined,
  selected: string,
): boolean {
  const left = (value?.trim() || UNKNOWN_PARENT_ORG).toLowerCase();
  return left === selected.trim().toLowerCase();
}

function labelForCode(
  code: string,
  displayByCode: Map<string, string>,
): CloverRemovalMeasureRef {
  return {
    code,
    acronym: measureAcronym(code),
    displayName: displayByCode.get(code) ?? code,
    star: null,
    weight: null,
  };
}

function measureRefs(
  codes: string[],
  displayByCode: Map<string, string>,
  measures: ContractMeasure[],
): CloverRemovalMeasureRef[] {
  const byCode = new Map(measures.map((row) => [row.code.toUpperCase(), row]));
  return codes.map((code) => {
    const measure = byCode.get(code);
    return {
      ...labelForCode(code, displayByCode),
      star: measure?.starValue ?? null,
      weight: measure?.weight ?? null,
    };
  });
}

export function buildCloverRemovalReport(input: {
  starsYear: number;
  parentOrganization: string;
  officialStars: OfficialStarRow[];
  officialSummaries: OfficialSummaryRow[];
  weightByCode: Map<string, number>;
  predictions?: PlanPreviewPredictionsResult | null;
}): CloverRemovalReport {
  const { starsYear, parentOrganization } = input;
  const baselineYear = starsYear - 1;
  const overlaid = overlayOfficialStarsOnPredictions(
    input.predictions ?? null,
    input.officialStars,
    input.weightByCode,
    starsYear,
  );
  const cai = caiFromOfficialSummaries(input.officialSummaries);
  if (overlaid.baselineYear === null) {
    throw new Error("No published baseline year is available to score Clover removals.");
  }
  const withQi = getOfficialForScenario(starsYear, "overall_mapd", true);
  const withoutQi = getOfficialForScenario(starsYear, "overall_mapd", false);
  if (!withQi || !withoutQi) {
    throw new Error(`Official Overall MA-PD reward-factor thresholds are missing for Stars ${starsYear}.`);
  }

  const population = buildAnchoredPopulation(overlaid, overlaid.baselineYear);
  const enrollment = loadLatestEnrollment();
  const pool = cloverCandidatePool();
  const parent = parentOrganization.trim();
  const parentIds = new Set<string>();
  const names = new Map<string, string | null>();
  const parents = new Map<string, string | null>();
  const displayByCode = new Map<string, string>();

  for (const row of input.officialStars) {
    if (!matchesParentOrganization(row.parentOrganization, parent)) continue;
    parentIds.add(row.contractId);
    names.set(row.contractId, row.contractName);
    parents.set(row.contractId, row.parentOrganization);
    const code = toBaselineMeasureCode(row.measureNormalized, row.measureCode, baselineYear);
    if (!displayByCode.has(code)) displayByCode.set(code, row.measureDisplayName);
  }
  for (const row of input.officialSummaries) {
    if (!matchesParentOrganization(row.parentOrganization, parent)) continue;
    parentIds.add(row.contractId);
    if (!names.has(row.contractId)) names.set(row.contractId, row.contractName);
    if (!parents.has(row.contractId)) parents.set(row.contractId, row.parentOrganization);
  }

  const overallById = new Map(
    input.officialSummaries
      .filter((row) => row.ratingType === "overall")
      .map((row) => [row.contractId, row]),
  );

  const excluded: CloverRemovalExcludedContract[] = [];
  const searchInputs: CloverContractSearchInput[] = [];
  const measuresById = new Map<string, ContractMeasure[]>();

  for (const contractId of [...parentIds].sort()) {
    const summary = overallById.get(contractId);
    const measures = population.get(contractId) ?? [];
    if (!summary) {
      excluded.push({
        contractId,
        contractName: names.get(contractId) ?? null,
        reason: "No published Overall rating.",
      });
      continue;
    }
    if (measures.length === 0) {
      excluded.push({
        contractId,
        contractName: names.get(contractId) ?? summary.contractName,
        reason: "Too few measures for an Overall MA-PD rating.",
      });
      continue;
    }
    measuresById.set(contractId, measures);
    searchInputs.push({
      contractId,
      measures,
      overallCai: cai.overall[contractId] ?? null,
      partCCai: cai.partC[contractId] ?? null,
      enrollment: enrollment.enrollmentByContract.get(contractId) ?? 0,
    });
  }

  if (searchInputs.length === 0) {
    throw new Error(`No rated ${parent} contracts have Plan Preview 2 Overall results for Stars ${starsYear}.`);
  }

  const perContract = searchInputs.map((row) =>
    findContractMinRemovals(row, withQi, withoutQi, pool),
  );
  const reachableIds = new Set(
    perContract.filter((row) => row.reachableWithinMax || row.alreadyAtFour).map((row) => row.contractId),
  );
  const ladder = findSharedRemovalLadder(
    searchInputs,
    withQi,
    withoutQi,
    reachableIds,
    pool,
  );
  const recommended = ladder.find((row) => row.coversReachable) ?? null;
  const sharedById = new Map(
    (recommended ?? ladder[ladder.length - 1])?.perContract.map((row) => [row.contractId, row.score]) ?? [],
  );

  const contracts: CloverRemovalContractPage[] = perContract.map((row) => {
    const measures = measuresById.get(row.contractId) ?? [];
    const summary = overallById.get(row.contractId);
    return {
      contractId: row.contractId,
      contractName: names.get(row.contractId) ?? summary?.contractName ?? null,
      parentOrganization: parents.get(row.contractId) ?? summary?.parentOrganization ?? null,
      enrollment: enrollment.enrollmentByContract.get(row.contractId) ?? null,
      publishedRating: summary?.finalRating ?? null,
      publishedFinal: summary?.finalSummary ?? null,
      baseline: row.baseline,
      fullPool: row.fullPool,
      candidates: measureRefs(row.candidates, displayByCode, measures),
      minK: row.minK,
      minSets: row.minSets.map((set) => ({
        measures: measureRefs(set.codes, displayByCode, measures),
        score: set.score,
      })),
      reachableWithinMax: row.reachableWithinMax,
      alreadyAtFour: row.alreadyAtFour,
      sharedScore: sharedById.get(row.contractId) ?? null,
    };
  });

  let sensitivity: CloverRemovalSensitivityRow[] | null = null;
  const sensitivityCodes = recommended?.codes ?? null;
  if (sensitivityCodes) {
    const recomputed = buildCustomRemovalScenario(overlaid, cai, sensitivityCodes, {
      preferWithQi: true,
      useOfficialRewardFactorThresholds: false,
    });
    const byId = new Map(recomputed.contracts.map((row) => [row.contractId, row]));
    sensitivity = contracts.map((row) => {
      const recomputedRow = byId.get(row.contractId);
      return {
        contractId: row.contractId,
        officialAtFour: (row.sharedScore?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF,
        recomputedAtFour: (recomputedRow?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF,
        recomputedScore: recomputedRow?.finalScoreRaw ?? null,
        recomputedRating: recomputedRow?.finalRating ?? null,
      };
    });
  }

  return {
    starsYear,
    parentOrganization: parent,
    generatedAt: new Date().toISOString(),
    enrollmentSource: enrollment.source,
    candidateMeasures: pool.map((code) => labelForCode(code, displayByCode)),
    maxRemovals: MAX_CLOVER_REMOVALS,
    recommended,
    recommendedMeasures: recommended
      ? measureRefs(
          recommended.codes,
          displayByCode,
          measuresById.get(contracts[0]?.contractId ?? "") ?? [],
        ).map((row) => ({ ...row, star: null, weight: null }))
      : [],
    ladder,
    contracts,
    excluded,
    sensitivity,
    notes: [
      "Reward-factor thresholds are the official CMS Technical Notes Overall MA-PD values and are not recomputed after measure removals.",
      "The sensitivity row shows the recommended list with thresholds recomputed from the full H+R market.",
      "Quality Improvement stars stay at the published Plan Preview 2 values; they cannot be recomputed after removals.",
      "Disaster/EUC higher-of uplift is not modeled.",
      "The candidate pool is the official Stars 2026 recalculation set (June 17, 2026): six named Part C measures plus Part D, excluding shared-measure twins D02/D03 and Quality Improvement. Part C and Part D Quality Improvement are never removed.",
    ],
  };
}
