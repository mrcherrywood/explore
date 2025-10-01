import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function handleOrganizationComparison(
  supabase: ReturnType<typeof createServiceRoleClient>,
  parentOrganization: string,
  years: number[]
) {
  // Get all contracts for this organization across the selected years
  const { data: contractData, error: contractError } = await supabase
    .from("ma_contracts")
    .select("contract_id, year")
    .eq("parent_organization", parentOrganization)
    .in("year", years);

  if (contractError) {
    throw new Error(contractError.message);
  }

  type ContractRow = {
    contract_id: string;
    year: number;
  };

  const contractsByYear = new Map<number, string[]>();
  (contractData as ContractRow[] || []).forEach((row) => {
    if (!contractsByYear.has(row.year)) {
      contractsByYear.set(row.year, []);
    }
    contractsByYear.get(row.year)!.push(row.contract_id);
  });

  // Fetch overall ratings for all contracts across all years
  const allContractIds = (contractData as ContractRow[] || []).map((c) => c.contract_id);
  const { data: ratingRows, error: ratingError } = await supabase
    .from("summary_ratings")
    .select("contract_id, overall_rating_numeric, year")
    .in("contract_id", allContractIds)
    .in("year", years)
    .order("year", { ascending: true });

  if (ratingError) {
    throw new Error(ratingError.message);
  }

  // Fetch metrics for all contracts
  const { data: metricRows, error: metricError } = await supabase
    .from("ma_metrics")
    .select("contract_id, metric_code, metric_label, metric_category, rate_percent, star_rating, year")
    .in("contract_id", allContractIds)
    .in("year", years);

  if (metricError) {
    throw new Error(metricError.message);
  }

  // Fetch measure metadata
  const { data: measures } = await supabase
    .from("ma_measures")
    .select("code, domain, weight, year, name")
    .in("year", years);

  type MeasureMeta = {
    domain: string | null;
    weight: number | null;
    name: string | null;
    category: string;
  };

  const measureMetadataByYear = new Map<number, Map<string, MeasureMeta>>();
  const normalizedNameToCategories = new Map<string, Set<string>>();
  const deriveCategory = (code: string) => code.startsWith("C") ? "Part C" : code.startsWith("D") ? "Part D" : "Other";
  const normalizeMeasureName = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

  (measures || []).forEach((m: { code: string; domain: string | null; weight: number | null; year: number; name: string | null }) => {
    if (!measureMetadataByYear.has(m.year)) {
      measureMetadataByYear.set(m.year, new Map());
    }
    const yearMap = measureMetadataByYear.get(m.year)!;
    if (!yearMap.has(m.code)) {
      const category = deriveCategory(m.code);
      yearMap.set(m.code, { domain: m.domain, weight: m.weight, name: m.name, category });
      if (m.name) {
        const normalizedName = normalizeMeasureName(m.name);
        if (!normalizedNameToCategories.has(normalizedName)) {
          normalizedNameToCategories.set(normalizedName, new Set());
        }
        normalizedNameToCategories.get(normalizedName)!.add(category);
      }
    }
  });

  type MetricEntry = {
    contract_id: string;
    metric_code: string;
    metric_label: string | null;
    metric_category: string;
    rate_percent: number | null;
    star_rating: string | null;
    year: number;
  };

  // Calculate average overall ratings per year
  const overallRatingsByYear = new Map<number, number[]>();
  (ratingRows || []).forEach((row: { contract_id: string; overall_rating_numeric: number | null; year: number }) => {
    if (row.overall_rating_numeric !== null) {
      if (!overallRatingsByYear.has(row.year)) {
        overallRatingsByYear.set(row.year, []);
      }
      overallRatingsByYear.get(row.year)!.push(row.overall_rating_numeric);
    }
  });

  const overallChartData = years.map((year) => {
    const ratings = overallRatingsByYear.get(year) || [];
    const avgRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;
    return {
      year: year.toString(),
      overall: avgRating,
    };
  });

  const overallChart = overallChartData.length > 0 ? {
    title: "Average Overall Star Rating Over Time",
    type: "bar" as const,
    xKey: "year",
    series: [{ key: "overall", name: "Avg Overall Stars" }],
    data: overallChartData,
    yAxisDomain: [0, 5] as [number, number],
    yAxisTicks: [0, 1, 2, 3, 4, 5],
    showLabels: true,
    xLabelAngle: -60,
    xLabelPadding: 12,
  } : null;

  // Calculate domain averages per year
  type DomainData = {
    domain: string;
    yearData: Map<number, { totalWeightedStars: number; totalWeight: number; count: number }>;
  };

  const domainMap = new Map<string, DomainData>();

  (metricRows as MetricEntry[] | null)?.forEach((entry) => {
    const measureInfo = measureMetadataByYear.get(entry.year)?.get(entry.metric_code);
    if (!measureInfo?.domain || !measureInfo?.weight) return;

    const starValue = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
    if (!Number.isFinite(starValue) || starValue === null || starValue <= 0) return;

    const domain = measureInfo.domain;
    const weight = measureInfo.weight;

    if (!domainMap.has(domain)) {
      domainMap.set(domain, { domain, yearData: new Map() });
    }

    const domainData = domainMap.get(domain)!;
    if (!domainData.yearData.has(entry.year)) {
      domainData.yearData.set(entry.year, { totalWeightedStars: 0, totalWeight: 0, count: 0 });
    }

    const yearData = domainData.yearData.get(entry.year)!;
    yearData.totalWeightedStars += starValue * weight;
    yearData.totalWeight += weight;
    yearData.count += 1;
  });

  const domainCharts = Array.from(domainMap.values())
    .sort((a, b) => a.domain.localeCompare(b.domain))
    .map((domainData) => {
      const chartData = years.map((year: number) => {
        const yearData = domainData.yearData.get(year);
        const averageStars = yearData && yearData.totalWeight > 0
          ? yearData.totalWeightedStars / yearData.totalWeight
          : null;

        return {
          year: year.toString(),
          stars: averageStars,
        };
      });

      return {
        title: `${domainData.domain} Domain Stars`,
        type: "bar" as const,
        xKey: "year",
        series: [{ key: "stars", name: "Avg Domain Stars" }],
        data: chartData,
        yAxisDomain: [0, 5] as [number, number],
        yAxisTicks: [0, 1, 2, 3, 4, 5],
        showLabels: true,
        xLabelAngle: -60,
        xLabelPadding: 12,
      };
    });

  // Calculate measure averages per year
  type MeasureData = {
    key: string;
    label: string;
    yearData: Map<number, { rates: number[]; stars: number[] }>;
  };

  const measureDataMap = new Map<string, MeasureData>();

  (metricRows as MetricEntry[] | null)?.forEach((entry) => {
    const measureInfo = measureMetadataByYear.get(entry.year)?.get(entry.metric_code);
    const resolvedName = measureInfo?.name?.trim() || entry.metric_label?.trim() || entry.metric_code;
    const category = measureInfo?.category ?? entry.metric_category ?? deriveCategory(entry.metric_code);
    const normalizedName = normalizeMeasureName(resolvedName);
    const metricKey = `${normalizedName}|${category}`;

    if (!measureDataMap.has(metricKey)) {
      const categoriesForName = normalizedNameToCategories.get(normalizedName);
      const displayName = categoriesForName && categoriesForName.size > 1
        ? `${resolvedName} (${category})`
        : resolvedName;
      measureDataMap.set(metricKey, {
        key: metricKey,
        label: displayName,
        yearData: new Map(),
      });
    }

    const measureData = measureDataMap.get(metricKey)!;
    if (!measureData.yearData.has(entry.year)) {
      measureData.yearData.set(entry.year, { rates: [], stars: [] });
    }

    const yearData = measureData.yearData.get(entry.year)!;
    const starNumeric = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
    
    if (entry.rate_percent !== null) {
      yearData.rates.push(entry.rate_percent);
    }
    if (Number.isFinite(starNumeric) && starNumeric !== null) {
      yearData.stars.push(starNumeric);
    }
  });

  const measureCharts = Array.from(measureDataMap.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((measureData) => {
      const rateData = years.map((year: number) => {
        const yearData = measureData.yearData.get(year);
        const avgRate = yearData && yearData.rates.length > 0
          ? yearData.rates.reduce((sum, r) => sum + r, 0) / yearData.rates.length
          : null;
        return {
          year: year.toString(),
          rate: avgRate,
        };
      }).filter((item) => item.rate !== null);

      const starData = years.map((year: number) => {
        const yearData = measureData.yearData.get(year);
        const avgStar = yearData && yearData.stars.length > 0
          ? yearData.stars.reduce((sum, s) => sum + s, 0) / yearData.stars.length
          : null;
        return {
          year: year.toString(),
          stars: avgStar,
        };
      }).filter((item) => item.stars !== null);

      // Only include measures that have data for at least 2 years
      if (rateData.length < 2 && starData.length < 2) {
        return null;
      }

      const hasRateData = rateData.length >= 2;
      const hasStarData = starData.length >= 2;

      if (hasRateData && hasStarData) {
        const combinedData = years.map((year: number) => {
          const yearData = measureData.yearData.get(year);
          const avgRate = yearData && yearData.rates.length > 0
            ? yearData.rates.reduce((sum, r) => sum + r, 0) / yearData.rates.length
            : null;
          const avgStar = yearData && yearData.stars.length > 0
            ? yearData.stars.reduce((sum, s) => sum + s, 0) / yearData.stars.length
            : null;
          return {
            year: year.toString(),
            rate: avgRate,
            stars: avgStar,
          };
        }).filter((item) => item.rate !== null);

        return {
          title: `${measureData.label}`,
          type: "bar" as const,
          xKey: "year",
          series: [{ key: "rate", name: "Avg Rate %" }],
          data: combinedData,
          showLabels: true,
          labelKey: "stars",
          xLabelAngle: -60,
          xLabelPadding: 12,
        };
      } else if (hasRateData) {
        const rateDataWithStars = years.map((year: number) => {
          const yearData = measureData.yearData.get(year);
          const avgRate = yearData && yearData.rates.length > 0
            ? yearData.rates.reduce((sum, r) => sum + r, 0) / yearData.rates.length
            : null;
          const avgStar = yearData && yearData.stars.length > 0
            ? yearData.stars.reduce((sum, s) => sum + s, 0) / yearData.stars.length
            : null;
          return {
            year: year.toString(),
            rate: avgRate,
            stars: avgStar,
          };
        }).filter((item) => item.rate !== null);

        return {
          title: `${measureData.label}`,
          type: "bar" as const,
          xKey: "year",
          series: [{ key: "rate", name: "Avg Rate %" }],
          data: rateDataWithStars,
          showLabels: true,
          labelKey: "stars",
          xLabelAngle: -60,
          xLabelPadding: 12,
        };
      } else {
        return {
          title: `${measureData.label} (Stars)`,
          type: "bar" as const,
          xKey: "year",
          series: [{ key: "stars", name: "Stars" }],
          data: starData,
          yAxisDomain: [0, 5] as [number, number],
          yAxisTicks: [0, 1, 2, 3, 4, 5],
          showLabels: true,
          xLabelAngle: -60,
          xLabelPadding: 12,
        };
      }
    })
    .filter((chart): chart is NonNullable<typeof chart> => chart !== null);
  return NextResponse.json({
    comparisonType: "organization",
    parentOrganization,
    contractName: null,
    organizationMarketingName: parentOrganization,
    years,
    overallChart,
    domainCharts,
    measureCharts,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const comparisonType = typeof body?.comparisonType === "string" ? body.comparisonType : "contract";
    const contractId = typeof body?.contractId === "string" ? body.contractId.trim() : "";
    const parentOrganization = typeof body?.parentOrganization === "string" ? body.parentOrganization.trim() : "";
    const years = Array.isArray(body?.years) ? body.years.filter((y: unknown) => typeof y === "number") : [];

    if (comparisonType === "contract" && !contractId) {
      return NextResponse.json({ error: "contractId is required for contract comparison" }, { status: 400 });
    }
    if (comparisonType === "organization" && !parentOrganization) {
      return NextResponse.json({ error: "parentOrganization is required for organization comparison" }, { status: 400 });
    }
    if (years.length < 2) {
      return NextResponse.json({ error: "At least 2 years are required" }, { status: 400 });
    }

    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("YoY compare API configuration error:", clientError);
      return NextResponse.json(
        {
          error: "Supabase credentials not configured",
          code: "SUPABASE_CONFIG_MISSING",
        },
        { status: 503 }
      );
    }

    if (comparisonType === "organization") {
      // Handle organization-level comparison
      return await handleOrganizationComparison(supabase, parentOrganization, years);
    }

    // Handle contract-level comparison
    // Fetch contract metadata
    const { data: contractRows, error: contractError } = await supabase
      .from("ma_contracts")
      .select("contract_id, contract_name, organization_marketing_name")
      .eq("contract_id", contractId)
      .limit(1);

    if (contractError) {
      throw new Error(contractError.message);
    }

    const contractMeta: {
      contract_name: string | null;
      organization_marketing_name: string | null;
    } = contractRows?.[0] ?? {
      contract_name: null,
      organization_marketing_name: null,
    };

    // Fetch overall ratings for all years
    const { data: ratingRows, error: ratingError } = await supabase
      .from("summary_ratings")
      .select("contract_id, overall_rating_numeric, overall_rating, year")
      .eq("contract_id", contractId)
      .in("year", years)
      .order("year", { ascending: true });

    if (ratingError) {
      throw new Error(ratingError.message);
    }

    // Fetch metrics for all years
    const { data: metricRows, error: metricError } = await supabase
      .from("ma_metrics")
      .select("contract_id, metric_code, metric_label, metric_category, rate_percent, star_rating, year")
      .eq("contract_id", contractId)
      .in("year", years);

    if (metricError) {
      throw new Error(metricError.message);
    }

    // Fetch measure metadata to get domain and weight information
    const { data: measures } = await supabase
      .from("ma_measures")
      .select("code, domain, weight, year, name")
      .in("year", years);

    type MeasureMeta = {
      domain: string | null;
      weight: number | null;
      name: string | null;
      category: string;
    };

    const measureMetadataByYear = new Map<number, Map<string, MeasureMeta>>();
    const normalizedNameToCategories = new Map<string, Set<string>>();
    const deriveCategory = (code: string) => code.startsWith("C") ? "Part C" : code.startsWith("D") ? "Part D" : "Other";

    const normalizeMeasureName = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

    (measures || []).forEach((m: { code: string; domain: string | null; weight: number | null; year: number; name: string | null }) => {
      if (!measureMetadataByYear.has(m.year)) {
        measureMetadataByYear.set(m.year, new Map());
      }
      const yearMap = measureMetadataByYear.get(m.year)!;
      if (!yearMap.has(m.code)) {
        const category = deriveCategory(m.code);
        yearMap.set(m.code, { domain: m.domain, weight: m.weight, name: m.name, category });
        if (m.name) {
          const normalizedName = normalizeMeasureName(m.name);
          if (!normalizedNameToCategories.has(normalizedName)) {
            normalizedNameToCategories.set(normalizedName, new Set());
          }
          normalizedNameToCategories.get(normalizedName)!.add(category);
        }
      }
    });

    type MetricEntry = {
      contract_id: string;
      metric_code: string;
      metric_label: string | null;
      metric_category: string;
      rate_percent: number | null;
      star_rating: string | null;
      year: number;
    };

    // Build overall chart
    const overallChartData = (ratingRows || []).map((row: {
      year: number;
      overall_rating_numeric: number | null;
    }) => ({
      year: row.year.toString(),
      overall: row.overall_rating_numeric,
    }));

    const overallChart = overallChartData.length > 0 ? {
      title: "Overall Star Rating Over Time",
      type: "bar" as const,
      xKey: "year",
      series: [{ key: "overall", name: "Overall Stars" }],
      data: overallChartData,
      yAxisDomain: [0, 5] as [number, number],
      yAxisTicks: [0, 1, 2, 3, 4, 5],
      showLabels: true,
      xLabelAngle: -60,
      xLabelPadding: 12,
    } : null;

    // Build domain charts
    type DomainData = {
      domain: string;
      yearData: Map<number, { totalWeightedStars: number; totalWeight: number; count: number }>;
    };

    const domainMap = new Map<string, DomainData>();

    (metricRows as MetricEntry[] | null)?.forEach((entry) => {
      const measureInfo = measureMetadataByYear.get(entry.year)?.get(entry.metric_code);
      if (!measureInfo?.domain || !measureInfo?.weight) return;

      const starValue = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
      if (!Number.isFinite(starValue) || starValue === null || starValue <= 0) return;

      const domain = measureInfo.domain;
      const weight = measureInfo.weight;

      if (!domainMap.has(domain)) {
        domainMap.set(domain, { domain, yearData: new Map() });
      }

      const domainData = domainMap.get(domain)!;
      if (!domainData.yearData.has(entry.year)) {
        domainData.yearData.set(entry.year, { totalWeightedStars: 0, totalWeight: 0, count: 0 });
      }

      const yearData = domainData.yearData.get(entry.year)!;
      yearData.totalWeightedStars += starValue * weight;
      yearData.totalWeight += weight;
      yearData.count += 1;
    });

    const domainCharts = Array.from(domainMap.values())
      .sort((a, b) => a.domain.localeCompare(b.domain))
      .map((domainData) => {
        const chartData = years.map((year: number) => {
          const yearData = domainData.yearData.get(year);
          const averageStars = yearData && yearData.totalWeight > 0
            ? yearData.totalWeightedStars / yearData.totalWeight
            : null;

          return {
            year: year.toString(),
            stars: averageStars,
          };
        });

        return {
          title: `${domainData.domain} Domain Stars`,
          type: "bar" as const,
          xKey: "year",
          series: [{ key: "stars", name: "Domain Stars" }],
          data: chartData,
          yAxisDomain: [0, 5] as [number, number],
          yAxisTicks: [0, 1, 2, 3, 4, 5],
          showLabels: true,
          xLabelAngle: -60,
          xLabelPadding: 12,
        };
      });

    // Build measure charts
    type MeasureData = {
      key: string;
      label: string;
      yearData: Map<number, { rate: number | null; star: number | null }>;
    };

    const measureDataMap = new Map<string, MeasureData>();

    (metricRows as MetricEntry[] | null)?.forEach((entry) => {
      const measureInfo = measureMetadataByYear.get(entry.year)?.get(entry.metric_code);
      const resolvedName = measureInfo?.name?.trim() || entry.metric_label?.trim() || entry.metric_code;
      const category = measureInfo?.category ?? entry.metric_category ?? deriveCategory(entry.metric_code);
      const normalizedName = normalizeMeasureName(resolvedName);
      const metricKey = `${normalizedName}|${category}`;

      if (!measureDataMap.has(metricKey)) {
        const categoriesForName = normalizedNameToCategories.get(normalizedName);
        const displayName = categoriesForName && categoriesForName.size > 1
          ? `${resolvedName} (${category})`
          : resolvedName;
        measureDataMap.set(metricKey, {
          key: metricKey,
          label: displayName,
          yearData: new Map(),
        });
      }

      const measureData = measureDataMap.get(metricKey)!;
      if (!measureData.label || measureData.label.length === 0) {
        measureData.label = resolvedName;
      }
      const starNumeric = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
      
      measureData.yearData.set(entry.year, {
        rate: entry.rate_percent,
        star: Number.isFinite(starNumeric) ? starNumeric : null,
      });
    });

    const measureCharts = Array.from(measureDataMap.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((measureData) => {
        const rateData = years
          .map((year: number) => {
            const yearData = measureData.yearData.get(year);
            return {
              year: year.toString(),
              rate: yearData?.rate ?? null,
            };
          })
          .filter((item: { year: string; rate: number | null }) => item.rate !== null);

        const starData = years
          .map((year: number) => {
            const yearData = measureData.yearData.get(year);
            return {
              year: year.toString(),
              stars: yearData?.star ?? null,
            };
          })
          .filter((item: { year: string; stars: number | null }) => item.stars !== null);

        if (rateData.length < 2 && starData.length < 2) {
          return null;
        }

        const hasRateData = rateData.length >= 2;
        const hasStarData = starData.length >= 2;

        if (hasRateData && hasStarData) {
          const combinedData = years
            .map((year: number) => {
              const yearData = measureData.yearData.get(year);
              return {
                year: year.toString(),
                rate: yearData?.rate ?? null,
                stars: yearData?.star ?? null,
              };
            })
            .filter((item: { year: string; rate: number | null; stars: number | null }) => item.rate !== null);

          return {
            title: `${measureData.label}`,
            type: "bar" as const,
            xKey: "year",
            series: [{ key: "rate", name: "Rate %" }],
            data: combinedData,
            showLabels: true,
            labelKey: "stars",
            xLabelAngle: -60,
            xLabelPadding: 12,
          };
        }

        if (hasRateData) {
          const rateDataWithStars = years
            .map((year: number) => {
              const yearData = measureData.yearData.get(year);
              return {
                year: year.toString(),
                rate: yearData?.rate ?? null,
                stars: yearData?.star ?? null,
              };
            })
            .filter((item: { year: string; rate: number | null; stars: number | null }) => item.rate !== null);

          return {
            title: `${measureData.label}`,
            type: "bar" as const,
            xKey: "year",
            series: [{ key: "rate", name: "Rate %" }],
            data: rateDataWithStars,
            showLabels: true,
            labelKey: "stars",
            xLabelAngle: -60,
            xLabelPadding: 12,
          };
        }

        return {
          title: `${measureData.label} (Stars)`,
          type: "bar" as const,
          xKey: "year",
          series: [{ key: "stars", name: "Stars" }],
          data: starData,
          yAxisDomain: [0, 5] as [number, number],
          yAxisTicks: [0, 1, 2, 3, 4, 5],
          showLabels: true,
          xLabelAngle: -60,
          xLabelPadding: 12,
        };
      })
      .filter((chart): chart is NonNullable<typeof chart> => chart !== null);

    return NextResponse.json({
      contractId,
      contractName: contractMeta.contract_name,
      organizationMarketingName: contractMeta.organization_marketing_name,
      years,
      overallChart,
      domainCharts,
      measureCharts,
    });
  } catch (error) {
    console.error("YoY compare API error:", error);
    return NextResponse.json(
      {
        error: "Failed to build year over year comparison",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
