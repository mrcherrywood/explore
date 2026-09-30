import { OVERALL_DEDUP_DROP_CODES } from "@/lib/clover-impact/analysis";
import {
  CLOVER_COMPUTED_SCENARIOS,
  OFFICIAL_RECALC_REMOVED_CODES,
  QI_MEASURE_CODES,
} from "@/lib/clover-impact/scenarios";
import {
  calculateRewardFactor,
  type ContractMeasure,
  type PercentileThresholds,
} from "@/lib/reward-factor";

import {
  FOUR_STAR_CUTOFF,
  MAX_CLOVER_REMOVALS,
  MAX_LISTED_MIN_SETS,
  removalDropsPartDQi,
} from "./clover-removal-constants";

export { FOUR_STAR_CUTOFF, MAX_CLOVER_REMOVALS, MAX_LISTED_MIN_SETS };

const OVERALL_PART_D_CODES = [
  "D01", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13",
];

export type CloverRemovalLegScore = {
  measureCount: number;
  baseMean: number;
  weightedVariance: number;
  rewardFactor: number;
  meanCategory: string;
  varianceCategory: string;
  caiValue: number | null;
  caiSource: "overall" | "part_c";
  partDQiRemoved: boolean;
  selectedLeg: "with_qi" | "without_qi";
  finalScoreRaw: number;
  finalRating: number;
};

export type CloverContractSearchInput = {
  contractId: string;
  measures: ContractMeasure[];
  overallCai: number | null;
  partCCai: number | null;
  enrollment: number;
};

export type CloverContractSearchResult = {
  contractId: string;
  baseline: CloverRemovalLegScore | null;
  fullPool: CloverRemovalLegScore | null;
  candidates: string[];
  minK: number | null;
  minSets: Array<{ codes: string[]; score: CloverRemovalLegScore }>;
  reachableWithinMax: boolean;
  alreadyAtFour: boolean;
};

export type CloverSharedLadderRow = {
  k: number;
  codes: string[];
  contractsAtFour: number;
  enrollmentAtFour: number;
  totalScore: number;
  coversReachable: boolean;
  perContract: Array<{
    contractId: string;
    atFour: boolean;
    score: CloverRemovalLegScore | null;
  }>;
};

export function isHedisDomain(domain: string | null | undefined): boolean {
  return (domain ?? "").trim().toLowerCase() === "hedis";
}

/** Every rated measure except Quality Improvement and the Part D twins dropped from Overall. */
export function anyMeasurePool(codes: Iterable<string>): string[] {
  const pool = new Set<string>();
  for (const code of codes) {
    const upper = code.toUpperCase();
    if (QI_MEASURE_CODES.has(upper) || OVERALL_DEDUP_DROP_CODES.has(upper)) continue;
    pool.add(upper);
  }
  return [...pool].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

/** Stars 2026 recalc removals plus the Model 2 Clover set, minus D02/D03 twins and QI. */
export function cloverCandidatePool(): string[] {
  const pool = new Set(
    [...OFFICIAL_RECALC_REMOVED_CODES].map((code) => code.toUpperCase()),
  );
  const model2 = CLOVER_COMPUTED_SCENARIOS.find((scenario) => scenario.id === "model2");
  for (const code of model2?.removedCodes ?? []) pool.add(code.toUpperCase());
  for (const code of OVERALL_DEDUP_DROP_CODES) pool.delete(code);
  for (const code of QI_MEASURE_CODES) pool.delete(code);
  return [...pool].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true }),
  );
}

/** Replace this contract's published QI stars. Other measures stay put. */
export function assumeQiStars(
  input: CloverContractSearchInput,
  starsByCode: Partial<Record<"C30" | "D04", number>>,
): CloverContractSearchInput {
  return {
    ...input,
    measures: input.measures.map((measure) => {
      const code = measure.code.toUpperCase();
      const star = code === "C30" || code === "D04" ? starsByCode[code] : undefined;
      return star == null ? measure : { ...measure, starValue: star };
    }),
  };
}

/** Set both Part C and Part D QI to the same star. */
export function assumeQiStar(
  input: CloverContractSearchInput,
  qiStar: number,
): CloverContractSearchInput {
  return assumeQiStars(input, { C30: qiStar, D04: qiStar });
}

