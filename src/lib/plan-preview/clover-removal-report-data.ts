import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { loadLatestEnrollment } from "@/lib/clover-impact/analysis";
import { loadMeasureStarsFromFile } from "@/lib/reward-factor/backtest";
import { QI_MEASURE_CODES } from "@/lib/clover-impact/scenarios";
import { getOfficialForScenario } from "@/lib/reward-factor/official-threshold-data";
import type { ContractMeasure } from "@/lib/reward-factor";

import {
  qiScoreDirection,
  cloverMeasurePath,
  keptReasonWhenShort,
  MIN_RATED_MEASURES,
  type CloverRemovalQiDirection,
} from "./clover-removal-constants";
import { guessRemainingQi } from "./clover-qi-guess";

import {
  anyMeasurePool,
  applyBetterOfStars,
  assumeQiStar,
  assumeQiStars,
  cloverCandidatePool,
  evaluateAllLowStarRemoval,
  evaluateCloverRemoval,
  evaluateKeptRemoval,
  evaluateWithoutQi,
  findContractMinRemovals,
  findSharedRemovalLadder,
  FOUR_STAR_CUTOFF,
  isHedisDomain,
  removalPriority,
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
  loadOfficialMeasureWeights,
  officialCutPointsPath,
  parseOfficialCutPointsCsv,
  type OfficialCutPointRow,
} from "./official-cut-points";
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

export type CloverRemovalIfRemoved =
  | { status: "scored"; finalScoreRaw: number; delta: number }
  | { status: "unrated" };

export type CloverRemovalPathMeasure = CloverRemovalMeasureRef & {
  role: "removed" | "kept" | "ineligible";
  reason: string;
  /** Overall if this kept measure were also removed. Null when the row is already out or cannot be removed. */
  ifRemoved: CloverRemovalIfRemoved | null;
};

export type CloverRemovalQiOption = {
  qiStar: number;
  finalScoreRaw: number | null;
  finalRating: number | null;
  rewardFactor: number | null;
  atFour: boolean;
};

