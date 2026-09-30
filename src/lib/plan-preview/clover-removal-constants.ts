/** Unrounded Overall needed to round to a 4.0 rating. */
export const FOUR_STAR_CUTOFF = 3.75;
export const MAX_CLOVER_REMOVALS = 8;
export const MAX_LISTED_MIN_SETS = 10;

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
  star: number | null;
  inPool: boolean;
  onShared: boolean;
  onOwnMin: boolean;
  partDQiRemoved: boolean;
  alreadyAtFour: boolean;
}): { role: CloverMeasurePathRole; reason: string } {
  if (input.isPartDQi && input.partDQiRemoved) {
    return { role: "removed", reason: "Removed with Part D" };
  }
  if (input.isQi) return { role: "ineligible", reason: "Quality Improvement" };
  if (input.onShared) return { role: "removed", reason: "Shared list" };
  if (input.onOwnMin) return { role: "removed", reason: "Own minimum" };
  if (!input.inPool) return { role: "ineligible", reason: "Outside the pool" };
  if (input.alreadyAtFour) return { role: "kept", reason: "Already at 4.0" };
  if ((input.star ?? 0) >= 4) return { role: "kept", reason: "High star" };
  return { role: "kept", reason: "Not needed" };
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
