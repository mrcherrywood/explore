import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// UnitedHealth Group pattern for parent_organization matching
// Be specific to avoid false positives like "West Virginia United Health System"
function isUnitedHealthContract(parentOrg: string | null): boolean {
  if (!parentOrg) return false;
  const normalized = parentOrg.toLowerCase().trim();
  
  // Must match UnitedHealth Group or UnitedHealthcare specifically
  // "unitedhealth" as one word (not "united health" with space)
  if (normalized.includes("unitedhealthgroup") || 
      normalized.includes("unitedhealth group") ||
      normalized.includes("unitedhealthcare") ||
      normalized.startsWith("unitedhealth,") ||
      normalized === "unitedhealth" ||
      normalized.includes("unitedhealth, inc") ||
      normalized.includes("unitedhealth ins")) {
    return true;
  }
  
  // Check for exact "UnitedHealth Group" pattern
  if (/\bunitedhealth\s+group\b/i.test(parentOrg)) {
    return true;
  }
  
  return false;
}

type StarDistribution = {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
  total: number;
};

type ScoreStats = {
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
  scores: number[]; // For calculating percentiles if needed
};

type ScoresByStarRating = {
  "1": ScoreStats;
  "2": ScoreStats;
  "3": ScoreStats;
  "4": ScoreStats;
  "5": ScoreStats;
};

type MeasureComparison = {
  measureCode: string;
  measureName: string;
  domain: string | null;
  year: number;
  uhc: StarDistribution;
  market: StarDistribution;
  uhcPercentages: Record<string, number>;
  marketPercentages: Record<string, number>;
  uhcScores: ScoreStats;
  marketScores: ScoreStats;
  uhcScoresByStar: ScoresByStarRating;
  marketScoresByStar: ScoresByStarRating;
};

type YearSummary = {
  year: number;
  uhcContractCount: number;
  marketContractCount: number;
  measures: MeasureComparison[];
};

function calculatePercentages(dist: StarDistribution): Record<string, number> {
  if (dist.total === 0) {
    return { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  }
  return {
    "1": (dist["1"] / dist.total) * 100,
    "2": (dist["2"] / dist.total) * 100,
    "3": (dist["3"] / dist.total) * 100,
    "4": (dist["4"] / dist.total) * 100,
    "5": (dist["5"] / dist.total) * 100,
  };
}

function createEmptyDistribution(): StarDistribution {
  return { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, total: 0 };
}

function createEmptyScoreStats(): ScoreStats {
  return { avg: null, min: null, max: null, count: 0, scores: [] };
}

function calculateScoreStats(scores: number[]): ScoreStats {
  if (scores.length === 0) {
    return createEmptyScoreStats();
  }
  
  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = sum / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  
  return {
    avg: Math.round(avg * 100) / 100, // Round to 2 decimal places
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    count: scores.length,
    scores: scores.sort((a, b) => a - b), // Sort for potential percentile calculations
  };
}

// Helper to fetch all rows with pagination
async function fetchAllRows<T>(
  supabase: ReturnType<typeof createServiceRoleClient>,
  tableName: string,
  selectColumns: string,
  filters: { column: string; operator: string; value: unknown }[] = [],
  orderBy?: { column: string; ascending: boolean }
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const allRows: T[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from(tableName)
      .select(selectColumns)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    // Apply filters
    for (const filter of filters) {
      if (filter.operator === "in") {
        query = query.in(filter.column, filter.value as unknown[]);
      } else if (filter.operator === "not.is") {
        query = query.not(filter.column, "is", filter.value as null);
      } else if (filter.operator === "eq") {
        query = query.eq(filter.column, filter.value as string | number);
      }
    }

    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending });
    }

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as T[];
    allRows.push(...rows);

    hasMore = rows.length === PAGE_SIZE;
    page++;
  }

  return allRows;
}