export type CloverRemovalQiGuess = {
  partCStar: number | null;
  partDStar: number | null;
  partDRemoved: boolean;
  finalScoreRaw: number | null;
  rewardFactor: number | null;
  atFour: boolean;
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
  publishedQi: Array<{ code: string; star: number }>;
  qiImproved: number;
  qiDeclined: number;
  qiDirection: CloverRemovalQiDirection;
  /** Shared list, or every allowed removal when this contract cannot reach 4.0. */
  qiBasis: "shared" | "full";
  qiGuess: CloverRemovalQiGuess | null;
  qiOptions: CloverRemovalQiOption[];
  pathMeasures: CloverRemovalPathMeasure[];
  /** Overall using the higher star of this year and last year on each measure. */
  betterOf: {
    priorYear: number;
    score: CloverRemovalLegScore | null;
    usedPrior: Array<{
      code: string;
      displayName: string;
      currentStar: number;
      priorStar: number;
    }>;
  };
  /** Overall with Quality Improvement removed, using the without-QI reward-factor thresholds. */
  noQi: CloverRemovalLegScore | null;
  /** Overall after every 3★ or lower measure in this lens is removed. */
  lowStars: {
    removedCount: number;
    availableCount: number;
    removedAll: boolean;
    score: CloverRemovalLegScore | null;
  };
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

export type CloverRemovalLensId = "eligible" | "any";

export type CloverRemovalLens = {
  lensId: CloverRemovalLensId;
  lensLabel: string;
  recommendedUsesHedis: boolean;
  candidateMeasures: CloverRemovalMeasureRef[];
  recommended: CloverSharedLadderRow | null;
  recommendedMeasures: CloverRemovalMeasureRef[];
  ladder: CloverSharedLadderRow[];
  contracts: CloverRemovalContractPage[];
  sensitivity: CloverRemovalSensitivityRow[] | null;
  notes: string[];
};

export type CloverRemovalReport = {
  starsYear: number;
  priorStarsYear: number;
  priorStarsAvailable: boolean;
  parentOrganization: string;
  generatedAt: string;
  enrollmentSource: { year: number; month: number; fileName: string };
  minRatedMeasures: number;
  excluded: CloverRemovalExcludedContract[];
  lenses: CloverRemovalLens[];
} & CloverRemovalLens;

function loadQiCutPoints(starsYear: number): {
  partC: OfficialCutPointRow | null;
  partD: OfficialCutPointRow | null;
} {
  const rows = parseOfficialCutPointsCsv(readFileSync(officialCutPointsPath(starsYear), "utf8"));
  const qi = rows.filter((row) => /quality improvement/i.test(row.measureName));
  return {
    partC: qi.find((row) => row.measureCode.toUpperCase().startsWith("C")) ?? null,
    partD: qi.find((row) => row.measureCode.toUpperCase().startsWith("D")) ?? null,
  };
}

function qiSignal(value: string | null): "improvement" | "decline" | null {
  if (!value) return null;
  if (/improv/i.test(value)) return "improvement";
  if (/declin|decreas|worse/i.test(value)) return "decline";
  return null;
}

export function matchesParentOrganization(
  value: string | null | undefined,
  selected: string,
): boolean {
  const left = (value?.trim() || UNKNOWN_PARENT_ORG).toLowerCase();
  return left === selected.trim().toLowerCase();
}

function priorStarsFileExists(year: number): boolean {
  return existsSync(path.join(process.cwd(), "data", String(year), `measure_stars_${year}.json`));
}

function loadPriorStarsByContract(year: number): Map<string, Map<string, number>> {
  if (!priorStarsFileExists(year)) return new Map();
  const byContract = new Map<string, Map<string, number>>();
  for (const [contractId, measures] of loadMeasureStarsFromFile(year)) {
    const byCode = new Map<string, number>();
    for (const measure of measures) {
      if (measure.starValue > 0) byCode.set(measure.code.toUpperCase(), measure.starValue);
    }
    byContract.set(contractId, byCode);
  }
  return byContract;
}

function betterOfForContract(
  searchInput: CloverContractSearchInput | undefined,
  priorByContract: Map<string, Map<string, number>>,
  priorYear: number,
  displayByCode: Map<string, string>,
  withQi: NonNullable<ReturnType<typeof getOfficialForScenario>>,
  withoutQi: NonNullable<ReturnType<typeof getOfficialForScenario>>,
): CloverRemovalContractPage["betterOf"] {
  if (!searchInput) return { priorYear, score: null, usedPrior: [] };
  const prior = priorByContract.get(searchInput.contractId) ?? new Map<string, number>();
  const better = applyBetterOfStars(searchInput.measures, prior);
  return {
    priorYear,
    score: evaluateCloverRemoval({ ...searchInput, measures: better.measures }, [], withQi, withoutQi),
    usedPrior: better.usedPrior.map((row) => ({
      code: row.code,
      displayName: displayByCode.get(row.code) ?? row.code,
      currentStar: row.currentStar,
      priorStar: row.priorStar,
    })),
  };
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
  domainByCode?: Map<string, string>;
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
  const priorStarsYear = baselineYear;
  const priorStarsAvailable = priorStarsFileExists(priorStarsYear);
  const priorByContract = loadPriorStarsByContract(priorStarsYear);
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

  const scoredCodes: string[] = [];
  for (const measures of measuresById.values()) {
    for (const measure of measures) {
      if (measure.weight > 0 && measure.starValue > 0) scoredCodes.push(measure.code);
    }
  }
  const openPool = anyMeasurePool(scoredCodes);
  const hedisCodes = new Set(
    openPool.filter((code) => isHedisDomain(input.domainByCode?.get(code))),
  );
  const qiCuts = loadQiCutPoints(starsYear);

  const buildLens = (lensId: CloverRemovalLensId, pool: string[]): CloverRemovalLens => {
  const priority = lensId === "any"
    ? removalPriority({
        eligible: new Set(cloverCandidatePool()),
        hedis: hedisCodes,
        domainByCode: input.domainByCode,
      })
    : undefined;
  const perContract = searchInputs.map((row) =>
    findContractMinRemovals(row, withQi, withoutQi, pool, priority),
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
    priority,
  );
  const recommended = ladder.find((row) => row.coversReachable) ?? null;
  const sharedCodes = (recommended ?? ladder[ladder.length - 1])?.codes ?? [];
  const sharedById = new Map(
    (recommended ?? ladder[ladder.length - 1])?.perContract.map((row) => [row.contractId, row.score]) ?? [],
  );
  const inputById = new Map(searchInputs.map((row) => [row.contractId, row]));

  const contracts: CloverRemovalContractPage[] = perContract.map((row) => {
    const measures = measuresById.get(row.contractId) ?? [];
    const summary = overallById.get(row.contractId);
    const searchInput = inputById.get(row.contractId);
    let qiImproved = 0;
    let qiDeclined = 0;
    const qiLabels = [];
    for (const starRow of input.officialStars) {
      if (starRow.contractId !== row.contractId) continue;
      const code = toBaselineMeasureCode(starRow.measureNormalized, starRow.measureCode, baselineYear);
      if (QI_MEASURE_CODES.has(code)) continue;
      const signal = qiSignal(starRow.qiSignificance);
      if (signal === "improvement") qiImproved += 1;
      if (signal === "decline") qiDeclined += 1;
      const weight = input.weightByCode.get(starRow.measureCode.toUpperCase());
      if (!starRow.qiSignificance || weight == null) continue;
      qiLabels.push({
        baselineCode: code,
        part: /part d/i.test(starRow.metricCategory) ? ("part_d" as const) : ("part_c" as const),
        significance: starRow.qiSignificance,
        weight,
      });
    }
    const qiDirection = qiScoreDirection(qiImproved, qiDeclined);
    const lowStarRemoval = searchInput
      ? evaluateAllLowStarRemoval(searchInput, withQi, withoutQi, pool, priority)
      : null;
    const sharedScore = sharedById.get(row.contractId) ?? null;
    const qiBasis = row.reachableWithinMax || row.alreadyAtFour ? "shared" : "full";
    const qiCodes = qiBasis === "full" ? row.ceilingCodes : sharedCodes;
    const partDRemoved = (qiBasis === "full" ? row.fullPool : sharedScore)?.partDQiRemoved ?? false;
    const guessed = guessRemainingQi(qiLabels, qiCodes, qiCuts);
    const qiScore = searchInput
      ? evaluateCloverRemoval(
          assumeQiStars(searchInput, {
            ...(guessed.partC.star != null ? { C30: guessed.partC.star } : {}),
            ...(partDRemoved || guessed.partD.star == null ? {} : { D04: guessed.partD.star }),
          }),
          qiCodes,
          withQi,
          withoutQi,
          pool,
        )
      : null;
    const qiGuess: CloverRemovalQiGuess | null =
      guessed.partC.star == null && guessed.partD.star == null && !partDRemoved
        ? null
        : {
            partCStar: guessed.partC.star,
            partDStar: partDRemoved ? null : guessed.partD.star,
            partDRemoved,
            finalScoreRaw: qiScore?.finalScoreRaw ?? null,
            rewardFactor: qiScore?.rewardFactor ?? null,
            atFour: (qiScore?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF,
          };
    const qiOptions: CloverRemovalQiOption[] = [1, 2, 3, 4, 5].map((qiStar) => {
      const score = searchInput
        ? evaluateCloverRemoval(assumeQiStar(searchInput, qiStar), qiCodes, withQi, withoutQi, pool)
        : null;
      return {
        qiStar,
        finalScoreRaw: score?.finalScoreRaw ?? null,
        finalRating: score?.finalRating ?? null,
        rewardFactor: score?.rewardFactor ?? null,
        atFour: (score?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF,
      };
    });
    const poolSet = new Set(pool);
    const sharedSet = new Set(sharedCodes);
    const ownSet = new Set(row.minSets[0]?.codes ?? []);
    const ceilingSet = new Set(row.ceilingCodes);
    const canReachFour = row.reachableWithinMax || row.alreadyAtFour;
    const pathCodes = qiCodes;
    const pathScore = (qiBasis === "full" ? row.fullPool : sharedScore)?.finalScoreRaw ?? null;
    const pathMeasures: CloverRemovalPathMeasure[] = measures
      .filter((measure) => measure.weight > 0 && measure.starValue > 0)
      .map((measure) => {
        const code = measure.code.toUpperCase();
        const path = cloverMeasurePath({
          isQi: QI_MEASURE_CODES.has(code),
          isPartDQi: code === "D04",
          isHedis: lensId === "any" && hedisCodes.has(code),
          star: measure.starValue,
          inPool: poolSet.has(code),
          onShared: sharedSet.has(code),
          onOwnMin: ownSet.has(code),
          partDQiRemoved: partDRemoved,
          alreadyAtFour: row.alreadyAtFour,
          canReachFour,
          onCeiling: ceilingSet.has(code),
        });
        let ifRemoved: CloverRemovalIfRemoved | null = null;
        if (path.role === "kept" && poolSet.has(code) && searchInput && pathScore != null) {
          const keptRemoval = evaluateKeptRemoval(searchInput, pathCodes, code, withQi, withoutQi, pool);
          ifRemoved =
            keptRemoval === "unrated"
              ? { status: "unrated" }
              : {
                  status: "scored",
                  finalScoreRaw: keptRemoval.finalScoreRaw,
                  delta: keptRemoval.finalScoreRaw - pathScore,
                };
        }
        const reason =
          !canReachFour && path.role === "kept" && ifRemoved
            ? keptReasonWhenShort({
                star: measure.starValue,
                ifRemoved:
                  ifRemoved.status === "unrated" ? "unrated" : ifRemoved.delta < -0.0005 ? "lower" : "other",
              })
            : path.reason;
        return {
          ...labelForCode(code, displayByCode),
          star: measure.starValue,
          weight: measure.weight,
          role: path.role,
          reason,
          ifRemoved,
        };
      })
      .sort((left, right) => left.code.localeCompare(right.code, undefined, { numeric: true }));
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
      sharedScore,
      publishedQi: measures
        .filter((measure) => QI_MEASURE_CODES.has(measure.code.toUpperCase()) && measure.starValue > 0)
        .map((measure) => ({ code: measure.code.toUpperCase(), star: measure.starValue }))
        .sort((left, right) => left.code.localeCompare(right.code)),
      qiImproved,
      qiDeclined,
      qiDirection,
      qiBasis,
      qiGuess,
      qiOptions,
      pathMeasures,
      betterOf: betterOfForContract(searchInput, priorByContract, priorStarsYear, displayByCode, withQi, withoutQi),
      noQi: searchInput ? evaluateWithoutQi(searchInput, [], withQi, withoutQi) : null,
      lowStars: {
        removedCount: lowStarRemoval?.codes.length ?? 0,
        availableCount: lowStarRemoval?.availableCount ?? 0,
        removedAll: lowStarRemoval?.removedAll ?? true,
        score: lowStarRemoval?.score ?? null,
      },
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
    lensId,
    lensLabel: lensId === "any" ? "Any measure, HEDIS last" : "Recalc and Clover-20",
    recommendedUsesHedis:
      lensId === "any" && (recommended?.codes ?? []).some((code) => hedisCodes.has(code)),
    candidateMeasures: pool.map((code) => labelForCode(code, displayByCode)),
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
    sensitivity,
    notes: [
      "Reward-factor thresholds are the official CMS Technical Notes Overall MA-PD values and are not recomputed after measure removals.",
      "The sensitivity row shows the recommended list with thresholds recomputed from the full H+R market.",
      "Removal lists use the Quality Improvement stars CMS assigned. When a removal set leaves no other Part D measures, Part D QI is removed with them. The measure pages list every rated measure and why it is or is not on the path. The best guess drops those removed measures out of the year-over-year labels, weights significant improvement as +1 and significant decline as -1, counts no change and hold harmless as 0, and bands that score with the official QI cut points.",
      `Better-Of uses the higher of this year's star and the Stars ${priorStarsYear} star on each measure scored this year. No QI drops Part C and Part D Quality Improvement and scores the rest with the official without-QI reward-factor thresholds.`,
      "Disaster/EUC higher-of uplift is not modeled.",
      lensId === "any"
        ? `Any rated measure can be removed except Quality Improvement. Removals start with the Stars 2026 Recalc and Clover-20 measures, then the other domains, and HEDIS only if the contract is still short of 4.0. At least ${MIN_RATED_MEASURES} Part C and Part D measures have to remain.`
        : `Eligible measures are the Stars 2026 Recalc set plus Clover-20, excluding the Part D twins of Complaints and Members Choosing to Leave. Quality Improvement is not chosen for removal. As many eligible measures as needed can be removed, as long as at least ${MIN_RATED_MEASURES} Part C and Part D measures remain.`,
    ],
  };
  };

  const lenses = [buildLens("eligible", pool), buildLens("any", openPool)];
  return {
    starsYear,
    priorStarsYear,
    priorStarsAvailable,
    parentOrganization: parent,
    generatedAt: new Date().toISOString(),
    enrollmentSource: enrollment.source,
    minRatedMeasures: MIN_RATED_MEASURES,
    excluded,
    lenses,
    ...lenses[0],
  };
}
