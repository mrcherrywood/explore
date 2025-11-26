/**
 * Reward Factor Types
 * Based on CMS 2026 Star Ratings Technical Notes
 */

export type RatingType = 'part_c' | 'part_d_mapd' | 'part_d_pdp' | 'overall_mapd';

export type MeanCategory = 'high' | 'relatively_high' | 'below_threshold';

export type VarianceCategory = 'low' | 'medium' | 'high';

export type ContractMeasure = {
  code: string;
  starValue: number;
  weight: number;
  category: 'Part C' | 'Part D' | string;
};

export type ContractRatingData = {
  contractId: string;
  measures: ContractMeasure[];
};

export type ContractRatingStats = {
  contractId: string;
  weightedMean: number;
  weightedVariance: number;
  measureCount: number;
  totalWeight: number;
};

export type PercentileThresholds = {
  mean65th: number;
  mean85th: number;
  variance30th: number;
  variance70th: number;
};

export type RewardFactorResult = {
  contractId: string;
  ratingType: RatingType;
  weightedMean: number;
  weightedVariance: number;
  meanCategory: MeanCategory;
  varianceCategory: VarianceCategory;
  rFactor: number;
  baseRating: number;
  adjustedRating: number;
};

export type ThresholdComparison = {
  ratingType: RatingType;
  scenario: string;
  current: PercentileThresholds;
  projected: PercentileThresholds;
  changes: {
    mean65thChange: number;
    mean85thChange: number;
    variance30thChange: number;
    variance70thChange: number;
  };
};

export type RewardFactorImpactSummary = {
  currentThresholds: PercentileThresholds;
  projectedThresholds: PercentileThresholds;
  thresholdChanges: {
    mean65thChange: number;
    mean85thChange: number;
    variance30thChange: number;
    variance70thChange: number;
  };
  contractImpacts: Array<{
    contractId: string;
    currentRFactor: number;
    projectedRFactor: number;
    rFactorChange: number;
    currentMeanCategory: MeanCategory;
    projectedMeanCategory: MeanCategory;
    currentVarianceCategory: VarianceCategory;
    projectedVarianceCategory: VarianceCategory;
  }>;
  summary: {
    contractsGainingRFactor: number;
    contractsLosingRFactor: number;
    contractsUnchanged: number;
    avgRFactorChange: number;
  };
};