export function removalUsesPartCCai(removed: Iterable<string>): boolean {
  const set = removed instanceof Set
    ? removed
    : new Set([...removed].map((code) => code.toUpperCase()));
  return OVERALL_PART_D_CODES.every((code) => set.has(code));
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function isFourStar(score: CloverRemovalLegScore | null): boolean {
  return score !== null && score.finalScoreRaw >= FOUR_STAR_CUTOFF;
}

type MeasureSums = {
  code: string;
  weight: number;
  star: number;
  isQi: boolean;
};

type ContractPrep = {
  contractId: string;
  measures: MeasureSums[];
  byCode: Map<string, MeasureSums>;
  n: number;
  w: number;
  ws: number;
  wss: number;
  qiCodes: string[];
  candidates: string[];
  overallCai: number | null;
  partCCai: number | null;
  enrollment: number;
};

function prepareContract(
  input: CloverContractSearchInput,
  pool: string[],
): ContractPrep {
  const measures: MeasureSums[] = [];
  let n = 0;
  let w = 0;
  let ws = 0;
  let wss = 0;
  const byCode = new Map<string, MeasureSums>();
  const qiCodes: string[] = [];
  for (const measure of input.measures) {
    if (measure.weight <= 0 || measure.starValue <= 0) continue;
    const code = measure.code.toUpperCase();
    const row = { code, weight: measure.weight, star: measure.starValue, isQi: QI_MEASURE_CODES.has(code) };
    measures.push(row);
    byCode.set(code, row);
    n += 1;
    w += row.weight;
    ws += row.weight * row.star;
    wss += row.weight * row.star * row.star;
    if (row.isQi) qiCodes.push(code);
  }
  return {
    contractId: input.contractId,
    measures,
    byCode,
    n,
    w,
    ws,
    wss,
    qiCodes,
    candidates: pool.filter((code) => byCode.has(code)),
    overallCai: input.overallCai,
    partCCai: input.partCCai,
    enrollment: input.enrollment,
  };
}

function subtractCodes(
  prep: ContractPrep,
  codes: Iterable<string>,
): { n: number; w: number; ws: number; wss: number } | null {
  let { n, w, ws, wss } = prep;
  for (const raw of codes) {
    const row = prep.byCode.get(raw.toUpperCase());
    if (!row) continue;
    n -= 1;
    w -= row.weight;
    ws -= row.weight * row.star;
    wss -= row.weight * row.star * row.star;
  }
  if (n <= 1 || w <= 0) return null;
  return { n, w, ws, wss };
}

function scoreLeg(
  stats: { n: number; w: number; ws: number; wss: number },
  contractId: string,
  thresholds: PercentileThresholds,
  caiValue: number | null,
  caiSource: "overall" | "part_c",
  partDQiRemoved: boolean,
  selectedLeg: "with_qi" | "without_qi",
): CloverRemovalLegScore {
  const baseMean = stats.ws / stats.w;
  const weightedVariance = (stats.n / (stats.n - 1)) * ((stats.wss - baseMean * baseMean * stats.w) / stats.w);
  const result = calculateRewardFactor(
    { contractId, weightedMean: baseMean, weightedVariance, measureCount: stats.n, totalWeight: stats.w },
    thresholds,
    "overall_mapd",
  );
  const finalScoreRaw = result.adjustedRating + (caiValue ?? 0);
  return {
    measureCount: stats.n,
    baseMean: result.weightedMean,
    weightedVariance: result.weightedVariance,
    rewardFactor: result.rFactor,
    meanCategory: result.meanCategory,
    varianceCategory: result.varianceCategory,
    caiValue,
    caiSource,
    partDQiRemoved,
    selectedLeg,
    finalScoreRaw,
    finalRating: roundToHalf(Math.min(5, Math.max(1, finalScoreRaw))),
  };
}

export function evaluateCloverRemoval(
  input: CloverContractSearchInput,
  removedCodes: Iterable<string>,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool = cloverCandidatePool(),
): CloverRemovalLegScore | null {
  const prep = prepareContract(input, pool);
  return evaluatePrepared(prep, removedCodes, withQiThresholds, withoutQiThresholds);
}

function evaluatePrepared(
  prep: ContractPrep,
  removedCodes: Iterable<string>,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
): CloverRemovalLegScore | null {
  const removed = [...new Set([...removedCodes].map((code) => code.toUpperCase()))];
  const removedSet = new Set(removed);
  const partDQiRemoved = removalDropsPartDQi(
    prep.measures.map((row) => row.code),
    removedSet,
  );
  if (partDQiRemoved) removedSet.add("D04");
  const effective = [...removedSet];
  const caiSource = removalUsesPartCCai(removedSet) ? "part_c" : "overall";
  const caiValue = caiSource === "part_c" ? prep.partCCai : prep.overallCai;
  const withStats = subtractCodes(prep, effective);
  const qiExtra = prep.qiCodes.filter((code) => !removedSet.has(code));
  const withoutStats = subtractCodes(prep, [...effective, ...qiExtra]);
  const withQi = withStats
    ? scoreLeg(withStats, prep.contractId, withQiThresholds, caiValue, caiSource, partDQiRemoved, "with_qi")
    : null;
  const withoutQi = withoutStats
    ? scoreLeg(withoutStats, prep.contractId, withoutQiThresholds, caiValue, caiSource, partDQiRemoved, "without_qi")
    : null;
  // Same selection as official PP2 scenarios: published QI is included when
  // CMS scored it. Hold-harmless is already in the published rating.
  if (withQi) return withQi;
  return withoutQi;
}

function forEachCombination(n: number, k: number, visit: (idx: number[]) => void): void {
  if (k === 0) {
    visit([]);
    return;
  }
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    visit(idx);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i -= 1;
    if (i < 0) break;
    idx[i] += 1;
    for (let j = i + 1; j < k; j += 1) idx[j] = idx[j - 1] + 1;
  }
}

