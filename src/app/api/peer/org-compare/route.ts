import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeLiteral(value: string) {
  return value.replace(/'/g, "''");
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatOrgLabel(name: string, maxLength: number = 28): string {
  const trimmed = name.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(3, maxLength - 1))}…`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parentOrganization = typeof body?.parentOrganization === "string" ? body.parentOrganization.trim() : "";
    const peerOrganizations = Array.isArray(body?.peerOrganizations)
      ? body.peerOrganizations.filter((org: unknown) => typeof org === "string" && org.trim().length > 0)
      : [];

    if (!parentOrganization) {
      return NextResponse.json({ error: "parentOrganization is required" }, { status: 400 });
    }
    if (peerOrganizations.length === 0) {
      return NextResponse.json({ error: "peerOrganizations is required" }, { status: 400 });
    }

    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("Peer org-compare API configuration error:", clientError);
      return NextResponse.json(
        {
          error: "Supabase credentials not configured",
          code: "SUPABASE_CONFIG_MISSING",
        },
        { status: 503 }
      );
    }

    // Get the latest metrics year
    const { data: metricsYearRow, error: metricsYearError } = await supabase
      .from("ma_metrics")
      .select("year")
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (metricsYearError) {
      throw new Error(metricsYearError.message);
    }

    const metricsYear = (metricsYearRow as { year: number } | null)?.year ?? new Date().getFullYear();

    // Get the latest year from ma_contracts
    const { data: contractYearData, error: contractYearError } = await supabase
      .from("ma_contracts")
      .select("year")
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contractYearError) {
      throw new Error(contractYearError.message);
    }

    const latestContractYear = (contractYearData as { year: number } | null)?.year ?? new Date().getFullYear();

    // Get all organizations to compare (primary + peers)
    const allOrganizations = [parentOrganization, ...peerOrganizations];
    
    // Get all contracts for these organizations (latest year only)
    const { data: contractsData, error: contractsError } = await supabase
      .from("ma_contracts")
      .select("contract_id, parent_organization, contract_name, organization_marketing_name")
      .eq("year", latestContractYear)
      .in("parent_organization", allOrganizations);

    if (contractsError) {
      throw new Error(contractsError.message);
    }

    type ContractRow = {
      contract_id: string;
      parent_organization: string | null;
      contract_name: string | null;
      organization_marketing_name: string | null;
    };

    const contracts = (contractsData ?? []) as ContractRow[];
    
    // Group contracts by parent organization
    const contractsByOrg = new Map<string, string[]>();
    contracts.forEach((contract) => {
      const org = contract.parent_organization;
      if (!org) return;
      if (!contractsByOrg.has(org)) {
        contractsByOrg.set(org, []);
      }
      contractsByOrg.get(org)!.push(contract.contract_id);
    });

    // Get overall ratings for all contracts
    const allContractIds = contracts.map(c => c.contract_id);
    const { data: ratingRows, error: ratingError } = await supabase
      .from("summary_ratings")
      .select("contract_id, overall_rating_numeric, year")
      .in("contract_id", allContractIds)
      .order("year", { ascending: false });

    if (ratingError) {
      throw new Error(ratingError.message);
    }

    // Get latest rating for each contract
    const latestRatings = new Map<string, number>();
    (ratingRows ?? []).forEach((row: { contract_id: string; overall_rating_numeric: number | null; year: number }) => {
      const contractId = row.contract_id.trim().toUpperCase();
      if (!latestRatings.has(contractId) && row.overall_rating_numeric !== null) {
        latestRatings.set(contractId, row.overall_rating_numeric);
      }
    });

    // Get metrics for all contracts
    const contractListClause = allContractIds.map((id) => `'${escapeLiteral(id)}'`).join(", ");
    const metricsQuery = `
      SELECT
        TRIM(UPPER(contract_id)) AS normalized_contract_id,
        metric_code,
        metric_label,
        metric_category,
        rate_percent,
        star_rating,
        year
      FROM ma_metrics
      WHERE TRIM(UPPER(contract_id)) IN (${contractListClause})
        AND year <= ${metricsYear}
      ORDER BY year DESC, TRIM(UPPER(contract_id)) ASC
    `;

    const { data: metricRows, error: metricError } = await (supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>)(
      "exec_raw_sql",
      { query: metricsQuery }
    );

    if (metricError) {
      throw new Error(metricError.message);
    }

    // Fetch measure metadata
    const { data: measures } = await supabase
      .from('ma_measures')
      .select('code, domain, weight, name, year')
      .lte('year', metricsYear)
      .order('year', { ascending: false })
      .order('code', { ascending: true })
      .range(0, 9999);

    const deriveCategory = (code: string) => code.startsWith('C') ? 'Part C' : code.startsWith('D') ? 'Part D' : 'Other';

    type MeasureRow = {
      code: string;
      domain: string | null;
      weight: number | null;
      name: string | null;
      year: number | null;
    };

    const measureMap = new Map<string, { domain: string | null; weight: number | null; name: string | null; year: number | null; category: string }>();
    (measures || []).forEach((m: MeasureRow) => {
      const existing = measureMap.get(m.code);
      if (!existing || ((m.year ?? 0) > (existing.year ?? 0))) {
        measureMap.set(m.code, {
          domain: m.domain,
          weight: m.weight,
          name: m.name,
          year: m.year ?? null,
          category: deriveCategory(m.code),
        });
      }
    });

    const normalizeMeasureName = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

    const normalizedNameToCategories = new Map<string, Set<string>>();
    (measures || []).forEach((m: MeasureRow) => {
      if (!m.name) return;
      const normalized = normalizeMeasureName(m.name);
      if (!normalizedNameToCategories.has(normalized)) {
        normalizedNameToCategories.set(normalized, new Set());
      }
      normalizedNameToCategories.get(normalized)!.add(measureMap.get(m.code)?.category ?? deriveCategory(m.code));
    });

    type MetricEntry = {
      normalized_contract_id: string;
      metric_code: string;
      metric_label: string | null;
      metric_category: string | null;
      rate_percent: number | null;
      star_rating: string | null;
      year: number | null;
    };

    // Organize metrics by measure and contract
    const metricsByMeasure = new Map<string, Map<string, { rate: number | null; star: number | null; year: number | null }>>();

    (metricRows as MetricEntry[] | null)?.forEach((entry) => {
      const contractId = entry.normalized_contract_id.trim().toUpperCase();
      const measureInfo = measureMap.get(entry.metric_code);
      const resolvedName = measureInfo?.name?.trim() || entry.metric_label?.trim() || entry.metric_code;
      const category = measureInfo?.category ?? entry.metric_category ?? deriveCategory(entry.metric_code);
      const normalizedName = normalizeMeasureName(resolvedName);
      const metricKey = `${normalizedName}|${category}`;

      if (!metricsByMeasure.has(metricKey)) {
        metricsByMeasure.set(metricKey, new Map());
      }

      const metric = metricsByMeasure.get(metricKey)!;
      const entryYear = entry.year ?? null;
      const parsedStar = entry.star_rating !== null && entry.star_rating !== undefined
        ? Number.parseFloat(String(entry.star_rating))
        : null;
      const starValue = Number.isFinite(parsedStar as number) ? (parsedStar as number) : null;
      const rawRate = entry.rate_percent;
      const parsedRate = rawRate === null || rawRate === undefined
        ? null
        : typeof rawRate === "number"
          ? (Number.isFinite(rawRate) ? rawRate : null)
          : Number.parseFloat(String(rawRate));
      const rateValue = Number.isFinite(parsedRate as number) ? (parsedRate as number) : null;

      const existing = metric.get(contractId);
      if (!existing || (entryYear ?? -Infinity) > (existing.year ?? -Infinity)) {
        metric.set(contractId, {
          rate: rateValue,
          star: starValue,
          year: entryYear,
        });
      }
    });

    // Calculate domain stars by contract
    const domainStarsByContract = new Map<string, Map<string, { totalWeightedStars: number; totalWeight: number; count: number }>>();
    
    (metricRows as MetricEntry[] | null)?.forEach((entry) => {
      const contractId = entry.normalized_contract_id.trim().toUpperCase();
      const measureInfo = measureMap.get(entry.metric_code);
      if (!measureInfo?.domain || !measureInfo?.weight) return;
      
      const starValue = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
      if (!Number.isFinite(starValue) || starValue === null || starValue <= 0) return;

      const domain = measureInfo.domain;
      const weight = measureInfo.weight;

      if (!domainStarsByContract.has(contractId)) {
        domainStarsByContract.set(contractId, new Map());
      }

      const contractDomains = domainStarsByContract.get(contractId)!;
      if (!contractDomains.has(domain)) {
        contractDomains.set(domain, { totalWeightedStars: 0, totalWeight: 0, count: 0 });
      }

      const domainData = contractDomains.get(domain)!;
      domainData.totalWeightedStars += starValue * weight;
      domainData.totalWeight += weight;
      domainData.count += 1;
    });

    // Calculate averages for each organization
    const orgAverages = allOrganizations.map((org) => {
      const orgContracts = contractsByOrg.get(org) || [];
      
      // Overall rating average
      const overallRatings = orgContracts
        .map(cid => latestRatings.get(cid.trim().toUpperCase()))
        .filter((r): r is number => r !== undefined);
      const avgOverallRating = overallRatings.length > 0
        ? overallRatings.reduce((sum, r) => sum + r, 0) / overallRatings.length
        : null;

      // Domain averages
      const domainAverages = new Map<string, number>();
      const allDomains = new Set<string>();
      orgContracts.forEach(cid => {
        const contractDomains = domainStarsByContract.get(cid.trim().toUpperCase());
        if (contractDomains) {
          contractDomains.forEach((_, domain) => allDomains.add(domain));
        }
      });

      allDomains.forEach(domain => {
        const domainValues: number[] = [];
        orgContracts.forEach(cid => {
          const contractDomains = domainStarsByContract.get(cid.trim().toUpperCase());
          const domainData = contractDomains?.get(domain);
          if (domainData && domainData.totalWeight > 0) {
            domainValues.push(domainData.totalWeightedStars / domainData.totalWeight);
          }
        });
        if (domainValues.length > 0) {
          domainAverages.set(domain, domainValues.reduce((sum, v) => sum + v, 0) / domainValues.length);
        }
      });

      // Measure averages
      const measureAverages = new Map<string, { rate: number | null; star: number | null; label: string }>();
      metricsByMeasure.forEach((contractMetrics, measureKey) => {
        const rateValues: number[] = [];
        const starValues: number[] = [];
        
        orgContracts.forEach(cid => {
          const contractId = cid.trim().toUpperCase();
          const metricData = contractMetrics.get(contractId);
          if (metricData) {
            if (metricData.rate !== null) rateValues.push(metricData.rate);
            if (metricData.star !== null) starValues.push(metricData.star);
          }
        });

        const avgRate = rateValues.length > 0 ? rateValues.reduce((sum, v) => sum + v, 0) / rateValues.length : null;
        const avgStar = starValues.length > 0 ? starValues.reduce((sum, v) => sum + v, 0) / starValues.length : null;

        if (avgRate !== null || avgStar !== null) {
          // Get label from first contract that has this measure
          let label = measureKey;
          for (const [, metric] of metricsByMeasure.entries()) {
            if (metric.has(orgContracts[0]?.trim().toUpperCase())) {
              const [name, category] = measureKey.split('|');
              const categoriesForName = normalizedNameToCategories.get(name);
              const rawLabel = categoriesForName && categoriesForName.size > 1
                ? `${name} (${category})`
                : name;
              label = capitalizeWords(rawLabel);
              break;
            }
          }
          
          measureAverages.set(measureKey, { rate: avgRate, star: avgStar, label });
        }
      });

      return {
        organization: org,
        contractCount: orgContracts.length,
        avgOverallRating,
        domainAverages: Object.fromEntries(domainAverages),
        measureAverages: Object.fromEntries(
          Array.from(measureAverages.entries()).map(([key, val]) => [key, val])
        ),
      };
    });

    const labelOptions = {
      xLabelKey: "label" as const,
      xLabelMaxLines: 1,
      xLabelLineLength: 24,
      xLabelAngle: -60,
      xLabelPadding: 36,
      highlightLegendSelected: "Selected Organization",
      highlightLegendPeers: "Peer Organizations",
    };

    // Build charts
    const overallChart = {
      title: `Overall Star Ratings (${metricsYear})`,
      type: "bar" as const,
      xKey: "organization",
      ...labelOptions,
      series: [{ key: "overall", name: "Avg Overall Stars" }],
      data: orgAverages
        .filter((org) => org.avgOverallRating !== null)
        .sort((a, b) => (a.avgOverallRating ?? 0) - (b.avgOverallRating ?? 0))
        .map((org) => ({
          organization: org.organization.trim(),
          label: formatOrgLabel(org.organization),
          overall: org.avgOverallRating,
        })),
      highlightKey: "organization",
      highlightValue: parentOrganization.trim(),
      yAxisDomain: [0, 5] as [number, number],
      yAxisTicks: [0, 1, 2, 3, 4, 5],
    };

    // Domain charts
    const allDomains = new Set<string>();
    orgAverages.forEach((org) => {
      Object.keys(org.domainAverages).forEach((domain) => allDomains.add(domain));
    });

    const domainCharts = Array.from(allDomains)
      .sort()
      .map((domain) => {
        const data = orgAverages
          .filter((org) => org.domainAverages[domain] !== undefined)
          .sort((a, b) => (a.domainAverages[domain] ?? 0) - (b.domainAverages[domain] ?? 0))
          .map((org) => ({
            organization: org.organization.trim(),
            label: formatOrgLabel(org.organization),
            stars: org.domainAverages[domain],
          }));

        return {
          title: `${capitalizeWords(domain)} Domain Stars (${metricsYear})`,
          type: "bar" as const,
          xKey: "organization",
          ...labelOptions,
          series: [{ key: "stars", name: "Avg Domain Stars" }],
          data,
          highlightKey: "organization",
          highlightValue: parentOrganization.trim(),
          yAxisDomain: [0, 5] as [number, number],
          yAxisTicks: [0, 1, 2, 3, 4, 5],
        };
      });

    // Measure charts
    const allMeasureKeys = new Set<string>();
    orgAverages.forEach((org) => {
      Object.keys(org.measureAverages).forEach((key) => allMeasureKeys.add(key));
    });

    const measureCharts = Array.from(allMeasureKeys)
      .sort()
      .map((measureKey) => {
        const measureData = orgAverages
          .map((org) => {
            const measure = org.measureAverages[measureKey];
            const value = measure?.rate ?? measure?.star ?? null;
            return {
              organization: org.organization.trim(),
              label: formatOrgLabel(org.organization),
              value,
              measureLabel: measure?.label || measureKey,
            };
          })
          .filter((item) => item.value !== null);

        if (measureData.length === 0) return null;

        const label = measureData[0].measureLabel;
        const labelLower = label.toLowerCase();
        const isInvertedMeasure =
          labelLower.includes("members choosing to leave") ||
          labelLower.includes("complaints about");

        const sortedData = [...measureData].sort((a, b) => {
          const aVal = a.value!;
          const bVal = b.value!;
          if (aVal === bVal) return a.organization.localeCompare(b.organization);
          return isInvertedMeasure ? bVal - aVal : aVal - bVal;
        });

        const usesStarsOnly = orgAverages.every((org) => {
          const measure = org.measureAverages[measureKey];
          return measure?.rate === null && measure?.star !== null;
        });

        return {
          title: `${label} (${metricsYear})`,
          type: "bar" as const,
          xKey: "organization",
          ...labelOptions,
          series: [{ key: "value", name: usesStarsOnly ? "Avg Stars" : "Avg Rate %" }],
          data: sortedData,
          highlightKey: "organization",
          highlightValue: parentOrganization.trim(),
          yAxisDomain: usesStarsOnly ? ([0, 5] as [number, number]) : undefined,
          yAxisTicks: usesStarsOnly ? [0, 1, 2, 3, 4, 5] : undefined,
        };
      })
      .filter((chart): chart is NonNullable<typeof chart> => chart !== null);

    return NextResponse.json({
      metricsYear,
      organizations: orgAverages,
      overallChart,
      domainCharts,
      measureCharts,
    });
  } catch (error) {
    console.error("Peer org-compare API error:", error);
    return NextResponse.json(
      {
        error: "Failed to build organization comparison",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
