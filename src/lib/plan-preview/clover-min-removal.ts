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
  LOW_STAR_MAX,
  MIN_RATED_MEASURES,
  removalDropsPartDQi,
} from "./clover-removal-constants";

export { FOUR_STAR_CUTOFF, LOW_STAR_MAX, MIN_RATED_MEASURES };

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
  /** Every helpful measure that can be removed while a rating remains. */
  ceilingCodes: string[];
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

/** Stars 2026 recalc removals plus the Clover-20 set, minus D02/D03 twins and QI. */
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

/** Overall after one more kept measure is removed. "unrated" when Part C, Part D, or 15 measures would not remain. */
export function evaluateKeptRemoval(
  input: CloverContractSearchInput,
  removedCodes: readonly string[],
  code: string,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool: readonly string[] = cloverCandidatePool(),
): { finalScoreRaw: number } | "unrated" {
  const prep = prepareContract(input, [...pool]);
  const upper = code.toUpperCase();
  if (!prep.byCode.has(upper)) return "unrated";
  const next = [...removedCodes, upper];
  if (!removalKeepsRating(prep, next)) return "unrated";
  const score = evaluatePrepared(prep, next, withQiThresholds, withoutQiThresholds);
  if (!score || score.measureCount < MIN_RATED_MEASURES) return "unrated";
  return { finalScoreRaw: score.finalScoreRaw };
}

export function evaluateCloverRemoval(
  input: CloverContractSearchInput,
  removedCodes: Iterable<string>,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool = cloverCandidatePool(),
): CloverRemovalLegScore | null {
  const prep = prepareContract(input, pool);
  return evaluatePrepared(prep, removedCodes, withQiThresholds, withoutQiThresholds, "published");
}

/** Drop Part C and Part D Quality Improvement and score with the without-QI thresholds. */
export function evaluateWithoutQi(
  input: CloverContractSearchInput,
  removedCodes: Iterable<string>,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool = cloverCandidatePool(),
): CloverRemovalLegScore | null {
  const prep = prepareContract(input, pool);
  return evaluatePrepared(prep, removedCodes, withQiThresholds, withoutQiThresholds, "without_qi");
}

export type BetterOfUse = {
  code: string;
  currentStar: number;
  priorStar: number;
};

/** Use last year's star when it is higher. Measures with no last-year star stay as they are. */
export function applyBetterOfStars(
  measures: readonly ContractMeasure[],
  priorStarByCode: ReadonlyMap<string, number>,
): { measures: ContractMeasure[]; usedPrior: BetterOfUse[] } {
  const usedPrior: BetterOfUse[] = [];
  const next = measures.map((measure) => {
    const code = measure.code.toUpperCase();
    const prior = priorStarByCode.get(code);
    if (prior == null || !(prior > measure.starValue)) return measure;
    usedPrior.push({ code, currentStar: measure.starValue, priorStar: prior });
    return { ...measure, code, starValue: prior };
  });
  return { measures: next, usedPrior };
}

function evaluatePrepared(
  prep: ContractPrep,
  removedCodes: Iterable<string>,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  leg: "published" | "without_qi" = "published",
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
  if (leg === "without_qi") return withoutQi;
  // Same selection as official PP2 scenarios: published QI is included when
  // CMS scored it. Hold-harmless is already in the published rating.
  if (withQi) return withQi;
  return withoutQi;
}

/** Lower rank is removed first. Eligible measures, then other domains, HEDIS last. */
export type RemovalPriority = (code: string) => number;

const DOMAIN_REMOVAL_ORDER = ["Operations", "Pharmacy", "CAHPS", "HOS"];

