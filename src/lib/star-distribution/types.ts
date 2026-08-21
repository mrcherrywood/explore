export const STAR_DISTRIBUTION_YEARS = [2023, 2024, 2025, 2026] as const;
export const LAST3_YEARS = [2024, 2025, 2026] as const;
export const RECENCY_WEIGHTS: Record<number, number> = { 2024: 1, 2025: 2, 2026: 3 };

export type RosterMode = "combined" | "forecast" | "pp1";
export type PeriodKey = "all" | "last3" | "last3W" | "2023" | "2024" | "2025" | "2026";
export type MetricMode = "stars" | "scores";

export type StarCounts = [number, number, number, number, number];

export type StarShare = {
  n: number;
  mean: number;
  /** Share of rated contracts at 1★ through 5★. */
  pct: StarCounts;
  fourPlus: number;
  counts: StarCounts;
};

export type ComparisonSlice = {
  cms: StarShare;
  book: StarShare;
  meanDelta: number;
  fourStarDelta: number;
  fourPlusDelta: number;
};

export type ScoreShare = {
  n: number;
  mean: number;
};

export type ScoreSlice = {
  cms: ScoreShare;
  book: ScoreShare;
  meanDelta: number;
};

export type MeasureYearSlice = ComparisonSlice & {
  year: number;
  code: string;
  score: ScoreSlice;
};

export type MeasureDistribution = {
  name: string;
  normalizedName: string;
  inverted: boolean;
  years: MeasureYearSlice[];
  all: ComparisonSlice;
  last3: ComparisonSlice;
  last3W: ComparisonSlice;
  allScore: ScoreSlice;
  last3Score: ScoreSlice;
  last3WScore: ScoreSlice;
};

export type BookRosterInventory = {
  forecast: number;
  pp1: number;
  combined: number;
  both: number;
};

export type BookRosterOrg = {
  name: string;
  contractCount: number;
  forecast: number;
  pp1: number;
  both: number;
  contracts: string[];
};

export type BookRosterSources = {
  forecast: Set<string>;
  pp1: Set<string>;
  /** Parent orgs from PP1 uploads or ma_contracts, used when Stars files have no row. */
  parentById?: Map<string, string>;
};

export type StarDistributionResponse = {
  roster: RosterMode;
  inventory: BookRosterInventory;
  years: number[];
  orgs: BookRosterOrg[];
  pooled: {
    all: ComparisonSlice;
    last3: ComparisonSlice;
    last3W: ComparisonSlice;
    byYear: Array<ComparisonSlice & { year: number }>;
  };
  measures: MeasureDistribution[];
};
