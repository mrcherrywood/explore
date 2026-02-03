import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// UnitedHealth Group pattern for parent_organization matching
function isUnitedHealthContract(parentOrg: string | null): boolean {
  if (!parentOrg) return false;
  const normalized = parentOrg.toLowerCase().trim();
  
  if (normalized.includes("unitedhealthgroup") || 
      normalized.includes("unitedhealth group") ||
      normalized.includes("unitedhealthcare") ||
      normalized.startsWith("unitedhealth,") ||
      normalized === "unitedhealth" ||
      normalized.includes("unitedhealth, inc") ||
      normalized.includes("unitedhealth ins")) {
    return true;
  }
  
  if (/\bunitedhealth\s+group\b/i.test(parentOrg)) {
    return true;
  }
  
  return false;
}

// Threshold in points - how close to a cut point to be considered at risk/opportunity
const PROXIMITY_THRESHOLD = 2.0;

type MeasureCutPoints = {
  measureCode: string;
  measureName: string;
  domain: string | null;
  // Cut points derived from data: the minimum score observed for each star rating
  // starCutPoints[5] = minimum score for 5-star rating
  starCutPoints: Record<string, number | null>;
  // Total contracts with data for this measure
  totalContracts: number;
};

type ContractMeasureAnalysis = {
  contractId: string;
  parentOrganization: string | null;
  measureCode: string;
  measureName: string;
  domain: string | null;
  score: number;
  starRating: number;
  // Risk: close to dropping to a lower star
  isRisk: boolean;
  riskPoints: number | null; // How many points above the lower cut point
  // Opportunity: close to gaining a higher star
  isOpportunity: boolean;
  opportunityPoints: number | null; // How many points below the upper cut point
  // Cut points for context
  lowerCutPoint: number | null;
  upperCutPoint: number | null;
  // Measure type flags for highlighting
  isHEDIS: boolean;
  isPharmacy: boolean;
};

// Helper function to determine if a measure is HEDIS
function isHEDISMeasure(domain: string | null): boolean {
  if (!domain) return false;
  const normalizedDomain = domain.toLowerCase().trim();
  return normalizedDomain === 'hedis' || normalizedDomain.includes('hedis');
}

// Helper function to determine if a measure is a Pharmacy measure
// Pharmacy measures are Part D measures related to medication adherence, drug safety, etc.
function isPharmacyMeasure(domain: string | null, measureCode: string): boolean {
  if (!domain && !measureCode) return false;
  const normalizedDomain = (domain || '').toLowerCase().trim();
  const normalizedCode = measureCode.toUpperCase().trim();
  
  // Check if domain contains pharmacy-related terms
  if (normalizedDomain.includes('pharmacy') || 
      normalizedDomain.includes('drug') ||
      normalizedDomain.includes('medication')) {
    return true;
  }
  
  // Part D measures that are specifically pharmacy/medication related
  // D08-D12 are the medication adherence and statin measures
  const pharmacyMeasureCodes = new Set([
    'D08', // Medication Adherence for Diabetes Medications
    'D09', // Medication Adherence for Hypertension (RAS antagonists)
    'D10', // Medication Adherence for Cholesterol (Statins)
    'D11', // MTM Program Completion Rate for CMR
    'D12', // Statin Use in Persons with Diabetes (SUPD)
  ]);
  
  return pharmacyMeasureCodes.has(normalizedCode);
}

type RiskOpportunitySummary = {
  year: number;
  uhcContractCount: number;
  totalMeasuresAnalyzed: number;
  // By contract: how many risk/opportunity measures each contract has
  byContract: {
    contractId: string;
    parentOrganization: string | null;
    riskMeasures: ContractMeasureAnalysis[];
    opportunityMeasures: ContractMeasureAnalysis[];
    totalRiskCount: number;
    totalOpportunityCount: number;
  }[];
  // Overall stats
  totalRiskMeasures: number;
  totalOpportunityMeasures: number;
  // Cut points used for analysis
  measureCutPoints: MeasureCutPoints[];
};

