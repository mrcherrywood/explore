/** Unrounded Overall needed to round to a 4.0 rating. */
export const FOUR_STAR_CUTOFF = 3.75;
/** Measures at this star or lower are the "remove all low stars" scenario. */
export const LOW_STAR_MAX = 3;
/** Minimum rated measures for an Overall MA-PD rating. Matches MIN_OVERALL_MEASURE_COUNT. */
export const MIN_RATED_MEASURES = 15;

export type CloverRemovalQiDirection = "up" | "down" | "flat";

/** Net CMS improvement labels. QI can move only in this direction from the published star. */
export function qiScoreDirection(improved: number, declined: number): CloverRemovalQiDirection {
  if (improved > declined) return "up";
  if (declined > improved) return "down";
  return "flat";
}

const PART_D_QI_CODE = "D04";

/** Part D QI comes out once every other Part D measure in the set is already removed. */
export function removalDropsPartDQi(
  measureCodes: readonly string[],
  removed: ReadonlySet<string>,
): boolean {
  const partD = measureCodes
    .map((code) => code.toUpperCase())
    .filter((code) => code.startsWith("D") && code !== PART_D_QI_CODE);
  return partD.length > 0 && partD.every((code) => removed.has(code));
}

export type CloverMeasurePathRole = "removed" | "kept" | "ineligible";

/** Why a rated measure is or is not on the path to 4.0. */
export function cloverMeasurePath(input: {
  isQi: boolean;
  isPartDQi: boolean;
  isHedis?: boolean;
  star: number | null;
  inPool: boolean;
  onShared: boolean;
  onOwnMin: boolean;
  partDQiRemoved: boolean;
  alreadyAtFour: boolean;
  /** False when no removal set reaches an unrounded final of 3.75. */
  canReachFour?: boolean;
  /** Removed in the highest-score set that still leaves a rating. */
  onCeiling?: boolean;
}): { role: CloverMeasurePathRole; reason: string } {
  const canReachFour = input.canReachFour !== false;
  if (input.isPartDQi && input.partDQiRemoved) {
    return { role: "removed", reason: "Removed: Part D QI leaves with the other Part D measures" };
  }
  if (input.isQi) return { role: "ineligible", reason: "Not removed: Quality Improvement stays" };
  if (input.isHedis && (input.onShared || input.onOwnMin) && canReachFour) {
    return { role: "removed", reason: "Removed: nothing else reached 4.0" };
  }
  if (input.onCeiling && !canReachFour) {
    return { role: "removed", reason: "Removed: still short of 4.0" };
  }
  if (input.onShared && canReachFour) return { role: "removed", reason: "Removed: on the shared list" };
  if (input.onOwnMin && canReachFour) return { role: "removed", reason: "Removed: needed for this contract" };
  if (!input.inPool) return { role: "ineligible", reason: "Not removed: outside this removal set" };
  if (input.alreadyAtFour) return { role: "kept", reason: "Kept: Overall is already 4.0" };
  if (input.isHedis && canReachFour) return { role: "kept", reason: "Kept: HEDIS is only removed when nothing else works" };
  if ((input.star ?? 0) >= 4) return { role: "kept", reason: "Kept: removing it would lower the score" };
  if (!canReachFour) return { role: "kept", reason: "Kept: removing it would leave too few measures" };
  return { role: "kept", reason: "Kept: not needed to reach 4.0" };
}

/** Kept-measure reason once the one-measure rescore is known. Only for contracts that stay short of 4.0. */
export function keptReasonWhenShort(input: {
  star: number | null;
  ifRemoved: "unrated" | "lower" | "other";
}): string {
  if (input.ifRemoved === "unrated") return "Kept: removing it would leave too few measures";
  if (input.ifRemoved === "lower" || (input.star ?? 0) >= 4) return "Kept: removing it would lower the score";
  return "Kept: still short of 4.0";
}

export function qiStarSupported(
  direction: CloverRemovalQiDirection,
  publishedStars: number[],
  qiStar: number,
): boolean {
  if (publishedStars.length === 0) return true;
  const floor = Math.min(...publishedStars);
  const ceiling = Math.max(...publishedStars);
  if (direction === "up") return qiStar >= floor;
  if (direction === "down") return qiStar <= ceiling;
  return publishedStars.includes(qiStar);
}