export function removalPriority(options: {
  eligible: ReadonlySet<string>;
  hedis: ReadonlySet<string>;
  domainByCode?: ReadonlyMap<string, string>;
}): RemovalPriority {
  const eligible = new Set([...options.eligible].map((code) => code.toUpperCase()));
  const hedis = new Set([...options.hedis].map((code) => code.toUpperCase()));
  return (code: string) => {
    const upper = code.toUpperCase();
    if (hedis.has(upper) || isHedisDomain(options.domainByCode?.get(upper))) return 1000;
    if (eligible.has(upper)) return 0;
    const domain = (options.domainByCode?.get(upper) ?? "").trim().toLowerCase();
    const index = DOMAIN_REMOVAL_ORDER.findIndex((name) => name.toLowerCase() === domain);
    return index === -1 ? 500 : index + 1;
  };
}

function caiBounds(prep: ContractPrep): { low: number; high: number } {
  const values = [prep.overallCai, prep.partCCai].filter((value): value is number => value != null);
  if (values.length === 0) return { low: 0, high: 0 };
  return { low: Math.min(...values), high: Math.max(...values) };
}

/** Mean a removal must clear so final can still reach 4.0 after the less favorable CAI. */
function removalTargetMean(prep: ContractPrep): number {
  return FOUR_STAR_CUTOFF - caiBounds(prep).low;
}

/** A removal still produces an Overall only when Part C, Part D, and 15 measures remain. */
function removalKeepsRating(prep: ContractPrep, removedCodes: Iterable<string>): boolean {
  const removed = new Set([...removedCodes].map((code) => code.toUpperCase()));
  if (removalDropsPartDQi(prep.measures.map((row) => row.code), removed)) removed.add("D04");
  let n = 0;
  let partC = false;
  let partD = false;
  for (const row of prep.measures) {
    if (removed.has(row.code)) continue;
    n += 1;
    if (row.code.startsWith("D")) partD = true;
    else partC = true;
  }
  return n >= MIN_RATED_MEASURES && partC && partD;
}

/** Measures below the 4.0 line, eligible set first, then other domains, HEDIS last. */
function removalOrder(prep: ContractPrep, priority?: RemovalPriority): MeasureSums[] {
  const target = removalTargetMean(prep);
  const rank = priority ?? (() => 0);
  return prep.candidates
    .map((code) => prep.byCode.get(code))
    .filter((row): row is MeasureSums => row != null && row.star < target)
    .sort((left, right) => {
      const tier = rank(left.code) - rank(right.code);
      if (tier !== 0) return tier;
      const gain = right.weight * (target - right.star) - left.weight * (target - left.star);
      if (gain !== 0) return gain;
      return left.code.localeCompare(right.code, undefined, { numeric: true });
    });
}

function walkRemovals(
  prep: ContractPrep,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  priority?: RemovalPriority,
  leg: "published" | "without_qi" = "published",
): Array<{ codes: string[]; score: CloverRemovalLegScore }> {
  const chosen: string[] = [];
  const steps: Array<{ codes: string[]; score: CloverRemovalLegScore }> = [];
  for (const row of removalOrder(prep, priority)) {
    const trial = [...chosen, row.code];
    if (!removalKeepsRating(prep, trial)) continue;
    const score = evaluatePrepared(prep, trial, withQiThresholds, withoutQiThresholds, leg);
    if (!score || score.measureCount < MIN_RATED_MEASURES) continue;
    chosen.push(row.code);
    steps.push({ codes: [...chosen], score });
  }
  return steps;
}

/** Highest score from removing every below-4.0 measure in the pool that a rating can still spare. */
export function bestCaseRemoval(
  input: CloverContractSearchInput,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool: readonly string[] = cloverCandidatePool(),
  leg: "published" | "without_qi" = "without_qi",
): { codes: string[]; score: CloverRemovalLegScore | null } {
  const prep = prepareContract(input, [...pool]);
  const steps = walkRemovals(prep, withQiThresholds, withoutQiThresholds, undefined, leg);
  const last = steps[steps.length - 1];
  if (last) return { codes: last.codes, score: last.score };
  return {
    codes: [],
    score: evaluatePrepared(prep, [], withQiThresholds, withoutQiThresholds, leg),
  };
}

export type LowStarRemoval = {
  codes: string[];
  availableCount: number;
  removedAll: boolean;
  score: CloverRemovalLegScore | null;
};

