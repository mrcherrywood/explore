import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  calculateContractStats,
  computePercentileThresholds,
  calculateRewardFactor,
  filterMeasures,
  compareThresholds,
  compareWithOfficial,
  type ContractMeasure,
} from '@/lib/reward-factor';

export const dynamic = 'force-dynamic';

// CMS measures being removed from Star Ratings calculation
// Based on CMS announcement for 2028-2029 Stars
// Map of measure code to the year it will be removed
const CMS_REMOVED_MEASURES: Record<string, number> = {
  // C: Plan Makes Timely Decisions about Appeals – 2029 Stars
  'C31': 2029,
  // C: Reviewing Appeals Decisions – 2029 Stars
  'C32': 2029,
  // C: Special Needs Plan (SNP) Care Management – 2029 Stars
  'C07': 2029,
  // C: Call Center – Foreign Language Interpreter and TTY Availability – 2028 Stars
  'C33': 2028,
  // D: Call Center – Foreign Language Interpreter and TTY Availability – 2028 Stars
  'D01': 2028,
  // C: Complaints about the Health Plan – 2029 Stars
  'C28': 2029,
  // D: Complaints about the Drug Plan – 2029 Stars
  'D02': 2029,
  // D: Medicare Plan Finder Price Accuracy – 2029 Stars
  'D07': 2029,
  // C: Diabetes Care – Eye Exam – 2029 Stars
  'C11': 2029,
  // C: Statin Therapy for Patients with Cardiovascular Disease – 2028 Stars
  'C19': 2028,
  // C: Members Choosing to Leave the Plan – 2029 Stars
  'C29': 2029,
  // D: Members Choosing to Leave the Plan – 2029 Stars
  'D03': 2029,
  // C: Customer Service – 2029 Stars
  'C24': 2029,
  // C: Rating of Health Care Quality – 2029 Stars
  'C25': 2029,
};

const CMS_REMOVED_MEASURE_CODES = new Set(Object.keys(CMS_REMOVED_MEASURES));

// Quality Improvement Measures subject to Hold Harmless provision
// If a contract would be ≥4 stars WITHOUT QI measures but including them drops below 4,
// then QI measures are excluded from the calculation
const QUALITY_IMPROVEMENT_MEASURES = new Set(['C27', 'D04']);
const HOLD_HARMLESS_THRESHOLD = 4.0;

function isMeasureBeingRemoved(code: string): boolean {
  return CMS_REMOVED_MEASURE_CODES.has(code.trim().toUpperCase());
}

function isQualityImprovementMeasure(code: string): boolean {
  return QUALITY_IMPROVEMENT_MEASURES.has(code.trim().toUpperCase());
}

function getMeasureRemovalYear(code: string): number | null {
  return CMS_REMOVED_MEASURES[code.trim().toUpperCase()] ?? null;
}

type MeasureRow = {
  code: string;
  name: string | null;
  domain: string;
  weight: number;
};

type MeasureInfo = {
  code: string;
  name: string | null;
  domain: string;
  weight: number;
  isBeingRemoved: boolean;
};

type ContractAnalysis = {
  contractId: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  parentOrganization: string | null;
  organizationType: string | null;
  snpIndicator: string | null;
  currentOverallRating: number | null;
  currentPartCRating: number | null;
  currentPartDRating: number | null;
  projectedOverallRating: number | null;
  projectedPartCRating: number | null;
  projectedPartDRating: number | null;
  // Final projected ratings including reward factor adjustments
  finalProjectedOverall: number | null;
  finalProjectedPartC: number | null;
  finalProjectedPartD: number | null;
  finalOverallChange: number | null;
  finalStarBracketChange: number;
  overallChange: number | null;
  partCChange: number | null;
  partDChange: number | null;
  starBracketChange: number;
  operationsMeasuresExcluded: number;
  totalMeasuresUsed: number;
  totalMeasuresWithoutOps: number;
  // Hold harmless provision for quality improvement measures
  holdHarmless?: {
    applied: boolean;
    ratingWithQI: number | null;
    ratingWithoutQI: number | null;
    excludedMeasures: string[];
  };
  // Reward factor impact fields (added later)
  rewardFactor?: {
    currentRFactor: number;
    projectedRFactor: number;
    rFactorChange: number;
    currentMean: number;
    projectedMean: number;
    currentVariance: number;
    projectedVariance: number;
    // Current rating with r-factor applied
    currentAdjustedRating: number;
    // Projected rating with r-factor applied
    projectedAdjustedRating: number;
  };
};

type ParentOrgAnalysis = {
  parentOrganization: string;
  contractCount: number;
  avgCurrentRating: number | null;
  avgProjectedRating: number | null;
  avgFinalProjectedRating: number | null;
  avgOverallChange: number | null;
  avgFinalOverallChange: number | null;
  contractsGaining: number;
  contractsLosing: number;
  bracketGainers: number;
  bracketLosers: number;
  finalBracketGainers: number;
  finalBracketLosers: number;
};

type DomainSummary = {
  domain: string;
  measureCount: number;
  removedMeasureCount: number;
  totalWeight: number;
  removedWeight: number;
  measures: Array<{ code: string; name: string | null; weight: number; isBeingRemoved: boolean }>;
};

type MetricRow = {
  contract_id: string;
  metric_code: string;
  metric_category: string;
  star_rating: string | null;
};

type ContractRow = {
  contract_id: string;
  contract_name: string | null;
  organization_marketing_name: string | null;
  parent_organization: string | null;
  organization_type: string | null;
  snp_indicator: string | null;
};

type SummaryRatingRow = {
  contract_id: string;
  overall_rating_numeric: number | null;
  part_c_summary_numeric: number | null;
  part_d_summary_numeric: number | null;
};

const PAGE_SIZE = 1000;

