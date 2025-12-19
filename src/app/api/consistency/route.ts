import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type StarRating = "1" | "2" | "3" | "4" | "5";

interface ConsistencyData {
  measureCode: string;
  measureName: string;
  domain: string | null;
  starRating: StarRating;
  yearTransitions: {
    fromYear: number;
    toYear: number;
    totalContracts: number;
    maintained: number;
    gainedOne: number;
    lostOne: number;
    gainedMultiple: number;
    lostMultiple: number;
    noDataNextYear: number;
  }[];
}

interface MeasureMetadata {
  code: string;
  name: string | null;
  domain: string | null;
}

export async function GET() {
  try {
    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("Consistency API configuration error:", clientError);
      return NextResponse.json(
        { error: "Supabase credentials not configured", code: "SUPABASE_CONFIG_MISSING" },
        { status: 503 }
      );
    }

    // Get all available years using raw SQL for distinct values
    const yearsQuery = `SELECT DISTINCT year FROM ma_metrics WHERE year IS NOT NULL ORDER BY year ASC`;
    const { data: yearsResult, error: yearsError } = await (
      supabase.rpc as unknown as <T>(
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: T | null; error: Error | null }>
    )("exec_raw_sql", { query: yearsQuery });

    if (yearsError) throw new Error(yearsError.message);

    const allYears = ((yearsResult ?? []) as { year: number }[]).map((r) => r.year).sort((a, b) => a - b);

    if (allYears.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 years of data for consistency analysis", years: allYears },
        { status: 400 }
      );
    }

    console.log(`Analyzing consistency across years: ${allYears.join(", ")}`);

    // Get all measure metadata
    const { data: measuresData, error: measuresError } = await supabase
      .from("ma_measures")
      .select("code, name, domain, year");

    if (measuresError) throw new Error(measuresError.message);

    // Build measure metadata map keyed by code+year (since codes are reused across years for different measures)
    const measureMetadataByCodeYear = new Map<string, MeasureMetadata>();
    (measuresData || []).forEach((m: { code: string; name: string | null; domain: string | null; year: number }) => {
      const key = `${m.code}|${m.year}`;
      measureMetadataByCodeYear.set(key, { code: m.code, name: m.name, domain: m.domain });
    });

    // Build a map of measure name + part (C/D) -> canonical identifier
    // Since measure codes change across years (e.g., C28 in 2023 = "Call Center", C28 in 2024 = "Plan Makes Timely Decisions")
    // we need to use the measure NAME as the canonical identifier, not the code
    const namePartToCanonicalName = new Map<string, { name: string; domain: string | null }>();
    (measuresData || []).forEach((m: { code: string; name: string | null; domain: string | null; year: number }) => {
      if (!m.name) return;
      const part = m.code.charAt(0);
      const key = `${part}|${m.name}`;
      if (!namePartToCanonicalName.has(key)) {
        namePartToCanonicalName.set(key, { name: m.name, domain: m.domain });
      }
    });

    // Get all metrics with star ratings using raw SQL
    const metricsQuery = `
      SELECT contract_id, metric_code, star_rating, year 
      FROM ma_metrics 
      WHERE star_rating IS NOT NULL AND star_rating != ''
      ORDER BY year ASC
    `;
    const { data: metricsData, error: metricsError } = await (
      supabase.rpc as unknown as <T>(
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: T | null; error: Error | null }>
    )("exec_raw_sql", { query: metricsQuery });

    if (metricsError) throw new Error(metricsError.message);

    const metricsArray = (metricsData ?? []) as Array<{ contract_id: string; metric_code: string; star_rating: string; year: number }>;
    console.log(`Fetched ${metricsArray.length} metrics with star ratings`);

    // Build a map of contract + measure NAME + year -> star rating
    // We use measure NAME (not code) because codes are reused across years for different measures
    type MetricKey = string; // format: "contractId|part|measureName|year"
    const metricRatings = new Map<MetricKey, number>();
    const measureNames = new Set<string>(); // format: "part|measureName"

    metricsArray.forEach((m) => {
      const starValue = parseFloat(m.star_rating);
      if (Number.isFinite(starValue) && starValue >= 1 && starValue <= 5) {
        // Look up the measure name for this code+year combination
        const metadataKey = `${m.metric_code}|${m.year}`;
        const metadata = measureMetadataByCodeYear.get(metadataKey);
        if (!metadata?.name) return;
        
        const part = m.metric_code.charAt(0);
        const measureKey = `${part}|${metadata.name}`;
        const key = `${m.contract_id}|${measureKey}|${m.year}`;
        metricRatings.set(key, Math.round(starValue));
        measureNames.add(measureKey);
      }
    });

    console.log(`Found ${measureNames.size} unique measures with star ratings`);

    // For each measure and star rating, track year-over-year transitions
    const consistencyResults: ConsistencyData[] = [];

    measureNames.forEach((measureKey) => {
      const canonicalData = namePartToCanonicalName.get(measureKey);
      const measureName = canonicalData?.name || measureKey;
      const domain = canonicalData?.domain || null;
      // Use the measureKey (part|name) as the internal measureCode
      // Extract just the part (C or D) for cleaner display when there are duplicates
      const measureCode = measureKey;

      // For each star rating (1-5)
      for (let starRating = 1; starRating <= 5; starRating++) {
        const yearTransitions: ConsistencyData["yearTransitions"] = [];

        // For each consecutive year pair
        for (let i = 0; i < allYears.length - 1; i++) {
          const fromYear = allYears[i];
          const toYear = allYears[i + 1];

          // Find all contracts that had this star rating for this measure in fromYear
          const contractsWithRating: string[] = [];
          
          metricRatings.forEach((rating, key) => {
            // Key format: "contractId|part|measureName|year"
            const parts = key.split("|");
            const contractId = parts[0];
            const keyMeasure = `${parts[1]}|${parts[2]}`;
            const year = parseInt(parts[3]);
            if (keyMeasure === measureKey && year === fromYear && rating === starRating) {
              contractsWithRating.push(contractId);
            }
          });

          if (contractsWithRating.length === 0) {
            continue; // No contracts with this rating in fromYear
          }

          // For each contract, check what happened in toYear
          let maintained = 0;
          let gainedOne = 0;
          let lostOne = 0;
          let gainedMultiple = 0;
          let lostMultiple = 0;
          let noDataNextYear = 0;

          contractsWithRating.forEach((contractId) => {
            const nextYearKey = `${contractId}|${measureKey}|${toYear}`;
            const nextYearRating = metricRatings.get(nextYearKey);

            if (nextYearRating === undefined) {
              noDataNextYear++;
            } else if (nextYearRating === starRating) {
              maintained++;
            } else if (nextYearRating === starRating + 1) {
              gainedOne++;
            } else if (nextYearRating === starRating - 1) {
              lostOne++;
            } else if (nextYearRating > starRating + 1) {
              gainedMultiple++;
            } else if (nextYearRating < starRating - 1) {
              lostMultiple++;
            }
          });

          yearTransitions.push({
            fromYear,
            toYear,
            totalContracts: contractsWithRating.length,
            maintained,
            gainedOne,
            lostOne,
            gainedMultiple,
            lostMultiple,
            noDataNextYear,
          });
        }

        // Only include this star rating if there's at least one transition with data
        if (yearTransitions.some(t => t.totalContracts > 0)) {
          consistencyResults.push({
            measureCode,
            measureName,
            domain,
            starRating: starRating.toString() as StarRating,
            yearTransitions,
          });
        }
      }
    });

    console.log(`Generated consistency analysis for ${consistencyResults.length} measure/star combinations`);

    // Calculate overall statistics
    const totalTransitions = consistencyResults.reduce(
      (sum, result) => sum + result.yearTransitions.reduce((s, t) => s + t.totalContracts, 0),
      0
    );
    const totalMaintained = consistencyResults.reduce(
      (sum, result) => sum + result.yearTransitions.reduce((s, t) => s + t.maintained, 0),
      0
    );
    const overallConsistencyRate = totalTransitions > 0 ? (totalMaintained / totalTransitions) * 100 : 0;

    return NextResponse.json({
      years: allYears,
      measureCount: measureNames.size,
      consistencyData: consistencyResults,
      summary: {
        totalTransitions,
        totalMaintained,
        overallConsistencyRate: parseFloat(overallConsistencyRate.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Consistency API error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate consistency analysis",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
