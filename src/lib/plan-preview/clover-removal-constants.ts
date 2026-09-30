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
