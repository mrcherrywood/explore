import { RECENCY_WEIGHTS } from "./types";
import type {
  ComparisonSlice,
  MeasureDistribution,
  MetricMode,
  PeriodKey,
  ScoreShare,
  ScoreSlice,
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

const EMPTY_SCORE_SHARE: ScoreShare = { n: 0, mean: 0 };

export function emptyScoreSlice(): ScoreSlice {
  return { cms: EMPTY_SCORE_SHARE, book: EMPTY_SCORE_SHARE, meanDelta: 0 };
}

export function shareFromScores(scores: number[]): ScoreShare {
  if (scores.length === 0) return EMPTY_SCORE_SHARE;
  const mean =
    scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return { n: scores.length, mean: Number(mean.toFixed(2)) };
}

export function compareScores(cms: ScoreShare, book: ScoreShare): ScoreSlice {
  const meanDelta =
    book.n === 0 || cms.n === 0
      ? 0
      : Number((book.mean - cms.mean).toFixed(2));
  return { cms, book, meanDelta };
}

type WeightedScoreYear = { year: number; share: ScoreShare };

export function poolScoreShares(
  years: WeightedScoreYear[],
  weights?: Record<number, number>
): ScoreShare {
  let n = 0;
  let total = 0;
  for (const row of years) {
    if (row.share.n === 0) continue;
    const weight = weights?.[row.year] ?? 1;
    const weightedN = row.share.n * weight;
    n += weightedN;
    total += row.share.mean * weightedN;
  }
  if (n === 0) return EMPTY_SCORE_SHARE;
  return { n, mean: Number((total / n).toFixed(2)) };
}

export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

export function formatScoreDelta(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatScore(value)}`;
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

export function periodCaption(period: PeriodKey, metric: MetricMode = "stars"): string {
  const scores = metric === "scores";
  if (period === "all") {
    return scores
      ? "Stars 2023–2026, unweighted measure scores"
      : "Stars 2023–2026, unweighted contract-measure observations";
  }
  if (period === "last3") {
    return scores ? "Stars 2024–2026, unweighted scores" : "Stars 2024–2026, unweighted";
  }
  if (period === "last3W") {
    return scores
      ? "Stars 2024–2026, recency-weighted scores (2024=1x, 2025=2x, 2026=3x)"
      : "Stars 2024–2026, recency-weighted (2024=1x, 2025=2x, 2026=3x)";
  }
  return scores
    ? `Stars ${period} published measure scores`
    : `Stars ${period} published measure ratings`;
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

export function scoreSliceForPeriod(
  measure: MeasureDistribution,
  period: PeriodKey
): ScoreSlice {
  if (period === "all") return measure.allScore;
  if (period === "last3") return measure.last3Score;
  if (period === "last3W") return measure.last3WScore;
  return (
    measure.years.find((row) => String(row.year) === period)?.score ??
    measure.last3WScore
  );
}

/** 4★/5★: higher book share is better. 1★/2★: higher book share is worse. 3★ is mixed. */
export function starShareBetter(starIndex: number, deltaPp: number): number {
  if (starIndex >= 3) return deltaPp;
  if (starIndex <= 1) return -deltaPp;
  return 0;
}

export function scoreDeltaBetter(delta: number, inverted: boolean): number {
  if (delta === 0) return 0;
  return (inverted ? delta < 0 : delta > 0) ? 1 : -1;
}

export function fepDeltaClass(better: number): string {
  if (better > 0) return "fep-delta-pos";
  if (better < 0) return "fep-delta-neg";
  return "";
}