export async function GET() {
  try {
    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("UHC comparison API configuration error:", clientError);
      return NextResponse.json(
        { error: "Supabase credentials not configured", code: "SUPABASE_CONFIG_MISSING" },
        { status: 503 }
      );
    }

    // Get all available years from summary_ratings (contracts with overall star ratings)
    const yearsQuery = `SELECT DISTINCT year FROM summary_ratings WHERE year IS NOT NULL AND overall_rating_numeric IS NOT NULL ORDER BY year DESC`;
    const { data: yearsResult, error: yearsError } = await (
      supabase.rpc as unknown as <T>(
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: T | null; error: Error | null }>
    )("exec_raw_sql", { query: yearsQuery });

    if (yearsError) throw new Error(yearsError.message);

    const allYearsWithRatings = ((yearsResult ?? []) as { year: number }[]).map((r) => r.year);
    console.log(`All years in summary_ratings with overall ratings: ${allYearsWithRatings.join(", ")}`);

    // Take the last 2 years
    const uniqueYears = allYearsWithRatings.slice(0, 2);

    if (uniqueYears.length === 0) {
      return NextResponse.json({ error: "No rated contracts data available" }, { status: 404 });
    }

    console.log(`Fetching data for years: ${uniqueYears.join(", ")}`);

    // Get contracts that have OVERALL STAR RATINGS from summary_ratings
    // This is the source of truth for which contracts are "rated"
    type RatedContractRow = { 
      contract_id: string; 
      parent_organization: string | null; 
      year: number;
      overall_rating_numeric: number | null;
    };
    
    const ratedContractsQuery = `
      SELECT contract_id, parent_organization, year, overall_rating_numeric
      FROM summary_ratings 
      WHERE year IN (${uniqueYears.join(", ")})
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
    console.log(`Fetched ${ratedContractRows.length} contracts with overall star ratings`);

    // Build maps of UHC and market RATED contracts by year
    const uhcContractsByYear = new Map<number, Set<string>>();
    const marketContractsByYear = new Map<number, Set<string>>();

    uniqueYears.forEach((year) => {
      uhcContractsByYear.set(year, new Set());
      marketContractsByYear.set(year, new Set());
    });

    ratedContractRows.forEach((row) => {
      const contractId = row.contract_id.trim().toUpperCase();
      if (isUnitedHealthContract(row.parent_organization)) {
        uhcContractsByYear.get(row.year)?.add(contractId);
      } else {
        marketContractsByYear.get(row.year)?.add(contractId);
      }
    });

    // Log rated contract counts
    uniqueYears.forEach((year) => {
      const uhcCount = uhcContractsByYear.get(year)?.size ?? 0;
      const marketCount = marketContractsByYear.get(year)?.size ?? 0;
      console.log(`Year ${year} RATED CONTRACTS: UHC=${uhcCount}, Market=${marketCount}`);
    });

    // Get ALL measure metadata
    type MeasureRow = { code: string; name: string | null; domain: string | null; year: number };
    const measureRows = await fetchAllRows<MeasureRow>(
      supabase,
      "ma_measures",
      "code, name, domain, year",
      [{ column: "year", operator: "in", value: uniqueYears }],
      { column: "year", ascending: false }
    );

    console.log(`Fetched ${measureRows.length} measure definitions`);

    // Build measure metadata map (latest year takes precedence)
    const measureMeta = new Map<string, { name: string; domain: string | null }>();
    measureRows.forEach((m) => {
      if (!measureMeta.has(m.code)) {
        measureMeta.set(m.code, { name: m.name || m.code, domain: m.domain });
      }
    });

    // Build set of all rated contract IDs for filtering metrics
    const allRatedContractIds = new Set<string>();
    ratedContractRows.forEach((row) => {
      allRatedContractIds.add(row.contract_id.trim().toUpperCase());
    });

    // Get star ratings and measure scores ONLY for contracts that have overall ratings
    type MetricRow = {
      contract_id: string;
      metric_code: string;
      star_rating: string | null;
      rate_percent: number | null;
      year: number;
    };

    const metricsQuery = `
      SELECT contract_id, metric_code, star_rating, rate_percent, year
      FROM ma_metrics
      WHERE year IN (${uniqueYears.join(", ")})
        AND (star_rating IS NOT NULL AND star_rating != '' OR rate_percent IS NOT NULL)
    `;

    const { data: metricsResult, error: metricsError } = await (
      supabase.rpc as unknown as <T>(
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: T | null; error: Error | null }>
    )("exec_raw_sql", { query: metricsQuery });

    if (metricsError) throw new Error(metricsError.message);

    const allMetrics = (metricsResult ?? []) as MetricRow[];
    console.log(`Fetched ${allMetrics.length} total metric records`);

    // Build distribution by year and measure - ONLY for contracts with overall ratings
    type YearMeasureKey = string;
    const getKey = (year: number, code: string): YearMeasureKey => `${year}|${code}`;

    const uhcDistributions = new Map<YearMeasureKey, StarDistribution>();
    const marketDistributions = new Map<YearMeasureKey, StarDistribution>();
    const uhcScoresMap = new Map<YearMeasureKey, number[]>();
    const marketScoresMap = new Map<YearMeasureKey, number[]>();
    // Track scores by star rating
    const uhcScoresByStarMap = new Map<YearMeasureKey, Record<string, number[]>>();
    const marketScoresByStarMap = new Map<YearMeasureKey, Record<string, number[]>>();

    let includedMetrics = 0;
    let excludedMetrics = 0;

    allMetrics.forEach((metric) => {
      const contractId = metric.contract_id.trim().toUpperCase();
      
      // ONLY include metrics for contracts that have overall star ratings
      if (!allRatedContractIds.has(contractId)) {
        excludedMetrics++;
        return;
      }
      
      includedMetrics++;

      const key = getKey(metric.year, metric.metric_code);
      const isUHC = uhcContractsByYear.get(metric.year)?.has(contractId);
      const isMarket = marketContractsByYear.get(metric.year)?.has(contractId);

      // Determine star bucket if star rating is available
      let starBucket: "1" | "2" | "3" | "4" | "5" | null = null;
      if (metric.star_rating) {
        const starValue = parseFloat(metric.star_rating);
        if (Number.isFinite(starValue) && starValue >= 1 && starValue <= 5) {
          const bucket = Math.round(starValue).toString();
          if (["1", "2", "3", "4", "5"].includes(bucket)) {
            starBucket = bucket as "1" | "2" | "3" | "4" | "5";
          }
        }
      }

      // Process star rating distribution
      if (starBucket) {
        if (isUHC) {
          if (!uhcDistributions.has(key)) {
            uhcDistributions.set(key, createEmptyDistribution());
          }
          const dist = uhcDistributions.get(key)!;
          dist[starBucket]++;
          dist.total++;
        } else if (isMarket) {
          if (!marketDistributions.has(key)) {
            marketDistributions.set(key, createEmptyDistribution());
          }
          const dist = marketDistributions.get(key)!;
          dist[starBucket]++;
          dist.total++;
        }
      }

      // Process measure score (rate_percent) if available
      if (metric.rate_percent !== null && Number.isFinite(metric.rate_percent)) {
        // Track overall scores
        if (isUHC) {
          if (!uhcScoresMap.has(key)) {
            uhcScoresMap.set(key, []);
          }
          uhcScoresMap.get(key)!.push(metric.rate_percent);
          
          // Track scores by star rating if we have both score and star
          if (starBucket) {
            if (!uhcScoresByStarMap.has(key)) {
              uhcScoresByStarMap.set(key, { "1": [], "2": [], "3": [], "4": [], "5": [] });
            }
            uhcScoresByStarMap.get(key)![starBucket].push(metric.rate_percent);
          }
        } else if (isMarket) {
          if (!marketScoresMap.has(key)) {
            marketScoresMap.set(key, []);
          }
          marketScoresMap.get(key)!.push(metric.rate_percent);
          
          // Track scores by star rating if we have both score and star
          if (starBucket) {
            if (!marketScoresByStarMap.has(key)) {
              marketScoresByStarMap.set(key, { "1": [], "2": [], "3": [], "4": [], "5": [] });
            }
            marketScoresByStarMap.get(key)![starBucket].push(metric.rate_percent);
          }
        }
      }
    });

    console.log(`Included ${includedMetrics} metrics from rated contracts, excluded ${excludedMetrics} from non-rated contracts`);

    // Build year summaries - use the rated contract counts from summary_ratings
    const yearSummaries: YearSummary[] = uniqueYears.map((year) => {
      const uhcRatedContracts = uhcContractsByYear.get(year) ?? new Set();
      const marketRatedContracts = marketContractsByYear.get(year) ?? new Set();

      // Get all measures that have data for this year (from stars or scores)
      const measuresWithData = new Set<string>();
      uhcDistributions.forEach((_, key) => {
        const [keyYear, code] = key.split("|");
        if (parseInt(keyYear) === year) measuresWithData.add(code);
      });
      marketDistributions.forEach((_, key) => {
        const [keyYear, code] = key.split("|");
        if (parseInt(keyYear) === year) measuresWithData.add(code);
      });
      uhcScoresMap.forEach((_, key) => {
        const [keyYear, code] = key.split("|");
        if (parseInt(keyYear) === year) measuresWithData.add(code);
      });
      marketScoresMap.forEach((_, key) => {
        const [keyYear, code] = key.split("|");
        if (parseInt(keyYear) === year) measuresWithData.add(code);
      });

      const measures: MeasureComparison[] = Array.from(measuresWithData)
        .sort()
        .map((code) => {
          const key = getKey(year, code);
          const uhcDist = uhcDistributions.get(key) ?? createEmptyDistribution();
          const marketDist = marketDistributions.get(key) ?? createEmptyDistribution();
          const uhcScoresList = uhcScoresMap.get(key) ?? [];
          const marketScoresList = marketScoresMap.get(key) ?? [];
          const uhcScoresByStar = uhcScoresByStarMap.get(key) ?? { "1": [], "2": [], "3": [], "4": [], "5": [] };
          const marketScoresByStar = marketScoresByStarMap.get(key) ?? { "1": [], "2": [], "3": [], "4": [], "5": [] };

          const meta = measureMeta.get(code) ?? { name: code, domain: null };

          return {
            measureCode: code,
            measureName: meta.name,
            domain: meta.domain,
            year,
            uhc: uhcDist,
            market: marketDist,
            uhcPercentages: calculatePercentages(uhcDist),
            marketPercentages: calculatePercentages(marketDist),
            uhcScores: calculateScoreStats(uhcScoresList),
            marketScores: calculateScoreStats(marketScoresList),
            uhcScoresByStar: {
              "1": calculateScoreStats(uhcScoresByStar["1"]),
              "2": calculateScoreStats(uhcScoresByStar["2"]),
              "3": calculateScoreStats(uhcScoresByStar["3"]),
              "4": calculateScoreStats(uhcScoresByStar["4"]),
              "5": calculateScoreStats(uhcScoresByStar["5"]),
            },
            marketScoresByStar: {
              "1": calculateScoreStats(marketScoresByStar["1"]),
              "2": calculateScoreStats(marketScoresByStar["2"]),
              "3": calculateScoreStats(marketScoresByStar["3"]),
              "4": calculateScoreStats(marketScoresByStar["4"]),
              "5": calculateScoreStats(marketScoresByStar["5"]),
            },
          };
        })
        // Only include measures with data from both UHC and market
        .filter((m) => m.uhc.total > 0 || m.market.total > 0 || m.uhcScores.count > 0 || m.marketScores.count > 0);

      return {
        year,
        uhcContractCount: uhcRatedContracts.size,
        marketContractCount: marketRatedContracts.size,
        measures,
      };
    });

    // Get list of unique UHC parent organizations found (from rated contracts only)
    const uhcParentOrgs = new Set<string>();
    ratedContractRows.forEach((row) => {
      if (isUnitedHealthContract(row.parent_organization) && row.parent_organization) {
        uhcParentOrgs.add(row.parent_organization);
      }
    });

    return NextResponse.json({
      years: uniqueYears,
      yearSummaries,
      uhcParentOrganizations: Array.from(uhcParentOrgs).sort(),
    });
  } catch (error) {
    console.error("UHC comparison API error:", error);
    return NextResponse.json(
      {
        error: "Failed to build UHC comparison",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