export function findContractMinRemovals(
  input: CloverContractSearchInput,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool = cloverCandidatePool(),
  maxK = MAX_CLOVER_REMOVALS,
): CloverContractSearchResult {
  const prep = prepareContract(input, pool);
  const baseline = evaluatePrepared(prep, [], withQiThresholds, withoutQiThresholds);
  const fullPool = evaluatePrepared(prep, prep.candidates, withQiThresholds, withoutQiThresholds);
  const alreadyAtFour = isFourStar(baseline);
  if (alreadyAtFour) {
    return {
      contractId: input.contractId,
      baseline,
      fullPool,
      candidates: prep.candidates,
      minK: 0,
      minSets: baseline ? [{ codes: [], score: baseline }] : [],
      reachableWithinMax: true,
      alreadyAtFour: true,
    };
  }
  const listed: CloverContractSearchResult["minSets"] = [];
  let minK: number | null = null;
  const maxSearch = Math.min(maxK, prep.candidates.length);
  for (let k = 1; k <= maxSearch; k += 1) {
    forEachCombination(prep.candidates.length, k, (idx) => {
      const codes = idx.map((i) => prep.candidates[i]);
      const score = evaluatePrepared(prep, codes, withQiThresholds, withoutQiThresholds);
      if (!isFourStar(score)) return;
      if (minK === null) minK = k;
      if (k === minK && listed.length < MAX_LISTED_MIN_SETS) {
        listed.push({ codes, score: score! });
      }
    });
    if (minK !== null) break;
  }
  listed.sort((left, right) => right.score.finalScoreRaw - left.score.finalScoreRaw);
  return {
    contractId: input.contractId,
    baseline,
    fullPool,
    candidates: prep.candidates,
    minK,
    minSets: listed,
    reachableWithinMax: minK !== null,
    alreadyAtFour: false,
  };
}

function betterLadder(
  candidate: Omit<CloverSharedLadderRow, "coversReachable">,
  current: Omit<CloverSharedLadderRow, "coversReachable"> | null,
): boolean {
  if (!current) return true;
  if (candidate.contractsAtFour !== current.contractsAtFour) {
    return candidate.contractsAtFour > current.contractsAtFour;
  }
  if (candidate.enrollmentAtFour !== current.enrollmentAtFour) {
    return candidate.enrollmentAtFour > current.enrollmentAtFour;
  }
  if (candidate.totalScore !== current.totalScore) {
    return candidate.totalScore > current.totalScore;
  }
  return candidate.codes.join(",") < current.codes.join(",");
}

