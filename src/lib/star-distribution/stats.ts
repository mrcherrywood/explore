import { RECENCY_WEIGHTS } from "./types";
import type {
  ComparisonSlice,
  MeasureDistribution,
  PeriodKey,
  StarCounts,
  StarDistributionResponse,
  StarShare,
} from "./types";

const EMPTY_COUNTS: StarCounts = [0, 0, 0, 0, 0];

const EMPTY_SHARE: StarShare = {
  n: 0,
  mean: 0,
  pct: [0, 0, 0, 0, 0],
  fourPlus: 0,
  counts: EMPTY_COUNTS,
};

export function emptyShare(): StarShare {
  return EMPTY_SHARE;
}

export function shareFromStars(stars: number[]): StarShare {
  const counts: StarCounts = [0, 0, 0, 0, 0];
  for (const star of stars) {
    if (!Number.isInteger(star) || star < 1 || star > 5) continue;
    counts[star - 1] += 1;
  }
  return shareFromCounts(counts);
}

export function shareFromCounts(counts: StarCounts): StarShare {
  const n = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
  if (n === 0) return EMPTY_SHARE;
  const mean = Number(
    (
      (counts[0] * 1 +
        counts[1] * 2 +
        counts[2] * 3 +
        counts[3] * 4 +
        counts[4] * 5) /
      n
    ).toFixed(2)
  );
  const pct = counts.map((count) =>
    Number(((count / n) * 100).toFixed(1))
  ) as StarCounts;
  return {
    n,
    mean,
    pct,
    fourPlus: Number((((counts[3] + counts[4]) / n) * 100).toFixed(1)),
    counts,
  };
}

export function compareShares(cms: StarShare, book: StarShare): ComparisonSlice {
  return {
    cms,
    book,
    meanDelta: Number((book.mean - cms.mean).toFixed(2)),
    fourStarDelta: Number((book.pct[3] - cms.pct[3]).toFixed(1)),
    fourPlusDelta: Number((book.fourPlus - cms.fourPlus).toFixed(1)),
  };
}

type WeightedYear = { year: number; share: StarShare };

export function poolShares(
  years: WeightedYear[],
  weights?: Record<number, number>
): StarShare {
  const counts: StarCounts = [0, 0, 0, 0, 0];
  for (const row of years) {
    const weight = weights?.[row.year] ?? 1;
    for (let i = 0; i < 5; i += 1) {
      counts[i] += row.share.counts[i] * weight;
    }
  }
  return shareFromCounts(counts);
}

export function recencyWeights(): Record<number, number> {
  return RECENCY_WEIGHTS;
}

export function compareMeasuresPartThenName(
  left: { name: string; normalizedName: string },
  right: { name: string; normalizedName: string }
): number {
  const leftPart = left.normalizedName.endsWith(" partd") ? 1 : 0;
  const rightPart = right.normalizedName.endsWith(" partd") ? 1 : 0;
  if (leftPart !== rightPart) return leftPart - rightPart;
  return left.name.localeCompare(right.name);
}

export function periodCaption(period: PeriodKey): string {
  if (period === "all") return "Stars 2023–2026, unweighted contract-measure observations";
  if (period === "last3") return "Stars 2024–2026, unweighted";
  if (period === "last3W") {
    return "Stars 2024–2026, recency-weighted (2024=1x, 2025=2x, 2026=3x)";
  }
  return `Stars ${period} published measure ratings`;
}

export function sliceForPeriod(
  data: StarDistributionResponse,
  period: PeriodKey,
  measure: MeasureDistribution | null
): ComparisonSlice {
  if (measure) {
    if (period === "all") return measure.all;
    if (period === "last3") return measure.last3;
    if (period === "last3W") return measure.last3W;
    return (
      measure.years.find((row) => String(row.year) === period) ?? measure.last3W
    );
  }
  if (period === "all") return data.pooled.all;
  if (period === "last3") return data.pooled.last3;
  if (period === "last3W") return data.pooled.last3W;
  return (
    data.pooled.byYear.find((row) => String(row.year) === period) ?? data.pooled.last3W
  );
}