export async function GET() {
  try {
    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("Risk/Opportunity API configuration error:", clientError);
      return NextResponse.json(
        { error: "Supabase credentials not configured", code: "SUPABASE_CONFIG_MISSING" },
        { status: 503 }
      );
    }

    // Get the most recent year with data
    const yearsQuery = `
      SELECT DISTINCT year 
      FROM summary_ratings 
      WHERE year IS NOT NULL AND overall_rating_numeric IS NOT NULL 
      ORDER BY year DESC 
      LIMIT 1
    `;
    const { data: yearsResult, error: yearsError } = await (
      supabase.rpc as unknown as <T>(
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: T | null; error: Error | null }>
    )("exec_raw_sql", { query: yearsQuery });

    if (yearsError) throw new Error(yearsError.message);

    const latestYear = ((yearsResult ?? []) as { year: number }[])[0]?.year;
    if (!latestYear) {
      return NextResponse.json({ error: "No rated contracts data available" }, { status: 404 });
    }

    console.log(`Analyzing risk/opportunity for year: ${latestYear}`);

    // Get rated contracts for the latest year
    type RatedContractRow = { 
      contract_id: string; 
      parent_organization: string | null; 
    };
    
    const ratedContractsQuery = `
      SELECT contract_id, parent_organization
      FROM summary_ratings 
      WHERE year = ${latestYear}
        AND overall_rating_numeric IS NOT NULL
    `;
    
    const { data: ratedContractsResult, error: ratedContractsError } = await (
      supabase.rpc as unknown as <T>(
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: T | null; error: Error | null }>
    )("exec_raw_sql", { query: ratedContractsQuery });

    if (ratedContractsError) throw new Error(ratedContractsError.message);

    const ratedContractRows = (ratedContractsResult ?? []) as RatedContractRow[];
    
    // Build map of UHC contracts
    const uhcContracts = new Map<string, string | null>();
    const allRatedContractIds = new Set<string>();
    
    ratedContractRows.forEach((row) => {
      const contractId = row.contract_id.trim().toUpperCase();
      allRatedContractIds.add(contractId);
      if (isUnitedHealthContract(row.parent_organization)) {
        uhcContracts.set(contractId, row.parent_organization);
      }
    });

    console.log(`Found ${uhcContracts.size} UHC contracts out of ${allRatedContractIds.size} total`);

    // Get measure metadata
    type MeasureRow = { code: string; name: string | null; domain: string | null };
    const measuresQuery = `
      SELECT code, name, domain
      FROM ma_measures
      WHERE year = ${latestYear}
    `;
    
    const { data: measuresResult, error: measuresError } = await (
      supabase.rpc as unknown as <T>(
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: T | null; error: Error | null }>
    )("exec_raw_sql", { query: measuresQuery });

    if (measuresError) throw new Error(measuresError.message);

    const measureMeta = new Map<string, { name: string; domain: string | null }>();
    ((measuresResult ?? []) as MeasureRow[]).forEach((m) => {
      measureMeta.set(m.code, { name: m.name || m.code, domain: m.domain });
    });

    // Get all metrics with both star rating and rate_percent for the latest year
    type MetricRow = {
      contract_id: string;
      metric_code: string;
      star_rating: string | null;
      rate_percent: number | null;
    };

    const metricsQuery = `
      SELECT contract_id, metric_code, star_rating, rate_percent
      FROM ma_metrics
      WHERE year = ${latestYear}
        AND star_rating IS NOT NULL 
        AND star_rating != ''
        AND rate_percent IS NOT NULL
    `;

    const { data: metricsResult, error: metricsError } = await (
      supabase.rpc as unknown as <T>(
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: T | null; error: Error | null }>
    )("exec_raw_sql", { query: metricsQuery });

    if (metricsError) throw new Error(metricsError.message);

    const allMetrics = (metricsResult ?? []) as MetricRow[];
    console.log(`Fetched ${allMetrics.length} metrics with both star and score data`);

    // Calculate cut points for each measure based on actual data
    // For each star rating level, find the minimum score observed
    const measureScoresByStarMap = new Map<string, Map<string, number[]>>();
    
    allMetrics.forEach((metric) => {
      const contractId = metric.contract_id.trim().toUpperCase();
      if (!allRatedContractIds.has(contractId)) return;
      if (metric.rate_percent === null || !Number.isFinite(metric.rate_percent)) return;
      
      const starValue = parseFloat(metric.star_rating || '0');
      if (!Number.isFinite(starValue) || starValue < 1 || starValue > 5) return;
      const starBucket = Math.round(starValue).toString();
      
      if (!measureScoresByStarMap.has(metric.metric_code)) {
        measureScoresByStarMap.set(metric.metric_code, new Map());
      }
      const starMap = measureScoresByStarMap.get(metric.metric_code)!;
      
      if (!starMap.has(starBucket)) {
        starMap.set(starBucket, []);
      }
      starMap.get(starBucket)!.push(metric.rate_percent);
    });

    // Build cut points for each measure
    // The cut point for star N is the minimum score observed at that star level
    const measureCutPoints: MeasureCutPoints[] = [];
    
    measureScoresByStarMap.forEach((starMap, measureCode) => {
      const meta = measureMeta.get(measureCode);
      const cutPoints: Record<string, number | null> = {
        "1": null, "2": null, "3": null, "4": null, "5": null
      };
      
      let totalContracts = 0;
      
      (["1", "2", "3", "4", "5"] as const).forEach((star) => {
        const scores = starMap.get(star);
        if (scores && scores.length > 0) {
          cutPoints[star] = Math.min(...scores);
          totalContracts += scores.length;
        }
      });
      
      // Only include measures with at least 2 star levels represented
      const levelsWithData = Object.values(cutPoints).filter(v => v !== null).length;
      if (levelsWithData >= 2) {
        measureCutPoints.push({
          measureCode,
          measureName: meta?.name || measureCode,
          domain: meta?.domain || null,
          starCutPoints: cutPoints,
          totalContracts,
        });
      }
    });

    console.log(`Calculated cut points for ${measureCutPoints.length} measures`);

    // Build a lookup map for cut points
    const cutPointsLookup = new Map<string, Record<string, number | null>>();
    measureCutPoints.forEach((m) => {
      cutPointsLookup.set(m.measureCode, m.starCutPoints);
    });

    // Now analyze each UHC contract's measures for risk/opportunity
    const contractAnalysisMap = new Map<string, {
      parentOrganization: string | null;
      riskMeasures: ContractMeasureAnalysis[];
      opportunityMeasures: ContractMeasureAnalysis[];
    }>();

    // Initialize UHC contracts
    uhcContracts.forEach((parentOrg, contractId) => {
      contractAnalysisMap.set(contractId, {
        parentOrganization: parentOrg,
        riskMeasures: [],
        opportunityMeasures: [],
      });
    });

    // Analyze each metric for UHC contracts
    let totalRiskMeasures = 0;
    let totalOpportunityMeasures = 0;

    allMetrics.forEach((metric) => {
      const contractId = metric.contract_id.trim().toUpperCase();
      
      // Only analyze UHC contracts
      if (!contractAnalysisMap.has(contractId)) return;
      
      const cutPoints = cutPointsLookup.get(metric.metric_code);
      if (!cutPoints) return;
      
      const score = metric.rate_percent;
      if (score === null || !Number.isFinite(score)) return;
      
      const starValue = parseFloat(metric.star_rating || '0');
      if (!Number.isFinite(starValue) || starValue < 1 || starValue > 5) return;
      const currentStar = Math.round(starValue);
      
      const meta = measureMeta.get(metric.metric_code);
      const contractData = contractAnalysisMap.get(contractId)!;
      
      // Get lower cut point (for current star rating)
      const lowerCutPoint = cutPoints[currentStar.toString()] ?? null;
      
      // Get upper cut point (for next star rating)
      const upperCutPoint = currentStar < 5 ? cutPoints[(currentStar + 1).toString()] : null;
      
      // Check for Risk: within threshold of lower cut point
      let isRisk = false;
      let riskPoints: number | null = null;
      if (lowerCutPoint !== null) {
        const pointsAboveLower = score - lowerCutPoint;
        if (pointsAboveLower >= 0 && pointsAboveLower <= PROXIMITY_THRESHOLD) {
          isRisk = true;
          riskPoints = Math.round(pointsAboveLower * 10) / 10;
        }
      }
      
      // Check for Opportunity: within threshold of upper cut point
      let isOpportunity = false;
      let opportunityPoints: number | null = null;
      if (upperCutPoint !== null) {
        const pointsBelowUpper = upperCutPoint - score;
        if (pointsBelowUpper > 0 && pointsBelowUpper <= PROXIMITY_THRESHOLD) {
          isOpportunity = true;
          opportunityPoints = Math.round(pointsBelowUpper * 10) / 10;
        }
      }
      
      // Add to analysis if risk or opportunity
      if (isRisk || isOpportunity) {
        const domain = meta?.domain || null;
        const analysis: ContractMeasureAnalysis = {
          contractId,
          parentOrganization: contractData.parentOrganization,
          measureCode: metric.metric_code,
          measureName: meta?.name || metric.metric_code,
          domain,
          score: Math.round(score * 10) / 10,
          starRating: currentStar,
          isRisk,
          riskPoints,
          isOpportunity,
          opportunityPoints,
          lowerCutPoint: lowerCutPoint !== null ? Math.round(lowerCutPoint * 10) / 10 : null,
          upperCutPoint: upperCutPoint !== null ? Math.round(upperCutPoint * 10) / 10 : null,
          isHEDIS: isHEDISMeasure(domain),
          isPharmacy: isPharmacyMeasure(domain, metric.metric_code),
        };
        
        if (isRisk) {
          contractData.riskMeasures.push(analysis);
          totalRiskMeasures++;
        }
        if (isOpportunity) {
          contractData.opportunityMeasures.push(analysis);
          totalOpportunityMeasures++;
        }
      }
    });

    // Build response
    const byContract = Array.from(contractAnalysisMap.entries())
      .map(([contractId, data]) => ({
        contractId,
        parentOrganization: data.parentOrganization,
        riskMeasures: data.riskMeasures.sort((a, b) => (a.riskPoints ?? 999) - (b.riskPoints ?? 999)),
        opportunityMeasures: data.opportunityMeasures.sort((a, b) => (a.opportunityPoints ?? 999) - (b.opportunityPoints ?? 999)),
        totalRiskCount: data.riskMeasures.length,
        totalOpportunityCount: data.opportunityMeasures.length,
      }))
      // Sort by total risk + opportunity count descending
      .sort((a, b) => (b.totalRiskCount + b.totalOpportunityCount) - (a.totalRiskCount + a.totalOpportunityCount));

    const response: RiskOpportunitySummary = {
      year: latestYear,
      uhcContractCount: uhcContracts.size,
      totalMeasuresAnalyzed: measureCutPoints.length,
      byContract,
      totalRiskMeasures,
      totalOpportunityMeasures,
      measureCutPoints: measureCutPoints.sort((a, b) => a.measureName.localeCompare(b.measureName)),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Risk/Opportunity API error:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze risk/opportunity measures",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
