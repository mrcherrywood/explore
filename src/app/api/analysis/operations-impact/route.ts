import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  analyzeRewardFactorImpact,
  compareWithOfficial,
  type ContractMeasure,
} from '@/lib/reward-factor';

export const dynamic = 'force-dynamic';

// CMS measures being removed from Star Ratings calculation
// Based on CMS announcement for 2028-2029 Stars
const CMS_REMOVED_MEASURE_CODES = new Set([
  // C: Plan Makes Timely Decisions about Appeals – 2029 Stars
  'C31',
  // C: Reviewing Appeals Decisions – 2029 Stars
  'C32',
  // C: Special Needs Plan (SNP) Care Management – 2029 Stars
  'C07',
  // C: Call Center – Foreign Language Interpreter and TTY Availability – 2028 Stars
  'C33',
  // D: Call Center – Foreign Language Interpreter and TTY Availability – 2028 Stars
  'D01',
  // C: Complaints about the Health Plan – 2029 Stars
  'C28',
  // D: Complaints about the Drug Plan – 2029 Stars
  'D02',
  // D: Medicare Plan Finder Price Accuracy – 2029 Stars
  'D07',
  // C: Diabetes Care – Eye Exam – 2029 Stars
  'C11',
  // C: Statin Therapy for Patients with Cardiovascular Disease – 2028 Stars
  'C19',
  // C: Members Choosing to Leave the Plan – 2029 Stars
  'C29',
  // D: Members Choosing to Leave the Plan – 2029 Stars
  'D03',
  // C: Customer Service – 2029 Stars
  'C24',
  // C: Rating of Health Care Quality – 2029 Stars
  'C25',
]);

function isMeasureBeingRemoved(code: string): boolean {
  return CMS_REMOVED_MEASURE_CODES.has(code.trim().toUpperCase());
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
      .eq('year', year) as { data: MeasureRow[] | null; error: typeof measuresError };

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
      let currentOverallWeighted = 0;
      let currentOverallWeight = 0;
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
        currentOverallWeighted += starValue * weight;
        currentOverallWeight += weight;
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

      // Use CMS official ratings if available, otherwise calculate
      const cmsRatings = summaryRatingsMap.get(contractId);
      const currentOverall = cmsRatings?.overall ?? (currentOverallWeight > 0 ? currentOverallWeighted / currentOverallWeight : null);
      const currentPartC = cmsRatings?.partC ?? (currentPartCWeight > 0 ? currentPartCWeighted / currentPartCWeight : null);
      const currentPartD = cmsRatings?.partD ?? (currentPartDWeight > 0 ? currentPartDWeighted / currentPartDWeight : null);

      const projectedOverall = projectedOverallWeight > 0 ? projectedOverallWeighted / projectedOverallWeight : null;
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
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    const totalRemovedWeight = removedMeasures.reduce((sum, m) => sum + m.weight, 0);

    // Build contract measures data for reward factor analysis
    const contractMeasuresData = new Map<string, ContractMeasure[]>();
    for (const [contractId, contractMetrics] of metricsByContract) {
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

    // Analyze reward factor impact for overall ratings
    const overallRewardFactorImpact = analyzeRewardFactorImpact(
      contractMeasuresData,
      CMS_REMOVED_MEASURE_CODES,
      'overall_mapd',
      null
    );

    // Analyze reward factor impact for Part C
    const partCRewardFactorImpact = analyzeRewardFactorImpact(
      contractMeasuresData,
      CMS_REMOVED_MEASURE_CODES,
      'part_c',
      'Part C'
    );

    // Analyze reward factor impact for Part D
    const partDRewardFactorImpact = analyzeRewardFactorImpact(
      contractMeasuresData,
      CMS_REMOVED_MEASURE_CODES,
      'part_d_mapd',
      'Part D'
    );

    // Summarize reward factor impact
    const summarizeRewardFactorImpact = (
      impact: ReturnType<typeof analyzeRewardFactorImpact>,
      ratingType: 'overall_mapd' | 'part_c' | 'part_d_mapd'
    ) => {
      const gains = impact.contractResults.filter(c => c.rFactorChange > 0);
      const losses = impact.contractResults.filter(c => c.rFactorChange < 0);
      const unchanged = impact.contractResults.filter(c => c.rFactorChange === 0);
      
      const avgChange = impact.contractResults.length > 0
        ? impact.contractResults.reduce((sum, c) => sum + c.rFactorChange, 0) / impact.contractResults.length
        : 0;

      // Compare current thresholds with official CMS thresholds
      const officialComparison = compareWithOfficial(
        impact.currentThresholds,
        ratingType,
        true, // improvement measures included
        true  // new measures included
      );

      return {
        thresholds: {
          current: impact.currentThresholds,
          projected: impact.projectedThresholds,
          changes: impact.thresholdChanges,
          officialComparison: officialComparison ?? undefined,
        },
        summary: {
          totalContracts: impact.contractResults.length,
          contractsGainingRFactor: gains.length,
          contractsLosingRFactor: losses.length,
          contractsUnchanged: unchanged.length,
          avgRFactorChange: avgChange,
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
      .filter(p => p.contractCount > 0)
      .sort((a, b) => (b.avgFinalOverallChange || b.avgOverallChange || -Infinity) - (a.avgFinalOverallChange || a.avgOverallChange || -Infinity));

    return NextResponse.json({
      year,
      domains: Array.from(allDomains.values()).sort((a, b) => a.domain.localeCompare(b.domain)),
      removedMeasures,
      removedMeasuresSummary: {
        count: removedMeasures.length,
        totalWeight: totalRemovedWeight,
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