export function findSharedRemovalLadder(
  inputs: CloverContractSearchInput[],
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  reachableIds: Set<string>,
  pool = cloverCandidatePool(),
  maxK = MAX_CLOVER_REMOVALS,
): CloverSharedLadderRow[] {
  const preps = inputs.map((input) => prepareContract(input, pool));
  const sharedPool = pool.filter((code) => preps.some((prep) => prep.byCode.has(code)));
  const ladder: CloverSharedLadderRow[] = [];
  const maxSearch = Math.min(maxK, sharedPool.length);
  for (let k = 0; k <= maxSearch; k += 1) {
    // A closure assignment is invisible to control-flow narrowing, so a `let`
    // updated inside forEachCombination stays `null` and then collapses to `never`.
    const bestBox: { row: Omit<CloverSharedLadderRow, "coversReachable"> | null } = { row: null };
    forEachCombination(sharedPool.length, k, (idx) => {
      const codes = idx.map((i) => sharedPool[i]);
      let contractsAtFour = 0;
      let enrollmentAtFour = 0;
      let totalScore = 0;
      const perContract = preps.map((prep) => {
        const score = evaluatePrepared(prep, codes, withQiThresholds, withoutQiThresholds);
        const atFour = isFourStar(score);
        if (atFour) {
          contractsAtFour += 1;
          enrollmentAtFour += prep.enrollment;
        }
        totalScore += score?.finalScoreRaw ?? 0;
        return { contractId: prep.contractId, atFour, score };
      });
      const row = { k, codes, contractsAtFour, enrollmentAtFour, totalScore, perContract };
      if (betterLadder(row, bestBox.row)) bestBox.row = row;
    });
    const best = bestBox.row;
    if (!best) continue;
    const atFour = new Set(best.perContract.filter((row) => row.atFour).map((row) => row.contractId));
    ladder.push({
      ...best,
      coversReachable: [...reachableIds].every((id) => atFour.has(id)),
    });
    if (ladder[ladder.length - 1].coversReachable) break;
  }
  return ladder;
}

