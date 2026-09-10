import type {
  PlanPreviewOfficialRatingType,
  PlanPreviewOfficialStarStatus,
} from "./types";

export type OfficialStarRow = {
  contractId: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  parentOrganization: string | null;
  measureCode: string;
  measureDisplayName: string;
  measureNormalized: string;
  metricCategory: string;
  star: number | null;
  status: PlanPreviewOfficialStarStatus;
  qiSignificance: string | null;
};

export type OfficialSummaryRow = {
  contractId: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  parentOrganization: string | null;
  ratingType: PlanPreviewOfficialRatingType;
  contractType: string | null;
  snpPlans: string | null;
  disasterYear1: number | null;
  disasterPct1: number | null;
  disasterYear2: number | null;
  disasterPct2: number | null;
  measuresRequired: string | null;
  measuresMissing: number | null;
  measuresRated: number | null;
  calculatedMean: number | null;
  calculatedVariance: number | null;
  scorePercentileRank: number | null;
  variancePercentileRank: number | null;
  varianceCategory: string | null;
  rewardFactor: number | null;
  interimSummary: number | null;
  fac: string | null;
  caiValue: number | null;
  finalSummary: number | null;
  improvementUsage: string | null;
  newMeasureUsage: string | null;
  finalRating: number | null;
  partCSummaryRating: number | null;
  partDSummaryRating: number | null;
  improvementScore: number | null;
};
