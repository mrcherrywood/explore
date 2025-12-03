/**
 * Official CMS 2026 Reward Factor Thresholds
 * Source: CMS 2026 Star Ratings Technical Notes (Last Updated 09/04/2025)
 * 
 * These are the published thresholds for comparing calculated thresholds.
 */

import type { RatingType, PercentileThresholds } from './types';

export type ScenarioConfig = {
  improvementMeasuresIncluded: boolean;
  newMeasuresIncluded: boolean;
};

export type OfficialThresholds2026 = {
  scenario: ScenarioConfig;
  performance: {
    percentile65: {
      partC: number;
      partDMapd: number;
      partDPdp: number;
      overallMapd: number;
    };
    percentile85: {
      partC: number;
      partDMapd: number;
      partDPdp: number;
      overallMapd: number;
    };
  };
  variance: {
    percentile30: {
      partC: number;
      partDMapd: number;
      partDPdp: number;
      overallMapd: number;
    };
    percentile70: {
      partC: number;
      partDMapd: number;
      partDPdp: number;
      overallMapd: number;
    };
  };
};

/**
 * Official CMS 2026 thresholds for all scenarios
 * Data extracted from reward_factor_2026.json
 */
export const OFFICIAL_THRESHOLDS_2026: OfficialThresholds2026[] = [
  {
    scenario: { improvementMeasuresIncluded: true, newMeasuresIncluded: true },
    performance: {
      percentile65: { partC: 3.695652, partDMapd: 3.740741, partDPdp: 3.385522, overallMapd: 3.649351 },
      percentile85: { partC: 4.0, partDMapd: 4.0, partDPdp: 3.9133, overallMapd: 3.932432 },
    },
    variance: {
      percentile30: { partC: 0.918435, partDMapd: 0.754209, partDPdp: 0.869005, overallMapd: 0.91485 },
      percentile70: { partC: 1.28517, partDMapd: 1.268986, partDPdp: 1.747939, overallMapd: 1.263462 },
    },
  },
  {
    scenario: { improvementMeasuresIncluded: true, newMeasuresIncluded: false },
    performance: {
      percentile65: { partC: 3.708333, partDMapd: 3.740741, partDPdp: 3.385522, overallMapd: 3.656716 },
      percentile85: { partC: 4.019608, partDMapd: 4.0, partDPdp: 3.9133, overallMapd: 3.943662 },
    },
    variance: {
      percentile30: { partC: 0.909844, partDMapd: 0.754209, partDPdp: 0.869005, overallMapd: 0.905154 },
      percentile70: { partC: 1.281071, partDMapd: 1.268986, partDPdp: 1.747939, overallMapd: 1.272639 },
    },
  },
  {
    scenario: { improvementMeasuresIncluded: false, newMeasuresIncluded: true },
    performance: {
      percentile65: { partC: 3.717391, partDMapd: 3.769231, partDPdp: 3.318182, overallMapd: 3.686567 },
      percentile85: { partC: 4.020408, partDMapd: 4.136364, partDPdp: 4.117647, overallMapd: 3.953125 },
    },
    variance: {
      percentile30: { partC: 0.914326, partDMapd: 0.736111, partDPdp: 0.74918, overallMapd: 0.908919 },
      percentile70: { partC: 1.328432, partDMapd: 1.318182, partDPdp: 1.814773, overallMapd: 1.26961 },
    },
  },
  {
    scenario: { improvementMeasuresIncluded: false, newMeasuresIncluded: false },
    performance: {
      percentile65: { partC: 3.736842, partDMapd: 3.769231, partDPdp: 3.318182, overallMapd: 3.7 },
      percentile85: { partC: 4.02381, partDMapd: 4.136364, partDPdp: 4.117647, overallMapd: 3.966667 },
    },
    variance: {
      percentile30: { partC: 0.908942, partDMapd: 0.736111, partDPdp: 0.74918, overallMapd: 0.915156 },
      percentile70: { partC: 1.310167, partDMapd: 1.318182, partDPdp: 1.814773, overallMapd: 1.289063 },
    },
  },
];

/**
 * Get official thresholds for a specific scenario
 */
export function getOfficialThresholds(
  improvementMeasuresIncluded: boolean,
  newMeasuresIncluded: boolean
): OfficialThresholds2026 | null {
  return OFFICIAL_THRESHOLDS_2026.find(
    t => t.scenario.improvementMeasuresIncluded === improvementMeasuresIncluded &&
         t.scenario.newMeasuresIncluded === newMeasuresIncluded
  ) ?? null;
}

/**
 * Convert official thresholds to PercentileThresholds format for a specific rating type
 */
export function officialToPercentileThresholds(
  official: OfficialThresholds2026,
  ratingType: RatingType
): PercentileThresholds {
  const getMeanValue = (level: 'percentile65' | 'percentile85') => {
    switch (ratingType) {
      case 'part_c':
        return official.performance[level].partC;
      case 'part_d_mapd':
        return official.performance[level].partDMapd;
      case 'part_d_pdp':
        return official.performance[level].partDPdp;
      case 'overall_mapd':
        return official.performance[level].overallMapd;
    }
  };

  const getVarianceValue = (level: 'percentile30' | 'percentile70') => {
    switch (ratingType) {
      case 'part_c':
        return official.variance[level].partC;
      case 'part_d_mapd':
        return official.variance[level].partDMapd;
      case 'part_d_pdp':
        return official.variance[level].partDPdp;
      case 'overall_mapd':
        return official.variance[level].overallMapd;
    }
  };

  return {
    mean65th: getMeanValue('percentile65'),
    mean85th: getMeanValue('percentile85'),
    variance30th: getVarianceValue('percentile30'),
    variance70th: getVarianceValue('percentile70'),
  };
}

/**
 * Compare calculated thresholds against official thresholds
 */
export function compareWithOfficial(
  calculated: PercentileThresholds,
  ratingType: RatingType,
  improvementMeasuresIncluded: boolean = true,
  newMeasuresIncluded: boolean = true
): {
  official: PercentileThresholds;
  differences: {
    mean65th: number;
    mean85th: number;
    variance30th: number;
    variance70th: number;
  };
  percentDifferences: {
    mean65th: number;
    mean85th: number;
    variance30th: number;
    variance70th: number;
  };
} | null {
  const official = getOfficialThresholds(improvementMeasuresIncluded, newMeasuresIncluded);
  if (!official) return null;

  const officialThresholds = officialToPercentileThresholds(official, ratingType);

  const calcDiff = (calc: number, off: number) => calc - off;
  const calcPctDiff = (calc: number, off: number) => off !== 0 ? ((calc - off) / off) * 100 : 0;

  return {
    official: officialThresholds,
    differences: {
      mean65th: calcDiff(calculated.mean65th, officialThresholds.mean65th),
      mean85th: calcDiff(calculated.mean85th, officialThresholds.mean85th),
      variance30th: calcDiff(calculated.variance30th, officialThresholds.variance30th),
      variance70th: calcDiff(calculated.variance70th, officialThresholds.variance70th),
    },
    percentDifferences: {
      mean65th: calcPctDiff(calculated.mean65th, officialThresholds.mean65th),
      mean85th: calcPctDiff(calculated.mean85th, officialThresholds.mean85th),
      variance30th: calcPctDiff(calculated.variance30th, officialThresholds.variance30th),
      variance70th: calcPctDiff(calculated.variance70th, officialThresholds.variance70th),
    },
  };
}








