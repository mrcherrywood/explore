/**
 * Reward Factor Calculations
 * Based on CMS 2026 Star Ratings Technical Notes
 * 
 * The reward factor rewards contracts with high, consistent performance.
 * It's based on:
 * 1. Weighted mean of individual measure stars (performance)
 * 2. Weighted variance of individual measure stars (consistency)
 * 
 * Percentile cutpoints are computed across all contracts for each scenario.
 */

import type {
  ContractMeasure,
  ContractRatingStats,
  MeanCategory,
  PercentileThresholds,
  RewardFactorResult,
  RatingType,
  VarianceCategory,
} from './types';

/**
 * Calculate weighted mean of star ratings
 * Formula: sum(weight_i * star_i) / sum(weight_i)
 */
export function calculateWeightedMean(measures: ContractMeasure[]): number {
  if (measures.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const m of measures) {
    if (m.weight > 0 && m.starValue > 0) {
      weightedSum += m.weight * m.starValue;
      totalWeight += m.weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate weighted variance of star ratings around the mean
 * Formula from CMS Technical Notes:
 * variance_j = [n / (n - 1)] * [sum(weight_i * (star_i - mean)^2)] / [sum(weight_i)]
 * 
 * This is Bessel's correction applied to a weighted variance formula.
 */
export function calculateWeightedVariance(
  measures: ContractMeasure[],
  mean?: number
): number {
  const validMeasures = measures.filter(m => m.weight > 0 && m.starValue > 0);
  const n = validMeasures.length;
  
  if (n <= 1) return 0;

  const calculatedMean = mean ?? calculateWeightedMean(validMeasures);
  
  let sumWeightedSquaredDeviations = 0;
  let totalWeight = 0;

  for (const m of validMeasures) {
    const deviation = m.starValue - calculatedMean;
    sumWeightedSquaredDeviations += m.weight * deviation * deviation;
    totalWeight += m.weight;
  }

  if (totalWeight === 0) return 0;

  // Apply Bessel's correction: n / (n - 1)
  const besselCorrection = n / (n - 1);
  
  return besselCorrection * (sumWeightedSquaredDeviations / totalWeight);
}

/**
 * Calculate rating stats for a contract given its measures
 */
export function calculateContractStats(
  contractId: string,
  measures: ContractMeasure[],
  filterCategory?: 'Part C' | 'Part D' | null
): ContractRatingStats {
  const filteredMeasures = filterCategory
    ? measures.filter(m => m.category === filterCategory)
    : measures;

  const validMeasures = filteredMeasures.filter(m => m.weight > 0 && m.starValue > 0);
  const weightedMean = calculateWeightedMean(validMeasures);
  const weightedVariance = calculateWeightedVariance(validMeasures, weightedMean);
  const totalWeight = validMeasures.reduce((sum, m) => sum + m.weight, 0);

  return {
    contractId,
    weightedMean,
    weightedVariance,
    measureCount: validMeasures.length,
    totalWeight,
  };
}

/**
 * Calculate percentile value from a sorted array
 * Uses linear interpolation for percentiles between exact positions
 */
export function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) {
    return sortedValues[lower];
  }

  return sortedValues[lower] + fraction * (sortedValues[upper] - sortedValues[lower]);
}

/**
 * Compute percentile thresholds from a collection of contract stats
 */
export function computePercentileThresholds(
  contractStats: ContractRatingStats[]
): PercentileThresholds {
  if (contractStats.length === 0) {
    return {
      mean65th: 0,
      mean85th: 0,
      variance30th: 0,
      variance70th: 0,
    };
  }

  // Extract and sort means and variances
  const means = contractStats
    .filter(c => c.measureCount > 1) // Need at least 2 measures for meaningful stats
    .map(c => c.weightedMean)
    .sort((a, b) => a - b);

  const variances = contractStats
    .filter(c => c.measureCount > 1)
    .map(c => c.weightedVariance)
    .sort((a, b) => a - b);

  return {
    mean65th: calculatePercentile(means, 65),
    mean85th: calculatePercentile(means, 85),
    variance30th: calculatePercentile(variances, 30),
    variance70th: calculatePercentile(variances, 70),
  };
}

/**
 * Classify mean into performance category based on percentile thresholds
 */
export function classifyMean(
  mean: number,
  thresholds: PercentileThresholds
): MeanCategory {
  if (mean >= thresholds.mean85th) return 'high';
  if (mean >= thresholds.mean65th) return 'relatively_high';
  return 'below_threshold';
}

/**
 * Classify variance into category based on percentile thresholds
 */
export function classifyVariance(
  variance: number,
  thresholds: PercentileThresholds
): VarianceCategory {
  if (variance < thresholds.variance30th) return 'low';
  if (variance < thresholds.variance70th) return 'medium';
  return 'high';
}

/**
 * Map mean and variance categories to r-Factor value
 * Based on CMS reward factor mapping rules
 */
export function mapToRFactor(
  meanCategory: MeanCategory,
  varianceCategory: VarianceCategory
): number {
  if (meanCategory === 'high') {
    if (varianceCategory === 'low') return 0.4;
    if (varianceCategory === 'medium') return 0.3;
    return 0.0;
  }
  
  if (meanCategory === 'relatively_high') {
    if (varianceCategory === 'low') return 0.2;
    if (varianceCategory === 'medium') return 0.1;
    return 0.0;
  }

  return 0.0;
}

/**
 * Calculate reward factor for a single contract
 */
export function calculateRewardFactor(
  contractStats: ContractRatingStats,
  thresholds: PercentileThresholds,
  ratingType: RatingType,
  baseRating?: number
): RewardFactorResult {
  const meanCategory = classifyMean(contractStats.weightedMean, thresholds);
  const varianceCategory = classifyVariance(contractStats.weightedVariance, thresholds);
  const rFactor = mapToRFactor(meanCategory, varianceCategory);
  
  const effectiveBaseRating = baseRating ?? contractStats.weightedMean;
  const adjustedRating = Math.min(5.0, Math.max(1.0, effectiveBaseRating + rFactor));

  return {
    contractId: contractStats.contractId,
    ratingType,
    weightedMean: contractStats.weightedMean,
    weightedVariance: contractStats.weightedVariance,
    meanCategory,
    varianceCategory,
    rFactor,
    baseRating: effectiveBaseRating,
    adjustedRating,
  };
}

/**
 * Filter measures by removing specified measure codes
 */
export function filterMeasures(
  measures: ContractMeasure[],
  removedCodes: Set<string>
): ContractMeasure[] {
  return measures.filter(m => !removedCodes.has(m.code.toUpperCase()));
}

/**
 * Compare current vs projected thresholds and impacts
 */
export function compareThresholds(
  currentThresholds: PercentileThresholds,
  projectedThresholds: PercentileThresholds
): {
  mean65thChange: number;
  mean85thChange: number;
  variance30thChange: number;
  variance70thChange: number;
} {
  return {
    mean65thChange: projectedThresholds.mean65th - currentThresholds.mean65th,
    mean85thChange: projectedThresholds.mean85th - currentThresholds.mean85th,
    variance30thChange: projectedThresholds.variance30th - currentThresholds.variance30th,
    variance70thChange: projectedThresholds.variance70th - currentThresholds.variance70th,
  };
}

/**
 * Analyze reward factor impact for a set of contracts
 * comparing current state vs. projected state with measures removed
 */
export function analyzeRewardFactorImpact(
  contractsData: Map<string, ContractMeasure[]>,
  removedCodes: Set<string>,
  ratingType: RatingType,
  filterCategory?: 'Part C' | 'Part D' | null
): {
  currentThresholds: PercentileThresholds;
  projectedThresholds: PercentileThresholds;
  thresholdChanges: ReturnType<typeof compareThresholds>;
  contractResults: Array<{
    contractId: string;
    current: RewardFactorResult;
    projected: RewardFactorResult;
    rFactorChange: number;
  }>;
} {
  // Calculate current stats for all contracts
  const currentStats: ContractRatingStats[] = [];
  const projectedStats: ContractRatingStats[] = [];

  for (const [contractId, measures] of contractsData) {
    const currentContractStats = calculateContractStats(contractId, measures, filterCategory);
    if (currentContractStats.measureCount > 1) {
      currentStats.push(currentContractStats);
    }

    const filteredMeasures = filterMeasures(measures, removedCodes);
    const projectedContractStats = calculateContractStats(contractId, filteredMeasures, filterCategory);
    if (projectedContractStats.measureCount > 1) {
      projectedStats.push(projectedContractStats);
    }
  }

  // Compute thresholds
  const currentThresholds = computePercentileThresholds(currentStats);
  const projectedThresholds = computePercentileThresholds(projectedStats);
  const thresholdChanges = compareThresholds(currentThresholds, projectedThresholds);

  // Calculate reward factors for each contract
  const contractResults: Array<{
    contractId: string;
    current: RewardFactorResult;
    projected: RewardFactorResult;
    rFactorChange: number;
  }> = [];

  // Create lookup maps
  const currentStatsMap = new Map(currentStats.map(s => [s.contractId, s]));
  const projectedStatsMap = new Map(projectedStats.map(s => [s.contractId, s]));

  for (const [contractId] of contractsData) {
    const currentContractStats = currentStatsMap.get(contractId);
    const projectedContractStats = projectedStatsMap.get(contractId);

    if (!currentContractStats || !projectedContractStats) continue;

    const currentResult = calculateRewardFactor(currentContractStats, currentThresholds, ratingType);
    const projectedResult = calculateRewardFactor(projectedContractStats, projectedThresholds, ratingType);

    contractResults.push({
      contractId,
      current: currentResult,
      projected: projectedResult,
      rFactorChange: projectedResult.rFactor - currentResult.rFactor,
    });
  }

  return {
    currentThresholds,
    projectedThresholds,
    thresholdChanges,
    contractResults,
  };
}