function sortCodes(codes: string[]): string[] {
  return [...codes].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function scoreSharedCodes(
  preps: ContractPrep[],
  codes: string[],
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
): Omit<CloverSharedLadderRow, "coversReachable"> {
  let contractsAtFour = 0;
  let enrollmentAtFour = 0;
  let totalScore = 0;
  const perContract = preps.map((prep) => {
    const score = evaluatePrepared(prep, codes, withQiThresholds, withoutQiThresholds);
    const atFour = isFourStar(score);
    if (atFour) {
      contractsAtFour += 1;
      enrollmentAtFour += prep.enrollment;
    }
    totalScore += score?.finalScoreRaw ?? 0;
    return { contractId: prep.contractId, atFour, score };
  });
  return { k: codes.length, codes, contractsAtFour, enrollmentAtFour, totalScore, perContract };
}

function sharedSetCovers(
  row: { perContract: Array<{ contractId: string; atFour: boolean }> },
  reachableIds: Set<string>,
): boolean {
  const atFour = new Set(row.perContract.filter((item) => item.atFour).map((item) => item.contractId));
  return [...reachableIds].every((id) => atFour.has(id));
}

/**
 * Shortest removal set that reaches 4.0 without HEDIS.
 * HEDIS is added only when no non-HEDIS set of maxK or fewer works.
 */
export function findContractMinRemovalsSparingHedis(
  input: CloverContractSearchInput,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool: string[],
  hedisCodes: ReadonlySet<string>,
  maxK = MAX_CLOVER_REMOVALS,
): CloverContractSearchResult {
  const hedis = (code: string) => hedisCodes.has(code.toUpperCase());
  const preferred = pool.filter((code) => !hedis(code));
  const spared = findContractMinRemovals(
    input,
    withQiThresholds,
    withoutQiThresholds,
    preferred,
    maxK,
  );
  const present = new Set(
    input.measures
      .filter((measure) => measure.weight > 0 && measure.starValue > 0)
      .map((measure) => measure.code.toUpperCase()),
  );
  const candidates = pool.filter((code) => present.has(code.toUpperCase()));
  const fullPool = evaluateCloverRemoval(
    input,
    candidates,
    withQiThresholds,
    withoutQiThresholds,
    pool,
  );
  if (spared.reachableWithinMax || spared.alreadyAtFour) {
    return { ...spared, candidates, fullPool };
  }

  const prep = prepareContract(input, pool);
  const hedisPresent = candidates.filter((code) => hedis(code));
  const others = candidates.filter((code) => !hedis(code));
  const listed: CloverContractSearchResult["minSets"] = [];
  let minK: number | null = null;
  const maxH = Math.min(hedisPresent.length, maxK);
  for (let h = 1; h <= maxH && minK === null; h += 1) {
    for (let extra = 0; extra <= maxK - h && minK === null; extra += 1) {
      forEachCombination(hedisPresent.length, h, (hIdx) => {
        const hedisPick = hIdx.map((i) => hedisPresent[i]);
        forEachCombination(others.length, extra, (pIdx) => {
          const codes = sortCodes([...pIdx.map((i) => others[i]), ...hedisPick]);
          const score = evaluatePrepared(prep, codes, withQiThresholds, withoutQiThresholds);
          if (!isFourStar(score)) return;
          if (minK === null) minK = h + extra;
          if (listed.length < MAX_LISTED_MIN_SETS) listed.push({ codes, score: score! });
        });
      });
    }
  }
  listed.sort((left, right) => right.score.finalScoreRaw - left.score.finalScoreRaw);
  return {
    contractId: input.contractId,
    baseline: spared.baseline,
    fullPool,
    candidates,
    minK,
    minSets: listed,
    reachableWithinMax: minK !== null,
    alreadyAtFour: false,
  };
}

/**
 * Shared list that leaves HEDIS in place until no other list of maxK or fewer
 * measures gets every reachable contract to 4.0.
 */
export function findSharedRemovalLadderSparingHedis(
  inputs: CloverContractSearchInput[],
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  reachableIds: Set<string>,
  pool: string[],
  hedisCodes: ReadonlySet<string>,
  maxK = MAX_CLOVER_REMOVALS,
): CloverSharedLadderRow[] {
  const hedis = (code: string) => hedisCodes.has(code.toUpperCase());
  const preferred = pool.filter((code) => !hedis(code));
  const spared = findSharedRemovalLadder(
    inputs,
    withQiThresholds,
    withoutQiThresholds,
    reachableIds,
    preferred,
    maxK,
  );
  if (spared.some((row) => row.coversReachable)) return spared;

  const preps = inputs.map((input) => prepareContract(input, pool));
  const onBook = (code: string) => preps.some((prep) => prep.byCode.has(code.toUpperCase()));
  const hedisOnBook = pool.filter((code) => hedis(code) && onBook(code));
  const others = preferred.filter((code) => onBook(code));
  let winner: CloverSharedLadderRow | null = null;
  const maxH = Math.min(hedisOnBook.length, maxK);
  for (let h = 1; h <= maxH && !winner; h += 1) {
    for (let extra = 0; extra <= maxK - h && !winner; extra += 1) {
      const bestBox: { row: Omit<CloverSharedLadderRow, "coversReachable"> | null } = { row: null };
      forEachCombination(hedisOnBook.length, h, (hIdx) => {
        const hedisPick = hIdx.map((i) => hedisOnBook[i]);
        forEachCombination(others.length, extra, (pIdx) => {
          const codes = sortCodes([...pIdx.map((i) => others[i]), ...hedisPick]);
          const row = scoreSharedCodes(preps, codes, withQiThresholds, withoutQiThresholds);
          if (!sharedSetCovers(row, reachableIds)) return;
          if (betterLadder(row, bestBox.row)) bestBox.row = row;
        });
      });
      if (bestBox.row) winner = { ...bestBox.row, coversReachable: true };
    }
  }
  if (!winner) return spared;
  return [...spared, winner].sort(
    (left, right) => left.k - right.k || left.codes.join(",").localeCompare(right.codes.join(",")),
  );
}