async function fetchAllMetrics(supabase: ReturnType<typeof createServiceRoleClient>, year: number): Promise<MetricRow[]> {
  const allMetrics: MetricRow[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('ma_metrics')
      .select('contract_id, metric_code, metric_category, star_rating')
      .eq('year', year)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    if (data && data.length > 0) {
      allMetrics.push(...(data as MetricRow[]));
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allMetrics;
}

async function fetchAllContracts(supabase: ReturnType<typeof createServiceRoleClient>, year: number): Promise<ContractRow[]> {
  const allContracts: ContractRow[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('ma_contracts')
      .select('contract_id, contract_name, organization_marketing_name, parent_organization, organization_type, snp_indicator')
      .eq('year', year)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    if (data && data.length > 0) {
      allContracts.push(...(data as ContractRow[]));
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allContracts;
}

async function fetchAllSummaryRatings(supabase: ReturnType<typeof createServiceRoleClient>, year: number): Promise<SummaryRatingRow[]> {
  const allRatings: SummaryRatingRow[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('summary_ratings')
      .select('contract_id, overall_rating_numeric, part_c_summary_numeric, part_d_summary_numeric')
      .eq('year', year)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    if (data && data.length > 0) {
      allRatings.push(...(data as SummaryRatingRow[]));
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }

  return allRatings;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? Number.parseInt(yearParam, 10) : 2026;

    const supabase = createServiceRoleClient();

    // Fetch all measures with their domains and weights for the specified year
    const { data: measures, error: measuresError } = await supabase
      .from('ma_measures')
      .select('code, name, domain, weight')
      .eq('year', year) as { data: MeasureRow[] | null; error: Error | null };

    if (measuresError) {
      throw new Error(measuresError.message);
    }

    const measureMap = new Map<string, MeasureInfo>();
    const allDomains = new Map<string, DomainSummary>();

    for (const m of measures || []) {
      if (!m.code || !m.domain || m.weight === null || m.weight === undefined) continue;
      
      const code = m.code.trim();
      const isBeingRemoved = isMeasureBeingRemoved(code);
      
      const info: MeasureInfo = {
        code,
        name: m.name,
        domain: m.domain.trim(),
        weight: m.weight,
        isBeingRemoved,
      };
      measureMap.set(info.code, info);

      if (!allDomains.has(info.domain)) {
        allDomains.set(info.domain, {
          domain: info.domain,
          measureCount: 0,
          removedMeasureCount: 0,
          totalWeight: 0,
          removedWeight: 0,
          measures: [],
        });
      }
      const domainSummary = allDomains.get(info.domain)!;
      domainSummary.measureCount += 1;
      domainSummary.totalWeight += info.weight;
      if (isBeingRemoved) {
        domainSummary.removedMeasureCount += 1;
        domainSummary.removedWeight += info.weight;
      }
      domainSummary.measures.push({ code: info.code, name: info.name, weight: info.weight, isBeingRemoved });
    }

    // Fetch all data with pagination
    const [contracts, summaryRatings, metrics] = await Promise.all([
      fetchAllContracts(supabase, year),
      fetchAllSummaryRatings(supabase, year),
      fetchAllMetrics(supabase, year),
    ]);

    // Build contract lookup
    const contractMap = new Map<string, ContractRow>();
    for (const c of contracts) {
      if (!c.contract_id) continue;
      contractMap.set(c.contract_id.trim().toUpperCase(), c);
    }

    // Build summary ratings lookup
    const summaryRatingsMap = new Map<string, { overall: number | null; partC: number | null; partD: number | null }>();
    for (const sr of summaryRatings) {
      if (!sr.contract_id) continue;
      summaryRatingsMap.set(sr.contract_id.trim().toUpperCase(), {
        overall: sr.overall_rating_numeric,
        partC: sr.part_c_summary_numeric,
        partD: sr.part_d_summary_numeric,
      });
    }

    // Group metrics by contract
    const metricsByContract = new Map<string, Array<{ code: string; category: string; starRating: number }>>();
    for (const m of metrics) {
      if (!m.contract_id || !m.metric_code || !m.star_rating) continue;
      
      const starValue = Number.parseFloat(m.star_rating);
      if (!Number.isFinite(starValue) || starValue <= 0) continue;

      const contractId = m.contract_id.trim().toUpperCase();
      if (!metricsByContract.has(contractId)) {
        metricsByContract.set(contractId, []);
      }
      metricsByContract.get(contractId)!.push({
        code: m.metric_code.trim(),
        category: m.metric_category?.trim() || '',
        starRating: starValue,
      });
    }

    // Calculate ratings for each contract that has metrics
    const contractAnalyses: ContractAnalysis[] = [];
    const allContractIds = new Set([...contractMap.keys(), ...metricsByContract.keys()]);

    for (const contractId of allContractIds) {
      const contractMetrics = metricsByContract.get(contractId) || [];
      if (contractMetrics.length === 0) continue;

      const contractInfo = contractMap.get(contractId);

      // Calculate current ratings (with all measures)
      let _currentOverallWeighted = 0;
      let _currentOverallWeight = 0;
      let currentPartCWeighted = 0;
      let currentPartCWeight = 0;
      let currentPartDWeighted = 0;
      let currentPartDWeight = 0;
      let totalMeasuresUsed = 0;

      // Calculate projected ratings (without operations measures)
      let projectedOverallWeighted = 0;
      let projectedOverallWeight = 0;
      let projectedPartCWeighted = 0;
      let projectedPartCWeight = 0;
      let projectedPartDWeighted = 0;
      let projectedPartDWeight = 0;
      let operationsMeasuresExcluded = 0;
      let totalMeasuresWithoutOps = 0;

      for (const metric of contractMetrics) {
        const measureInfo = measureMap.get(metric.code);
        if (!measureInfo) continue;

        const weight = measureInfo.weight;
        const starValue = metric.starRating;
        const isPartC = metric.category === 'Part C';
        const isPartD = metric.category === 'Part D';

        // Current ratings (all measures)
        _currentOverallWeighted += starValue * weight;
        _currentOverallWeight += weight;
        totalMeasuresUsed += 1;

        if (isPartC) {
          currentPartCWeighted += starValue * weight;
          currentPartCWeight += weight;
        } else if (isPartD) {
          currentPartDWeighted += starValue * weight;
          currentPartDWeight += weight;
        }

        // Projected ratings (excluding CMS removed measures)
        if (measureInfo.isBeingRemoved) {
          operationsMeasuresExcluded += 1;
        } else {
          projectedOverallWeighted += starValue * weight;
          projectedOverallWeight += weight;
          totalMeasuresWithoutOps += 1;

          if (isPartC) {
            projectedPartCWeighted += starValue * weight;
            projectedPartCWeight += weight;
          } else if (isPartD) {
            projectedPartDWeighted += starValue * weight;
            projectedPartDWeight += weight;
          }
        }
      }

      // Use CMS official ratings - skip contracts without an official overall star rating
      const cmsRatings = summaryRatingsMap.get(contractId);
      
      // Only include contracts that have an official overall star rating from CMS
      if (!cmsRatings?.overall) {
        continue;
      }
      
      const currentOverall = cmsRatings.overall;
      const currentPartC = cmsRatings?.partC ?? (currentPartCWeight > 0 ? currentPartCWeighted / currentPartCWeight : null);
      const currentPartD = cmsRatings?.partD ?? (currentPartDWeight > 0 ? currentPartDWeighted / currentPartDWeight : null);

      // Calculate projected rating WITH quality improvement measures
      const projectedWithQI = projectedOverallWeight > 0 ? projectedOverallWeighted / projectedOverallWeight : null;
      
      // Calculate projected rating WITHOUT quality improvement measures (for hold harmless check)
      let projectedWithoutQIWeighted = 0;
      let projectedWithoutQIWeight = 0;
      const qiMeasuresPresent: string[] = [];
      
      for (const metric of contractMetrics) {
        const measureInfo = measureMap.get(metric.code);
        if (!measureInfo) continue;
        
        // Skip removed measures AND quality improvement measures
        if (measureInfo.isBeingRemoved) continue;
        
        if (isQualityImprovementMeasure(metric.code)) {
          qiMeasuresPresent.push(metric.code);
          continue;
        }
        
        projectedWithoutQIWeighted += metric.starRating * measureInfo.weight;
        projectedWithoutQIWeight += measureInfo.weight;
      }
      
      const projectedWithoutQI = projectedWithoutQIWeight > 0 ? projectedWithoutQIWeighted / projectedWithoutQIWeight : null;
      
      // Apply Hold Harmless provision:
      // If rating WITHOUT QI measures >= 4.0 AND rating WITH QI measures < 4.0,
      // then exclude QI measures (use the higher rating)
      let holdHarmlessApplied = false;
      let projectedOverall = projectedWithQI;
      
      if (
        qiMeasuresPresent.length > 0 &&
        projectedWithoutQI !== null &&
        projectedWithQI !== null &&
        projectedWithoutQI >= HOLD_HARMLESS_THRESHOLD &&
        projectedWithQI < HOLD_HARMLESS_THRESHOLD
      ) {
        // Hold harmless applies - use rating without QI measures
        holdHarmlessApplied = true;
        projectedOverall = projectedWithoutQI;
      }
      
      const projectedPartC = projectedPartCWeight > 0 ? projectedPartCWeighted / projectedPartCWeight : null;
      const projectedPartD = projectedPartDWeight > 0 ? projectedPartDWeighted / projectedPartDWeight : null;

      // Calculate changes
      const overallChange = (currentOverall !== null && projectedOverall !== null) 
        ? projectedOverall - currentOverall 
        : null;
      const partCChange = (currentPartC !== null && projectedPartC !== null)
        ? projectedPartC - currentPartC
        : null;
      const partDChange = (currentPartD !== null && projectedPartD !== null)
        ? projectedPartD - currentPartD
        : null;

      // Calculate star bracket change (rounded to nearest 0.5)
      const roundToHalf = (n: number) => Math.round(n * 2) / 2;
      const currentBracket = currentOverall !== null ? roundToHalf(currentOverall) : null;
      const projectedBracket = projectedOverall !== null ? roundToHalf(projectedOverall) : null;
      const starBracketChange = (currentBracket !== null && projectedBracket !== null)
        ? (projectedBracket - currentBracket) * 2
        : 0;

      contractAnalyses.push({
        contractId,
        contractName: contractInfo?.contract_name ?? null,
        organizationMarketingName: contractInfo?.organization_marketing_name ?? null,
        parentOrganization: contractInfo?.parent_organization ?? null,
        organizationType: contractInfo?.organization_type ?? null,
        snpIndicator: contractInfo?.snp_indicator ?? null,
        currentOverallRating: currentOverall,
        currentPartCRating: currentPartC,
        currentPartDRating: currentPartD,
        projectedOverallRating: projectedOverall,
        projectedPartCRating: projectedPartC,
        projectedPartDRating: projectedPartD,
        // These will be populated after reward factor calculation
        finalProjectedOverall: null,
        finalProjectedPartC: null,
        finalProjectedPartD: null,
        finalOverallChange: null,
        finalStarBracketChange: 0,
        overallChange,
        partCChange,
        partDChange,
        starBracketChange,
        operationsMeasuresExcluded,
        totalMeasuresUsed,
        totalMeasuresWithoutOps,
        // Hold harmless provision data
        holdHarmless: qiMeasuresPresent.length > 0 ? {
          applied: holdHarmlessApplied,
          ratingWithQI: projectedWithQI,
          ratingWithoutQI: projectedWithoutQI,
          excludedMeasures: holdHarmlessApplied ? qiMeasuresPresent : [],
        } : undefined,
      });
    }

    // Build list of removed measures with their info
    const removedMeasures = Array.from(measureMap.values())
      .filter(m => m.isBeingRemoved)
      .map(m => ({
        code: m.code,
        name: m.name,
        domain: m.domain,
        weight: m.weight,
        removalYear: getMeasureRemovalYear(m.code),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const totalRemovedWeight = removedMeasures.reduce((sum, m) => sum + m.weight, 0);

    // Build contract measures data for reward factor analysis
    // Only include contracts with official overall star ratings
    const contractMeasuresData = new Map<string, ContractMeasure[]>();
    for (const [contractId, contractMetrics] of metricsByContract) {
      // Skip contracts without an official overall star rating
      const cmsRatings = summaryRatingsMap.get(contractId);
      if (!cmsRatings?.overall) {
        continue;
      }
      
      const measures: ContractMeasure[] = [];
      for (const metric of contractMetrics) {
        const measureInfo = measureMap.get(metric.code);
        if (!measureInfo || measureInfo.weight <= 0) continue;
        measures.push({
          code: metric.code,
          starValue: metric.starRating,
          weight: measureInfo.weight,
          category: metric.category,
        });
      }
      if (measures.length > 0) {
        contractMeasuresData.set(contractId, measures);
      }
    }

    // Build hold harmless lookup from contractAnalyses
    const holdHarmlessMap = new Map<string, boolean>();
    for (const analysis of contractAnalyses) {
      holdHarmlessMap.set(analysis.contractId, analysis.holdHarmless?.applied ?? false);
    }

    // ==========================================
    // REWARD FACTOR CALCULATION WITH HOLD HARMLESS
    // ==========================================
    // We need separate thresholds for:
    // 1. Contracts WITH QI measures (no hold harmless)
    // 2. Contracts WITHOUT QI measures (hold harmless applies)
    // 
    // For projected scenarios, we calculate thresholds after removing ops measures
    // but still maintaining the QI measure split based on hold harmless status.

    const analyzeRewardFactorWithHoldHarmless = (
      contractsData: Map<string, ContractMeasure[]>,
      removedCodes: Set<string>,
      ratingType: 'overall_mapd' | 'part_c' | 'part_d_mapd',
      filterCategory: 'Part C' | 'Part D' | null
    ) => {
      // ==========================================
      // THRESHOLD CALCULATION
      // ==========================================
      // Thresholds are computed from ALL contracts in each scenario:
      // - WITH QI: All contracts with their QI measures included
      // - WITHOUT QI: All contracts with their QI measures excluded
      // The hold harmless status determines which threshold SET a contract uses,
      // but ALL contracts contribute to computing both threshold sets.
      
      // Current stats - ALL contracts with QI included
      const currentStatsWithQI = [];
      // Current stats - ALL contracts with QI excluded
      const currentStatsWithoutQI = [];
      // Projected stats - ALL contracts after ops removal, with QI included
      const projectedStatsWithQI = [];
      // Projected stats - ALL contracts after ops removal, with QI excluded
      const projectedStatsWithoutQI = [];
      
      for (const [contractId, measures] of contractsData) {
        // Filter by category if needed
        const categoryMeasures = filterCategory 
          ? measures.filter(m => m.category === filterCategory)
          : measures;
        
        // ---- CURRENT SCENARIO ----
        // WITH QI: Calculate stats including QI measures
        const currentStats = calculateContractStats(contractId, categoryMeasures, null);
        if (currentStats.measureCount > 1) {
          currentStatsWithQI.push(currentStats);
        }
        
        // WITHOUT QI: Calculate stats excluding QI measures
        const currentMeasuresWithoutQI = categoryMeasures.filter(m => !isQualityImprovementMeasure(m.code));
        const currentStatsNoQI = calculateContractStats(contractId, currentMeasuresWithoutQI, null);
        if (currentStatsNoQI.measureCount > 1) {
          currentStatsWithoutQI.push(currentStatsNoQI);
        }
        
        // ---- PROJECTED SCENARIO (after ops measure removal) ----
        const projectedMeasuresBase = filterMeasures(categoryMeasures, removedCodes);
        
        // WITH QI: After ops removal, still including QI measures
        const projectedStatsWithQIMeasures = calculateContractStats(contractId, projectedMeasuresBase, null);
        if (projectedStatsWithQIMeasures.measureCount > 1) {
          projectedStatsWithQI.push(projectedStatsWithQIMeasures);
        }
        
        // WITHOUT QI: After ops removal, also excluding QI measures
        const projectedMeasuresNoQI = projectedMeasuresBase.filter(m => !isQualityImprovementMeasure(m.code));
        const projectedStatsNoQIMeasures = calculateContractStats(contractId, projectedMeasuresNoQI, null);
        if (projectedStatsNoQIMeasures.measureCount > 1) {
          projectedStatsWithoutQI.push(projectedStatsNoQIMeasures);
        }
      }
      
      // Compute thresholds from ALL contracts in each scenario
      const currentThresholdsWithQI = computePercentileThresholds(currentStatsWithQI);
      const currentThresholdsWithoutQI = computePercentileThresholds(currentStatsWithoutQI);
      const projectedThresholdsWithQI = computePercentileThresholds(projectedStatsWithQI);
      const projectedThresholdsWithoutQI = computePercentileThresholds(projectedStatsWithoutQI);
      
      // ==========================================
      // REWARD FACTOR CALCULATION PER CONTRACT
      // ==========================================
      // Each contract uses the threshold set based on their hold harmless eligibility
      
      const contractResults: Array<{
        contractId: string;
        hasHoldHarmless: boolean;
        current: ReturnType<typeof calculateRewardFactor>;
        projected: ReturnType<typeof calculateRewardFactor>;
        rFactorChange: number;
      }> = [];
      
      // Create lookup maps for stats
      const currentStatsWithQIMap = new Map(currentStatsWithQI.map(s => [s.contractId, s]));
      const _currentStatsWithoutQIMap = new Map(currentStatsWithoutQI.map(s => [s.contractId, s]));
      const projectedStatsWithQIMap = new Map(projectedStatsWithQI.map(s => [s.contractId, s]));
      const projectedStatsWithoutQIMap = new Map(projectedStatsWithoutQI.map(s => [s.contractId, s]));
      
      // Track how many contracts use each threshold set
      let contractsUsingWithQI = 0;
      let contractsUsingWithoutQI = 0;
      
      for (const [contractId] of contractsData) {
        const hasHoldHarmless = holdHarmlessMap.get(contractId) ?? false;
        
        // Current: use WITH QI stats and thresholds (official CMS methodology includes QI for everyone in current)
        const currentStats = currentStatsWithQIMap.get(contractId);
        if (!currentStats) continue;
        
        const currentResult = calculateRewardFactor(
          currentStats,
          currentThresholdsWithQI, // Current always uses WITH QI thresholds
          ratingType
        );
        
        // Projected: use appropriate stats and thresholds based on hold harmless status
        let projectedResult;
        if (hasHoldHarmless) {
          // Contract has hold harmless - use stats WITHOUT QI and thresholds WITHOUT QI
          const projectedStats = projectedStatsWithoutQIMap.get(contractId);
          if (!projectedStats) continue;
          projectedResult = calculateRewardFactor(
            projectedStats,
            projectedThresholdsWithoutQI, // Use WITHOUT QI thresholds
            ratingType
          );
          contractsUsingWithoutQI++;
        } else {
          // Contract doesn't have hold harmless - use stats WITH QI and thresholds WITH QI
          const projectedStats = projectedStatsWithQIMap.get(contractId);
          if (!projectedStats) continue;
          projectedResult = calculateRewardFactor(
            projectedStats,
            projectedThresholdsWithQI, // Use WITH QI thresholds
            ratingType
          );
          contractsUsingWithQI++;
        }
        
        contractResults.push({
          contractId,
          hasHoldHarmless,
          current: currentResult,
          projected: projectedResult,
          rFactorChange: projectedResult.rFactor - currentResult.rFactor,
        });
      }
      
      return {
        currentThresholds: {
          withQI: currentThresholdsWithQI,
          withoutQI: currentThresholdsWithoutQI,
        },
        projectedThresholds: {
          withQI: projectedThresholdsWithQI,
          withoutQI: projectedThresholdsWithoutQI,
        },
        thresholdChanges: {
          withQI: compareThresholds(currentThresholdsWithQI, projectedThresholdsWithQI),
          withoutQI: compareThresholds(currentThresholdsWithoutQI, projectedThresholdsWithoutQI),
        },
        contractResults,
        stats: {
          // Total contracts contributing to each threshold calculation
          totalContractsWithQI: projectedStatsWithQI.length,
          totalContractsWithoutQI: projectedStatsWithoutQI.length,
          // Contracts using each threshold set based on hold harmless
          contractsUsingWithQIThresholds: contractsUsingWithQI,
          contractsUsingWithoutQIThresholds: contractsUsingWithoutQI,
        },
      };
    };

    // Analyze reward factor impact for overall ratings
    const overallRewardFactorImpact = analyzeRewardFactorWithHoldHarmless(
      contractMeasuresData,
      CMS_REMOVED_MEASURE_CODES,
      'overall_mapd',
      null
    );

    // Analyze reward factor impact for Part C
    const partCRewardFactorImpact = analyzeRewardFactorWithHoldHarmless(
      contractMeasuresData,
      CMS_REMOVED_MEASURE_CODES,
      'part_c',
      'Part C'
    );

    // Analyze reward factor impact for Part D
    const partDRewardFactorImpact = analyzeRewardFactorWithHoldHarmless(
      contractMeasuresData,
      CMS_REMOVED_MEASURE_CODES,
      'part_d_mapd',
      'Part D'
    );

    // Summarize reward factor impact (now with hold harmless scenarios)
    const summarizeRewardFactorImpact = (
      impact: ReturnType<typeof analyzeRewardFactorWithHoldHarmless>,
      ratingType: 'overall_mapd' | 'part_c' | 'part_d_mapd'
    ) => {
      const gains = impact.contractResults.filter(c => c.rFactorChange > 0);
      const losses = impact.contractResults.filter(c => c.rFactorChange < 0);
      const unchanged = impact.contractResults.filter(c => c.rFactorChange === 0);
      
      // Separate by hold harmless status
      const holdHarmlessContracts = impact.contractResults.filter(c => c.hasHoldHarmless);
      const nonHoldHarmlessContracts = impact.contractResults.filter(c => !c.hasHoldHarmless);
      
      const avgChange = impact.contractResults.length > 0
        ? impact.contractResults.reduce((sum, c) => sum + c.rFactorChange, 0) / impact.contractResults.length
        : 0;

      // Compare current thresholds with official CMS thresholds
      // CMS publishes thresholds for 4 scenarios based on improvement_measures and new_measures flags.
      // Try both new_measures scenarios to find best match (database may not include all "new" measures)
      const officialComparisonWithQI_newT = compareWithOfficial(
        impact.currentThresholds.withQI,
        ratingType,
        true, // improvement measures included
        true  // new measures included
      );
      const officialComparisonWithQI_newF = compareWithOfficial(
        impact.currentThresholds.withQI,
        ratingType,
        true, // improvement measures included
        false // new measures NOT included
      );
      
      // Use the scenario that produces lower average variance difference (better match)
      const avgVarDiffNewT = officialComparisonWithQI_newT 
        ? (Math.abs(officialComparisonWithQI_newT.percentDifferences.variance30th) + 
           Math.abs(officialComparisonWithQI_newT.percentDifferences.variance70th)) / 2
        : Infinity;
      const avgVarDiffNewF = officialComparisonWithQI_newF
        ? (Math.abs(officialComparisonWithQI_newF.percentDifferences.variance30th) + 
           Math.abs(officialComparisonWithQI_newF.percentDifferences.variance70th)) / 2
        : Infinity;
      
      const officialComparisonWithQI = avgVarDiffNewF < avgVarDiffNewT 
        ? officialComparisonWithQI_newF 
        : officialComparisonWithQI_newT;
      
      // Compare WITHOUT QI thresholds
      const officialComparisonWithoutQI_newT = compareWithOfficial(
        impact.currentThresholds.withoutQI,
        ratingType,
        false, // improvement measures NOT included
        true   // new measures included
      );
      const officialComparisonWithoutQI_newF = compareWithOfficial(
        impact.currentThresholds.withoutQI,
        ratingType,
        false, // improvement measures NOT included
        false  // new measures NOT included
      );
      
      // Use the scenario that produces lower average variance difference
      const avgVarDiffNoQI_newT = officialComparisonWithoutQI_newT
        ? (Math.abs(officialComparisonWithoutQI_newT.percentDifferences.variance30th) + 
           Math.abs(officialComparisonWithoutQI_newT.percentDifferences.variance70th)) / 2
        : Infinity;
      const avgVarDiffNoQI_newF = officialComparisonWithoutQI_newF
        ? (Math.abs(officialComparisonWithoutQI_newF.percentDifferences.variance30th) + 
           Math.abs(officialComparisonWithoutQI_newF.percentDifferences.variance70th)) / 2
        : Infinity;
      
      const officialComparisonWithoutQI = avgVarDiffNoQI_newF < avgVarDiffNoQI_newT
        ? officialComparisonWithoutQI_newF
        : officialComparisonWithoutQI_newT;

      return {
        thresholds: {
          current: {
            withQI: impact.currentThresholds.withQI,
            withoutQI: impact.currentThresholds.withoutQI,
          },
          projected: {
            withQI: impact.projectedThresholds.withQI,
            withoutQI: impact.projectedThresholds.withoutQI,
          },
          changes: {
            withQI: impact.thresholdChanges.withQI,
            withoutQI: impact.thresholdChanges.withoutQI,
          },
          officialComparison: {
            withQI: officialComparisonWithQI ? {
              ...officialComparisonWithQI,
              matchedScenario: {
                improvementMeasuresIncluded: true,
                newMeasuresIncluded: avgVarDiffNewF < avgVarDiffNewT ? false : true,
              },
            } : undefined,
            withoutQI: officialComparisonWithoutQI ? {
              ...officialComparisonWithoutQI,
              matchedScenario: {
                improvementMeasuresIncluded: false,
                newMeasuresIncluded: avgVarDiffNoQI_newF < avgVarDiffNoQI_newT ? false : true,
              },
            } : undefined,
          },
        },
        summary: {
          totalContracts: impact.contractResults.length,
          // Total contracts contributing to threshold calculation (ALL contracts)
          totalContractsWithQI: impact.stats.totalContractsWithQI,
          totalContractsWithoutQI: impact.stats.totalContractsWithoutQI,
          // Contracts USING each threshold set (based on hold harmless eligibility)
          contractsUsingWithQIThresholds: impact.stats.contractsUsingWithQIThresholds,
          contractsUsingWithoutQIThresholds: impact.stats.contractsUsingWithoutQIThresholds,
          contractsGainingRFactor: gains.length,
          contractsLosingRFactor: losses.length,
          contractsUnchanged: unchanged.length,
          avgRFactorChange: avgChange,
          // Hold harmless specific stats
          holdHarmlessGaining: holdHarmlessContracts.filter(c => c.rFactorChange > 0).length,
          holdHarmlessLosing: holdHarmlessContracts.filter(c => c.rFactorChange < 0).length,
          nonHoldHarmlessGaining: nonHoldHarmlessContracts.filter(c => c.rFactorChange > 0).length,
          nonHoldHarmlessLosing: nonHoldHarmlessContracts.filter(c => c.rFactorChange < 0).length,
        },
        distribution: {
          gainsBy0_4: gains.filter(c => c.rFactorChange >= 0.4).length,
          gainsBy0_3: gains.filter(c => c.rFactorChange >= 0.3 && c.rFactorChange < 0.4).length,
          gainsBy0_2: gains.filter(c => c.rFactorChange >= 0.2 && c.rFactorChange < 0.3).length,
          gainsBy0_1: gains.filter(c => c.rFactorChange > 0 && c.rFactorChange < 0.2).length,
          lossesBy0_1: losses.filter(c => c.rFactorChange > -0.2 && c.rFactorChange < 0).length,
          lossesBy0_2: losses.filter(c => c.rFactorChange <= -0.2 && c.rFactorChange > -0.3).length,
          lossesBy0_3: losses.filter(c => c.rFactorChange <= -0.3 && c.rFactorChange > -0.4).length,
          lossesBy0_4: losses.filter(c => c.rFactorChange <= -0.4).length,
        },
        // Include top 10 biggest changes in each direction
        topGainers: gains
          .sort((a, b) => b.rFactorChange - a.rFactorChange)
          .slice(0, 10)
          .map(c => ({
            contractId: c.contractId,
            hasHoldHarmless: c.hasHoldHarmless,
            currentRFactor: c.current.rFactor,
            projectedRFactor: c.projected.rFactor,
            change: c.rFactorChange,
            currentMean: c.current.weightedMean,
            projectedMean: c.projected.weightedMean,
            currentVariance: c.current.weightedVariance,
            projectedVariance: c.projected.weightedVariance,
          })),
        topLosers: losses
          .sort((a, b) => a.rFactorChange - b.rFactorChange)
          .slice(0, 10)
          .map(c => ({
            contractId: c.contractId,
            hasHoldHarmless: c.hasHoldHarmless,
            currentRFactor: c.current.rFactor,
            projectedRFactor: c.projected.rFactor,
            change: c.rFactorChange,
            currentMean: c.current.weightedMean,
            projectedMean: c.projected.weightedMean,
            currentVariance: c.current.weightedVariance,
            projectedVariance: c.projected.weightedVariance,
          })),
      };
    };

    const rewardFactorImpact = {
      overall: summarizeRewardFactorImpact(overallRewardFactorImpact, 'overall_mapd'),
      partC: summarizeRewardFactorImpact(partCRewardFactorImpact, 'part_c'),
      partD: summarizeRewardFactorImpact(partDRewardFactorImpact, 'part_d_mapd'),
    };

    // Add reward factor data to each contract analysis and calculate final projected ratings
    const overallRFactorMap = new Map(
      overallRewardFactorImpact.contractResults.map(c => [c.contractId, c])
    );
    const partCRFactorMap = new Map(
      partCRewardFactorImpact.contractResults.map(c => [c.contractId, c])
    );
    const partDRFactorMap = new Map(
      partDRewardFactorImpact.contractResults.map(c => [c.contractId, c])
    );
    
    const roundToHalf = (n: number) => Math.round(n * 2) / 2;
    const clampRating = (rating: number) => Math.min(5.0, Math.max(1.0, rating));

    for (const analysis of contractAnalyses) {
      const rfDataOverall = overallRFactorMap.get(analysis.contractId);
      const rfDataPartC = partCRFactorMap.get(analysis.contractId);
      const rfDataPartD = partDRFactorMap.get(analysis.contractId);

      if (rfDataOverall) {
        // Current rating with r-factor = CMS official or calculated mean + current r-factor
        const currentWithRFactor = clampRating(
          (analysis.currentOverallRating ?? rfDataOverall.current.weightedMean) 
        );
        // Projected rating with r-factor = projected mean + projected r-factor
        const projectedWithRFactor = clampRating(
          rfDataOverall.projected.weightedMean + rfDataOverall.projected.rFactor
        );
        
        analysis.finalProjectedOverall = projectedWithRFactor;
        analysis.finalOverallChange = currentWithRFactor !== null 
          ? projectedWithRFactor - currentWithRFactor 
          : null;
        
        const currentBracket = roundToHalf(currentWithRFactor);
        const finalProjectedBracket = roundToHalf(projectedWithRFactor);
        analysis.finalStarBracketChange = (finalProjectedBracket - currentBracket) * 2;
        
        analysis.rewardFactor = {
          currentRFactor: rfDataOverall.current.rFactor,
          projectedRFactor: rfDataOverall.projected.rFactor,
          rFactorChange: rfDataOverall.rFactorChange,
          currentMean: rfDataOverall.current.weightedMean,
          projectedMean: rfDataOverall.projected.weightedMean,
          currentVariance: rfDataOverall.current.weightedVariance,
          projectedVariance: rfDataOverall.projected.weightedVariance,
          currentAdjustedRating: clampRating(rfDataOverall.current.weightedMean + rfDataOverall.current.rFactor),
          projectedAdjustedRating: projectedWithRFactor,
        };
      }
      
      // Calculate final projected ratings for Part C and Part D
      if (rfDataPartC && analysis.projectedPartCRating !== null) {
        analysis.finalProjectedPartC = clampRating(
          rfDataPartC.projected.weightedMean + rfDataPartC.projected.rFactor
        );
      }
      
      if (rfDataPartD && analysis.projectedPartDRating !== null) {
        analysis.finalProjectedPartD = clampRating(
          rfDataPartD.projected.weightedMean + rfDataPartD.projected.rFactor
        );
      }
    }

    // Sort by final overall change (biggest gainers first)
    contractAnalyses.sort((a, b) => {
      const aChange = a.finalOverallChange ?? a.overallChange ?? -Infinity;
      const bChange = b.finalOverallChange ?? b.overallChange ?? -Infinity;
      return bChange - aChange;
    });

    // Calculate aggregate statistics (now including final projected ratings)
    const validAnalyses = contractAnalyses.filter(c => c.overallChange !== null);
    const totalContracts = validAnalyses.length;
    
    // Calculate average changes - use final change when available
    const avgOverallChange = totalContracts > 0
      ? validAnalyses.reduce((sum, c) => sum + (c.overallChange || 0), 0) / totalContracts
      : 0;
    const avgFinalOverallChange = validAnalyses.filter(c => c.finalOverallChange !== null).length > 0
      ? validAnalyses.reduce((sum, c) => sum + (c.finalOverallChange || 0), 0) / validAnalyses.filter(c => c.finalOverallChange !== null).length
      : null;
    
    const contractsGaining = validAnalyses.filter(c => (c.overallChange || 0) > 0.01).length;
    const contractsLosing = validAnalyses.filter(c => (c.overallChange || 0) < -0.01).length;
    const contractsUnchanged = totalContracts - contractsGaining - contractsLosing;
    
    const finalContractsGaining = validAnalyses.filter(c => (c.finalOverallChange || 0) > 0.01).length;
    const finalContractsLosing = validAnalyses.filter(c => (c.finalOverallChange || 0) < -0.01).length;

    const bracketGainers = validAnalyses.filter(c => c.starBracketChange > 0).length;
    const bracketLosers = validAnalyses.filter(c => c.starBracketChange < 0).length;
    const finalBracketGainers = validAnalyses.filter(c => c.finalStarBracketChange > 0).length;
    const finalBracketLosers = validAnalyses.filter(c => c.finalStarBracketChange < 0).length;
    
    // Hold harmless statistics
    const contractsWithHoldHarmless = validAnalyses.filter(c => c.holdHarmless?.applied).length;
    const contractsEligibleForHoldHarmless = validAnalyses.filter(c => c.holdHarmless !== undefined).length;

    // Star bracket transition distribution (e.g., "4.0★ → 3.5★")
    const bracketTransitions = new Map<string, { count: number; direction: 'gain' | 'loss' | 'unchanged' }>();
    
    for (const c of validAnalyses) {
      const currentBracket = c.currentOverallRating !== null ? roundToHalf(c.currentOverallRating) : null;
      const finalBracket = c.finalProjectedOverall !== null 
        ? roundToHalf(c.finalProjectedOverall) 
        : (c.projectedOverallRating !== null ? roundToHalf(c.projectedOverallRating) : null);
      
      if (currentBracket !== null && finalBracket !== null) {
        const change = finalBracket - currentBracket;
        let direction: 'gain' | 'loss' | 'unchanged' = 'unchanged';
        if (change > 0.01) direction = 'gain';
        else if (change < -0.01) direction = 'loss';
        
        const key = `${currentBracket.toFixed(1)}★ → ${finalBracket.toFixed(1)}★`;
        const existing = bracketTransitions.get(key) ?? { count: 0, direction };
        bracketTransitions.set(key, { count: existing.count + 1, direction });
      }
    }
    
    // Convert to sorted array, separating gains, unchanged, and losses
    const bracketTransitionArray = Array.from(bracketTransitions.entries())
      .map(([transition, data]) => ({ transition, ...data }))
      .sort((a, b) => {
        // Sort by direction (gains first, then unchanged, then losses), then by count descending
        const dirOrder = { gain: 0, unchanged: 1, loss: 2 };
        if (dirOrder[a.direction] !== dirOrder[b.direction]) {
          return dirOrder[a.direction] - dirOrder[b.direction];
        }
        return b.count - a.count;
      });
    
    // Count by half-star change amount
    const bracketChangeDistribution = {
      '+1.0★': validAnalyses.filter(c => c.finalStarBracketChange === 2).length,
      '+0.5★': validAnalyses.filter(c => c.finalStarBracketChange === 1).length,
      'No change': validAnalyses.filter(c => c.finalStarBracketChange === 0).length,
      '-0.5★': validAnalyses.filter(c => c.finalStarBracketChange === -1).length,
      '-1.0★': validAnalyses.filter(c => c.finalStarBracketChange === -2).length,
      '-1.5★': validAnalyses.filter(c => c.finalStarBracketChange === -3).length,
      '-2.0★+': validAnalyses.filter(c => c.finalStarBracketChange <= -4).length,
    };

    // Build parent org analysis (after reward factor data is added)
    const parentOrgMap = new Map<string, ContractAnalysis[]>();
    for (const analysis of validAnalyses) {
      const parent = analysis.parentOrganization?.trim() || 'Unknown';
      if (!parentOrgMap.has(parent)) {
        parentOrgMap.set(parent, []);
      }
      parentOrgMap.get(parent)!.push(analysis);
    }

    const parentOrganizations: ParentOrgAnalysis[] = Array.from(parentOrgMap.entries())
      .map(([parentOrganization, analyses]) => {
        const withRatings = analyses.filter(a => a.currentOverallRating !== null && a.projectedOverallRating !== null);
        const withFinalRatings = analyses.filter(a => a.currentOverallRating !== null && a.finalProjectedOverall !== null);
        
        const avgCurrent = withRatings.length > 0
          ? withRatings.reduce((sum, a) => sum + (a.currentOverallRating || 0), 0) / withRatings.length
          : null;
        const avgProjected = withRatings.length > 0
          ? withRatings.reduce((sum, a) => sum + (a.projectedOverallRating || 0), 0) / withRatings.length
          : null;
        const avgFinalProjected = withFinalRatings.length > 0
          ? withFinalRatings.reduce((sum, a) => sum + (a.finalProjectedOverall || 0), 0) / withFinalRatings.length
          : null;
        const avgChange = withRatings.length > 0
          ? withRatings.reduce((sum, a) => sum + (a.overallChange || 0), 0) / withRatings.length
          : null;
        const avgFinalChange = withFinalRatings.length > 0
          ? withFinalRatings.reduce((sum, a) => sum + (a.finalOverallChange || 0), 0) / withFinalRatings.length
          : null;

        return {
          parentOrganization,
          contractCount: analyses.length,
          avgCurrentRating: avgCurrent,
          avgProjectedRating: avgProjected,
          avgFinalProjectedRating: avgFinalProjected,
          avgOverallChange: avgChange,
          avgFinalOverallChange: avgFinalChange,
          contractsGaining: analyses.filter(a => (a.overallChange || 0) > 0.01).length,
          contractsLosing: analyses.filter(a => (a.overallChange || 0) < -0.01).length,
          bracketGainers: analyses.filter(a => a.starBracketChange > 0).length,
          bracketLosers: analyses.filter(a => a.starBracketChange < 0).length,
          finalBracketGainers: analyses.filter(a => a.finalStarBracketChange > 0).length,
          finalBracketLosers: analyses.filter(a => a.finalStarBracketChange < 0).length,
        };
      })
      .filter(p => p.contractCount > 1) // Only show parent orgs with more than one contract
      .sort((a, b) => (b.avgFinalOverallChange || b.avgOverallChange || -Infinity) - (a.avgFinalOverallChange || a.avgOverallChange || -Infinity));

    return NextResponse.json({
      year,
      domains: Array.from(allDomains.values()).sort((a, b) => a.domain.localeCompare(b.domain)),
      removedMeasures,
      removedMeasuresSummary: {
        count: removedMeasures.length,
        totalWeight: totalRemovedWeight,
      },
      // Quality improvement measures subject to hold harmless
      qualityImprovementMeasures: {
        codes: Array.from(QUALITY_IMPROVEMENT_MEASURES),
        threshold: HOLD_HARMLESS_THRESHOLD,
      },
      holdHarmlessSummary: {
        contractsWithHoldHarmless,
        contractsEligibleForHoldHarmless,
        description: `If a contract's projected rating would be ≥${HOLD_HARMLESS_THRESHOLD} stars without quality improvement measures, but including them would drop the rating below ${HOLD_HARMLESS_THRESHOLD} stars, then QI measures are excluded.`,
      },
      summary: {
        totalContracts,
        avgOverallChange,
        avgFinalOverallChange,
        contractsGaining,
        contractsLosing,
        contractsUnchanged,
        finalContractsGaining,
        finalContractsLosing,
        bracketGainers,
        bracketLosers,
        finalBracketGainers,
        finalBracketLosers,
        bracketChangeDistribution,
        bracketTransitions: bracketTransitionArray,
        totalParentOrgs: parentOrganizations.length,
        contractsWithHoldHarmless,
      },
      contracts: contractAnalyses,
      parentOrganizations,
      rewardFactorImpact,
    });
  } catch (error) {
    console.error('Operations impact analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze operations measures impact', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