/** Remove every 3★ or lower measure. If that would drop the rating, keep the highest score that still leaves one. */
export function evaluateAllLowStarRemoval(
  input: CloverContractSearchInput,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool: readonly string[] = cloverCandidatePool(),
  priority?: RemovalPriority,
): LowStarRemoval {
  const prep = prepareContract(input, [...pool]);
  const rank = priority ?? (() => 0);
  const ordered = prep.candidates
    .map((code) => prep.byCode.get(code))
    .filter((row): row is MeasureSums => row != null && !row.isQi && row.star <= LOW_STAR_MAX)
    .sort((left, right) => {
      const tier = rank(left.code) - rank(right.code);
      if (tier !== 0) return tier;
      const gain = right.weight * (LOW_STAR_MAX - right.star) - left.weight * (LOW_STAR_MAX - left.star);
      if (gain !== 0) return gain;
      return left.code.localeCompare(right.code, undefined, { numeric: true });
    });
  const baseline = evaluatePrepared(prep, [], withQiThresholds, withoutQiThresholds);
  if (ordered.length === 0) {
    return { codes: [], availableCount: 0, removedAll: true, score: baseline };
  }
  const allCodes = ordered.map((row) => row.code);
  if (removalKeepsRating(prep, allCodes)) {
    return {
      codes: allCodes,
      availableCount: ordered.length,
      removedAll: true,
      score: evaluatePrepared(prep, allCodes, withQiThresholds, withoutQiThresholds),
    };
  }
  const chosen: string[] = [];
  let score = baseline;
  for (const row of ordered) {
    const trial = [...chosen, row.code];
    if (!removalKeepsRating(prep, trial)) continue;
    const next = evaluatePrepared(prep, trial, withQiThresholds, withoutQiThresholds);
    if (!next || next.measureCount < MIN_RATED_MEASURES) continue;
    chosen.push(row.code);
    score = next;
  }
  return { codes: chosen, availableCount: ordered.length, removedAll: false, score };
}

function scoreShared(
  preps: ContractPrep[],
  codes: string[],
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
): CloverSharedLadderRow {
  let contractsAtFour = 0;
  let enrollmentAtFour = 0;
  let totalScore = 0;
  const perContract = preps.map((prep) => {
    const score = evaluatePrepared(prep, codes, withQiThresholds, withoutQiThresholds);
    const atFour = isFourStar(score) && (score?.measureCount ?? 0) >= MIN_RATED_MEASURES;
    if (atFour) {
      contractsAtFour += 1;
      enrollmentAtFour += prep.enrollment;
    }
    totalScore += score?.finalScoreRaw ?? 0;
    return { contractId: prep.contractId, atFour, score };
  });
  return {
    k: codes.length,
    codes,
    contractsAtFour,
    enrollmentAtFour,
    totalScore,
    coversReachable: false,
    perContract,
  };
}

export function findContractMinRemovals(
  input: CloverContractSearchInput,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool = cloverCandidatePool(),
  priority?: RemovalPriority,
): CloverContractSearchResult {
  const prep = prepareContract(input, pool);
  const baseline = evaluatePrepared(prep, [], withQiThresholds, withoutQiThresholds);
  const steps = walkRemovals(prep, withQiThresholds, withoutQiThresholds, priority);
  const ceiling = steps.length > 0 ? steps[steps.length - 1].score : baseline;
  const ceilingCodes = steps.length > 0 ? steps[steps.length - 1].codes : [];
  const alreadyAtFour = isFourStar(baseline);
  if (alreadyAtFour) {
    return {
      contractId: input.contractId,
      baseline,
      fullPool: ceiling,
      ceilingCodes,
      candidates: prep.candidates,
      minK: 0,
      minSets: baseline ? [{ codes: [], score: baseline }] : [],
      reachableWithinMax: true,
      alreadyAtFour: true,
    };
  }
  const hit = steps.find((step) => isFourStar(step.score));
  return {
    contractId: input.contractId,
    baseline,
    fullPool: ceiling,
    ceilingCodes,
    candidates: prep.candidates,
    minK: hit ? hit.codes.length : null,
    minSets: hit ? [hit] : [],
    reachableWithinMax: hit != null,
    alreadyAtFour: false,
  };
}

