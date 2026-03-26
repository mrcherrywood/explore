import type { PercentileMethod } from "@/lib/percentile-analysis/workbook-types";

export type MeasureStarRating = 1 | 2 | 3 | 4 | 5;

export type MeasureCutPoint = {
  hlCode: string;
  measureName: string;
  domain: string | null;
  year: number;
  weight: number | null;
  thresholds: {
    oneStarUpperBound: number | null;
    twoStar: number;
    threeStar: number;
    fourStar: number;
    fiveStar: number;
  };
};

export type MeasureObservation = {
  year: number;
  contractId: string;
  contractName: string;
  orgName: string;
  measureCode: string;
  measureName: string;
  score: number;
  percentile: number;
  starRating: MeasureStarRating;
  inverted: boolean;
  yearWeight: number;
};

export type MeasureYearMetadata = {
  year: number;
  measureName: string;
  measureCode: string | null;
  hlCode: string | null;
  domain: string | null;
  weight: number | null;
  inverted: boolean;
  thresholds: {
    twoStar: number;
    threeStar: number;
    fourStar: number;
    fiveStar: number;
  };
  observationCount: number;
};

export type MeasureLikelihoodDistribution = {
  oneStar: number;
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
  fourPlus: number;
  fiveOnly: number;
};

export type MeasureLikelihoodPoint = {
  percentile: number;
  sampleSize: number;
  windowStart: number;
  windowEnd: number;
  distribution: MeasureLikelihoodDistribution;
};

export type MeasureLikelihoodSeries = {
  key: string;
  label: string;
  years: number[];
  observationCount: number;
  curve: MeasureLikelihoodPoint[];
  lookup: MeasureLikelihoodPoint;
};

export type MeasureLikelihoodResponse = {
  status: "ready" | "missing_inputs" | "error";
  method: PercentileMethod;
  selectedMeasure: string;
  selectedPercentile: number;
  availableMeasures: string[];
  metadataByYear: MeasureYearMetadata[];
  series: MeasureLikelihoodSeries[];
  assumptions: string[];
  error?: string;
};

export type MeasureLikelihoodTableCell = {
  percentile: number;
  likelihood: number;
  sampleSize: number;
  windowStart: number;
  windowEnd: number;
};

export type MeasureLikelihoodTableRow = {
  measureName: string;
  domain: string | null;
  weight: number | null;
  inverted: boolean;
  cells: MeasureLikelihoodTableCell[];
};

export type MeasureLikelihoodTableView = {
  key: string;
  label: string;
  years: number[];
  rows: MeasureLikelihoodTableRow[];
};

export type MeasureLikelihoodTableResponse = {
  status: "ready" | "missing_inputs" | "error";
  method: PercentileMethod;
  targetStar: MeasureStarRating;
  availableMeasures: string[];
  percentileColumns: number[];
  views: MeasureLikelihoodTableView[];
  assumptions: string[];
  error?: string;
};

export type MeasureSelectableStar = 2 | 3 | 4 | 5;

export type MeasureStarPercentileYearResult = {
  year: number;
  star: MeasureSelectableStar;
  cutPointScore: number;
  percentileEquivalent: number | null;
  sampleSize: number;
};

export type MeasureStarPercentileResponse = {
  status: "ready" | "missing_inputs" | "error";
  method: PercentileMethod;
  selectedMeasure: string;
  selectedStar: MeasureSelectableStar;
  availableMeasures: string[];
  yearlyResults: MeasureStarPercentileYearResult[];
  historicalSummary: {
    weightedAveragePercentile: number | null;
    minPercentile: number | null;
    maxPercentile: number | null;
    totalSampleSize: number;
  } | null;
  year2026Result: MeasureStarPercentileYearResult | null;
  assumptions: string[];
  error?: string;
};
