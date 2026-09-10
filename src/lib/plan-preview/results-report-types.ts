import type { CloverComputedScenarioId } from "@/lib/clover-impact/scenarios";
import type { PercentileThresholds } from "@/lib/reward-factor/types";

import type { OfficialStarRow, OfficialSummaryRow } from "./official-row-types";

export type ResultsScenarioId =
  | "baseline"
  | CloverComputedScenarioId
  | "removal2028"
  | "removal2029";

export type ResultsOfficialSummary = OfficialSummaryRow;

export type ResultsMeasure = OfficialStarRow & {
  domain: string | null;
  weight: number;
  publishedBaselineStar: number | null;
  publishedBaselineScore: number | null;
  pp1Score: number | null;
  pp1PredictedStar: number | null;
  pp1UpsideStar: number | null;
  inverted?: boolean;
};

export type ResultsDomain = {
  domain: string;
  part: "Part C" | "Part D" | "Mixed";
  measureCount: number;
  ratedMeasureCount: number;
  officialMean: number | null;
  baselineMean: number | null;
};

export type ResultsRewardFactorThresholds = PercentileThresholds & {
  improvementIncluded: boolean;
  newMeasuresIncluded: boolean;
};

export type ResultsPp1PublishedScore = {
  measureCount: number;
  baseMean: number;
  weightedVariance: number;
  rewardFactor: number;
  caiValue: number | null;
  finalScoreRaw: number;
  finalRating: number;
};

export type ResultsAccuracyRow = {
  measureCode: string;
  displayName: string;
  predictedStar: number | null;
  officialStar: number | null;
  delta: number | null;
  inUpsideEnvelope: boolean | null;
};

export type ResultsForecastOfficialQiMeasure = {
  measureCode: string;
  star: number;
};

export type ResultsForecastOfficialScore = {
  measureCount: number;
  qiIncluded: boolean;
  qiMeasures: ResultsForecastOfficialQiMeasure[];
  withoutQi: {
    measureCount: number;
    baseMean: number;
    finalScoreRaw: number;
    finalRating: number;
  } | null;
  baseMean: number;
  weightedVariance: number;
  rewardFactor: number;
  caiValue: number;
  finalScoreRaw: number;
  finalRating: number;
};

export type ResultsHistoryPoint = {
  year: number;
  overall: number | null;
  partC: number | null;
  partD: number | null;
};

export type ResultsYoySummary = {
  declined: number;
  held: number;
  improved: number;
  newOrUnrated: number;
};

export type ResultsRiskOpportunityKind = "risk" | "opportunity";

export type ResultsRiskOpportunityRow = {
  measureCode: string;
  displayName: string;
  officialStar: number;
  score: number;
  inverted: boolean;
  kind: ResultsRiskOpportunityKind;
  cut: number;
  gap: number;
  weight: number;
};

export type ResultsBookCompareRow = {
  measureCode: string;
  measureDisplayName: string;
  weight: number;
  inverted: boolean;
  contractScore: number;
  bookMean: number;
  bookContracts: number;
  delta: number;
  advantage: number;
};

export type ResultsBookCompare = {
  bookContractCount: number;
  leads: number;
  trails: number;
  even: number;
  rows: ResultsBookCompareRow[];
};

export type ResultsScenarioScoreLeg = {
  measureCount: number;
  baseMean: number;
  weightedVariance: number;
  rewardFactor: number;
  meanCategory: string;
  varianceCategory: string;
  finalScoreRaw: number;
};

export type ResultsScenarioScore = {
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  caiValue: number | null;
  withQi: ResultsScenarioScoreLeg | null;
  withoutQi: ResultsScenarioScoreLeg | null;
  selectedLeg: "with_qi" | "without_qi" | null;
  finalScoreRaw: number | null;
  finalRating: number | null;
  partCFinalRating: number | null;
  partDFinalRating: number | null;
  qualifiesOverall: boolean;
  reason: string | null;
};

export type ResultsScenario = {
  id: ResultsScenarioId;
  label: string;
  description: string;
  caiSource: "overall" | "part_c";
  removedContractCodes: string[];
  score: ResultsScenarioScore | null;
  thresholds: {
    withQi: PercentileThresholds | null;
    withoutQi: PercentileThresholds | null;
  };
  notes: string[];
};

export type PlanPreviewResultsReport = {
  starsYear: number;
  baselineYear: number | null;
  generatedAt: string;
  contract: {
    contractId: string;
    contractName: string | null;
    parentOrganization: string | null;
  };
  overall: ResultsOfficialSummary | null;
  partC: ResultsOfficialSummary | null;
  partD: ResultsOfficialSummary | null;
  rewardFactorThresholds: ResultsRewardFactorThresholds | null;
  measures: ResultsMeasure[];
  domains: ResultsDomain[];
  history: ResultsHistoryPoint[];
  yoySummary: ResultsYoySummary;
  accuracy: ResultsAccuracyRow[];
  accuracySummary: {
    compared: number;
    exact: number;
    withinOne: number;
    overallPredicted: number | null;
    overallOfficial: number | null;
    overallInEnvelope: boolean | null;
    pp1Published: ResultsPp1PublishedScore | null;
    predictedBuildup: ResultsForecastOfficialScore | null;
  };
  risk: ResultsRiskOpportunityRow[];
  opportunity: ResultsRiskOpportunityRow[];
  bookCompare: ResultsBookCompare;
  scenarios: ResultsScenario[];
};