export function findSharedRemovalLadder(
  inputs: CloverContractSearchInput[],
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  reachableIds: Set<string>,
  pool = cloverCandidatePool(),
  priority?: RemovalPriority,
): CloverSharedLadderRow[] {
  const preps = inputs.map((input) => prepareContract(input, pool));
  const rank = priority ?? (() => 0);
  const stillShort = preps.filter((prep) => {
    if (!reachableIds.has(prep.contractId)) return false;
    const baseline = evaluatePrepared(prep, [], withQiThresholds, withoutQiThresholds);
    return !isFourStar(baseline);
  });
  if (stillShort.length === 0) {
    const row = scoreShared(preps, [], withQiThresholds, withoutQiThresholds);
    const atFour = new Set(row.perContract.filter((item) => item.atFour).map((item) => item.contractId));
    return [{ ...row, coversReachable: [...reachableIds].every((id) => atFour.has(id)) }];
  }

  const benefit = (code: string) => {
    let total = 0;
    for (const prep of stillShort) {
      const row = prep.byCode.get(code);
      if (!row) continue;
      const gain = row.weight * (removalTargetMean(prep) - row.star);
      if (gain > 0) total += gain;
    }
    return total;
  };
  const codes = [...new Set(stillShort.flatMap((prep) => removalOrder(prep, priority).map((row) => row.code)))];
  codes.sort(
    (left, right) => rank(left) - rank(right) || benefit(right) - benefit(left) || left.localeCompare(right, undefined, { numeric: true }),
  );

  const chosen: string[] = [];
  const protectedIds = new Set(
    preps
      .filter((prep) => isFourStar(evaluatePrepared(prep, [], withQiThresholds, withoutQiThresholds)))
      .map((prep) => prep.contractId),
  );
  const ladder: CloverSharedLadderRow[] = [];
  for (const code of codes) {
    const trial = [...chosen, code];
    if (preps.some((prep) => !removalKeepsRating(prep, trial))) continue;
    const row = scoreShared(preps, trial, withQiThresholds, withoutQiThresholds);
    const atFour = new Set(row.perContract.filter((item) => item.atFour).map((item) => item.contractId));
    if ([...protectedIds].some((id) => !atFour.has(id))) continue;
    chosen.push(code);
    for (const id of atFour) protectedIds.add(id);
    const coversReachable = [...reachableIds].every((id) => atFour.has(id));
    ladder.push({ ...row, coversReachable });
    if (coversReachable) break;
  }
  return ladder;
}

/** Non-HEDIS measures come off first. HEDIS is used only after those still leave the contract short of 4.0. */
export function findContractMinRemovalsSparingHedis(
  input: CloverContractSearchInput,
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  pool: string[],
  hedisCodes: ReadonlySet<string>,
): CloverContractSearchResult {
  const hedis = new Set([...hedisCodes].map((code) => code.toUpperCase()));
  return findContractMinRemovals(
    input,
    withQiThresholds,
    withoutQiThresholds,
    pool,
    (code) => (hedis.has(code.toUpperCase()) ? 1 : 0),
  );
}

/** Shared list that leaves HEDIS in place until earlier measures cannot get every reachable contract to 4.0. */
export function findSharedRemovalLadderSparingHedis(
  inputs: CloverContractSearchInput[],
  withQiThresholds: PercentileThresholds,
  withoutQiThresholds: PercentileThresholds,
  reachableIds: Set<string>,
  pool: string[],
  hedisCodes: ReadonlySet<string>,
): CloverSharedLadderRow[] {
  const hedis = new Set([...hedisCodes].map((code) => code.toUpperCase()));
  return findSharedRemovalLadder(
    inputs,
    withQiThresholds,
    withoutQiThresholds,
    reachableIds,
    pool,
    (code) => (hedis.has(code.toUpperCase()) ? 1 : 0),
  );
}

