import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ENROLLMENT_LEVELS, EnrollmentLevelId, formatEnrollment, getEnrollmentLevel } from "@/lib/peer/enrollment-levels";

export const runtime = "nodejs";

const PLAN_TYPE_GROUPS = new Set(["SNP", "NOT"]);

function escapeLiteral(value: string) {
  return value.replace(/'/g, "''");
}

function assertEnrollmentLevel(value: unknown): value is EnrollmentLevelId {
  return typeof value === "string" && ENROLLMENT_LEVELS.some((bucket) => bucket.id === value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contractId = typeof body?.contractId === "string" ? body.contractId.trim() : "";
    const state = typeof body?.state === "string" ? body.state.trim().toUpperCase() : "";
    const planTypeGroup = typeof body?.planTypeGroup === "string" ? body.planTypeGroup.trim().toUpperCase() : "";
    const enrollmentLevel = body?.enrollmentLevel;

    if (!contractId) {
      return NextResponse.json({ error: "contractId is required" }, { status: 400 });
    }
    if (!state) {
      return NextResponse.json({ error: "state is required" }, { status: 400 });
    }
    if (!PLAN_TYPE_GROUPS.has(planTypeGroup)) {
      return NextResponse.json({ error: "planTypeGroup must be SNP or NOT" }, { status: 400 });
    }
    if (!assertEnrollmentLevel(enrollmentLevel)) {
      return NextResponse.json({ error: "Invalid enrollment level" }, { status: 400 });
    }

    // Extract contract type prefix (e.g., "H" from "H1234", "S" from "S5678")
    const contractTypePrefix = contractId.charAt(0).toUpperCase();
    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("Peer compare API configuration error:", clientError);
      return NextResponse.json(
        {
          error: "Supabase credentials not configured",
          code: "SUPABASE_CONFIG_MISSING",
        },
        { status: 503 }
      );
    }

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

    const { data: periodRow, error: periodError } = await supabase
      .from("ma_plan_enrollment")
      .select("report_year, report_month")
      .order("report_year", { ascending: false })
      .order("report_month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (periodError) {
      throw new Error(periodError.message);
    }

    if (!periodRow) {
      return NextResponse.json({ error: "No enrollment data available" }, { status: 404 });
    }

    const { report_year, report_month } = periodRow as { report_year: number; report_month: number };

    const peersQuery = `
      WITH latest_period AS (
        SELECT ${report_year}::int AS report_year, ${report_month}::int AS report_month
      ),
      landscape AS (
        SELECT DISTINCT
          pl.contract_id,
          pl.plan_id,
          CASE
            WHEN COALESCE(c.snp_indicator, '') ILIKE 'yes%'
              OR COALESCE(pl.special_needs_plan_indicator, '') ILIKE 'yes%'
              OR COALESCE(pl.plan_type, '') ILIKE '%snp%'
            THEN 'SNP'
            ELSE 'NOT'
          END AS plan_type_group
        FROM ma_plan_landscape pl
        JOIN latest_period lp
          ON lp.report_year = pl.year
        LEFT JOIN ma_contracts c
          ON c.contract_id = pl.contract_id
        WHERE pl.state_abbreviation = '${escapeLiteral(state)}'
          AND LEFT(pl.contract_id, 1) = '${escapeLiteral(contractTypePrefix)}'
      ),
      enrollment AS (
        SELECT
          l.contract_id,
          CASE
            WHEN COUNT(*) FILTER (WHERE e.enrollment IS NOT NULL) = 0 THEN NULL
            ELSE SUM(e.enrollment) FILTER (WHERE e.enrollment IS NOT NULL)
          END AS total_enrollment,
          SUM(CASE WHEN e.enrollment IS NULL THEN 1 ELSE 0 END) AS suppressed_plan_count,
          COUNT(*) FILTER (WHERE e.enrollment IS NOT NULL) AS reported_plan_count
        FROM ma_plan_enrollment e
        JOIN latest_period lp
          ON lp.report_year = e.report_year
         AND lp.report_month = e.report_month
        JOIN landscape l
          ON l.contract_id = e.contract_id
         AND l.plan_id = e.plan_id
        WHERE l.plan_type_group = '${escapeLiteral(planTypeGroup)}'
        GROUP BY l.contract_id
      )
      SELECT contract_id, total_enrollment, suppressed_plan_count, reported_plan_count
      FROM enrollment
    `;

    const { data: peersResult, error: peersError } = await (supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>)(
      "exec_raw_sql",
      { query: peersQuery }
    );

    if (peersError) {
      throw new Error(peersError.message);
    }

    const peerRows = Array.isArray(peersResult)
      ? (peersResult as Array<{
          contract_id: string;
          total_enrollment: number | null;
          suppressed_plan_count: number | null;
          reported_plan_count: number | null;
        }> )
      : [];

    type PeerRow = {
      contractId: string;
      totalEnrollment: number | null;
      enrollmentLevel: EnrollmentLevelId;
      suppressedCount: number;
      reportedCount: number;
    };

    const peers: PeerRow[] = peerRows.map((row) => {
      const total = row.total_enrollment === null || typeof row.total_enrollment !== "number"
        ? null
        : Number(row.total_enrollment);
      return {
        contractId: row.contract_id,
        totalEnrollment: total,
        enrollmentLevel: getEnrollmentLevel(total),
        suppressedCount: Number(row.suppressed_plan_count ?? 0),
        reportedCount: Number(row.reported_plan_count ?? 0),
      };
    });

    const peerContracts = new Set<string>();
    peers.forEach((peer) => {
      // If "all" is selected, include all peers; otherwise filter by enrollment level
      if (enrollmentLevel === "all" || peer.enrollmentLevel === enrollmentLevel) {
        peerContracts.add(peer.contractId);
      }
    });

    if (!peerContracts.has(contractId)) {
      peerContracts.add(contractId);
      const existing = peers.find((peer) => peer.contractId === contractId);
      if (!existing) {
        peers.push({
          contractId,
          totalEnrollment: null,
          enrollmentLevel: getEnrollmentLevel(null),
          suppressedCount: 0,
          reportedCount: 0,
        });
      }
    }

    const uniquePeerContracts = Array.from(peerContracts);

    if (uniquePeerContracts.length === 0) {
      return NextResponse.json({
        peers: [],
        overallChart: null,
        measureCharts: [],
        metricsYear,
      });
    }

    const { data: contractRows, error: contractError } = await supabase
      .from("ma_contracts")
      .select("contract_id, contract_name, organization_marketing_name, parent_organization, snp_indicator")
      .in("contract_id", uniquePeerContracts);

    if (contractError) {
      throw new Error(contractError.message);
    }

    const contractMeta = new Map<string, {
      contract_name: string | null;
      organization_marketing_name: string | null;
      parent_organization: string | null;
      snp_indicator: string | null;
    }>();

    (contractRows ?? []).forEach((row: {
      contract_id: string;
      contract_name: string | null;
      organization_marketing_name: string | null;
      parent_organization: string | null;
      snp_indicator: string | null;
    }) => {
      if (!contractMeta.has(row.contract_id)) {
        contractMeta.set(row.contract_id, {
          contract_name: row.contract_name,
          organization_marketing_name: row.organization_marketing_name,
          parent_organization: row.parent_organization,
          snp_indicator: row.snp_indicator,
        });
      }
    });

    const { data: ratingRows, error: ratingError } = await supabase
      .from("summary_ratings")
      .select("contract_id, overall_rating_numeric, overall_rating, year")
      .in("contract_id", uniquePeerContracts)
      .order("year", { ascending: false });

    if (ratingError) {
      throw new Error(ratingError.message);
    }

    const latestRatings = new Map<string, { value: number | null; year: number | null; text: string | null }>();
    (ratingRows ?? []).forEach((row: {
      contract_id: string;
      overall_rating_numeric: number | null;
      overall_rating: string | null;
      year: number;
    }) => {
      if (!latestRatings.has(row.contract_id)) {
        latestRatings.set(row.contract_id, {
          value: row.overall_rating_numeric,
          year: row.year,
          text: row.overall_rating,
        });
      }
    });

    const { data: metricRows, error: metricError } = await supabase
      .from("ma_metrics")
      .select("contract_id, metric_code, metric_label, metric_category, rate_percent, star_rating, year")
      .in("contract_id", uniquePeerContracts)
      .eq("year", metricsYear);

    if (metricError) {
      throw new Error(metricError.message);
    }

    // Fetch measure metadata to get domain and weight information
    const { data: measures } = await supabase
      .from('ma_measures')
      .select('code, domain, weight, name')
      .eq('year', metricsYear);

    const deriveCategory = (code: string) => code.startsWith('C') ? 'Part C' : code.startsWith('D') ? 'Part D' : 'Other';

    const measureMap = new Map(
      (measures || []).map((m: { code: string; domain: string | null; weight: number | null; name: string | null }) => 
        [m.code, { domain: m.domain, weight: m.weight, name: m.name, category: deriveCategory(m.code) }]
      )
    );

    const normalizeMeasureName = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

    const normalizedNameToCategories = new Map<string, Set<string>>();
    (measures || []).forEach((m: { name: string | null; code: string }) => {
      if (!m.name) return;
      const normalized = normalizeMeasureName(m.name);
      if (!normalizedNameToCategories.has(normalized)) {
        normalizedNameToCategories.set(normalized, new Set());
      }
      normalizedNameToCategories.get(normalized)!.add(measureMap.get(m.code)?.category ?? deriveCategory(m.code));
    });

    type MetricEntry = {
      contract_id: string;
      metric_code: string;
      metric_label: string | null;
      metric_category: string | null;
      rate_percent: number | null;
      star_rating: string | null;
    };

    const metricByName = new Map<string, { label: string; values: Map<string, { rate: number | null; star: number | null }> }>();

    (metricRows as MetricEntry[] | null)?.forEach((entry) => {
      const measureInfo = measureMap.get(entry.metric_code);
      const resolvedName = measureInfo?.name?.trim() || entry.metric_label?.trim() || entry.metric_code;
      const category = measureInfo?.category ?? entry.metric_category ?? deriveCategory(entry.metric_code);
      const normalizedName = normalizeMeasureName(resolvedName);
      const metricKey = `${normalizedName}|${category}`;
      if (!metricByName.has(metricKey)) {
        const categoriesForName = normalizedNameToCategories.get(normalizedName);
        const displayName = categoriesForName && categoriesForName.size > 1
          ? `${resolvedName} (${category})`
          : resolvedName;
        metricByName.set(metricKey, {
          label: displayName,
          values: new Map(),
        });
      }
      const metric = metricByName.get(metricKey)!;
      const starNumeric = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
      metric.values.set(entry.contract_id, {
        rate: entry.rate_percent,
        star: Number.isFinite(starNumeric) ? starNumeric : null,
      });
    });

    const peerDetails = uniquePeerContracts.map((id) => {
      const peerInfo = peers.find((peer) => peer.contractId === id);
      const meta = contractMeta.get(id) ?? {
        contract_name: null,
        organization_marketing_name: null,
        parent_organization: null,
        snp_indicator: null,
      };
      const ratingInfo = latestRatings.get(id) ?? { value: null, year: null, text: null };
      return {
        contractId: id,
        contractName: meta.contract_name,
        organizationMarketingName: meta.organization_marketing_name,
        parentOrganization: meta.parent_organization,
        snpIndicator: meta.snp_indicator,
        totalEnrollment: peerInfo?.totalEnrollment ?? null,
        formattedEnrollment: formatEnrollment(peerInfo?.totalEnrollment ?? null),
        enrollmentLevel: peerInfo?.enrollmentLevel ?? getEnrollmentLevel(peerInfo?.totalEnrollment ?? null),
        suppressedPlanCount: peerInfo?.suppressedCount ?? 0,
        reportedPlanCount: peerInfo?.reportedCount ?? 0,
        latestRatingYear: ratingInfo.year,
        latestRatingText: ratingInfo.text,
        latestRatingNumeric: ratingInfo.value,
      };
    });

    const sortedPeers = peerDetails.sort((a, b) => {
      const aVal = a.totalEnrollment ?? -1;
      const bVal = b.totalEnrollment ?? -1;
      if (aVal === bVal) {
        return a.contractId.localeCompare(b.contractId);
      }
      return bVal - aVal;
    });

    // Filter peers with overall ratings and sort by performance (rating) - low to high
    const peersWithOverallRating = peerDetails.filter((peer) => 
      peer.latestRatingNumeric !== null && peer.latestRatingNumeric !== undefined
    );
    
    const sortedByPerformance = [...peersWithOverallRating].sort((a, b) => {
      const aRating = a.latestRatingNumeric!;
      const bRating = b.latestRatingNumeric!;
      if (aRating === bRating) {
        return a.contractId.localeCompare(b.contractId);
      }
      return aRating - bRating; // Low performance on left, high on right
    });

    const overallChart = sortedByPerformance.length > 0 ? {
      title: `Overall Star Ratings (${metricsYear})`,
      type: "bar" as const,
      xKey: "contract",
      series: [{ key: "overall", name: "Overall Stars" }],
      data: sortedByPerformance.map((peer) => ({
        contract: peer.contractId,
        overall: peer.latestRatingNumeric,
        label: peer.contractName || peer.organizationMarketingName || peer.contractId,
      })),
      highlightKey: "contract",
      highlightValue: contractId,
      yAxisDomain: [0, 5] as [number, number],
      yAxisTicks: [0, 1, 2, 3, 4, 5],
    } : null;

    const measureCharts = Array.from(metricByName.entries())
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([, metric]) => {
        // Create data only for peers with values for this metric
        const dataWithValues = peerDetails
          .map((peer) => {
            const values = metric.values.get(peer.contractId);
            return {
              contract: peer.contractId,
              value: values?.rate ?? null,
              star: values?.star ?? null,
              label: peer.contractName || peer.organizationMarketingName || peer.contractId,
            };
          })
          .filter((item) => item.value !== null && item.value !== undefined);
        
        // Determine if this is an inverted measure (lower is better)
        const labelLower = metric.label.toLowerCase();
        const isInvertedMeasure = 
          labelLower.includes("members choosing to leave") ||
          labelLower.includes("complaints about");
        
        // Sort by the metric's rate value
        // For inverted measures: high to low (worst to best)
        // For normal measures: low to high (worst to best)
        const sortedData = [...dataWithValues].sort((a, b) => {
          const aVal = a.value!;
          const bVal = b.value!;
          if (aVal === bVal) {
            return a.contract.localeCompare(b.contract);
          }
          return isInvertedMeasure 
            ? bVal - aVal  // High to low for inverted (worst on left, best on right)
            : aVal - bVal; // Low to high for normal (worst on left, best on right)
        });
        
        return {
          title: `${metric.label} (${metricsYear})`,
          type: "bar" as const,
          xKey: "contract",
          series: [{ key: "value", name: "Rate %" }],
          data: sortedData,
          highlightKey: "contract",
          highlightValue: contractId,
        };
      })
      .filter((chart) => chart.data.length > 0);

    // Calculate domain stars for each contract
    const domainStarsByContract = new Map<string, Map<string, { totalWeightedStars: number; totalWeight: number; count: number }>>();
    
    (metricRows as MetricEntry[] | null)?.forEach((entry) => {
      const measureInfo = measureMap.get(entry.metric_code);
      if (!measureInfo?.domain || !measureInfo?.weight) return;
      
      const starValue = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
      if (!Number.isFinite(starValue) || starValue === null || starValue <= 0) return;

      const domain = measureInfo.domain;
      const weight = measureInfo.weight;

      if (!domainStarsByContract.has(entry.contract_id)) {
        domainStarsByContract.set(entry.contract_id, new Map());
      }

      const contractDomains = domainStarsByContract.get(entry.contract_id)!;
      if (!contractDomains.has(domain)) {
        contractDomains.set(domain, { totalWeightedStars: 0, totalWeight: 0, count: 0 });
      }

      const domainData = contractDomains.get(domain)!;
      domainData.totalWeightedStars += starValue * weight;
      domainData.totalWeight += weight;
      domainData.count += 1;
    });

    // Get unique domains across all contracts
    const allDomains = new Set<string>();
    domainStarsByContract.forEach((domains) => {
      domains.forEach((_, domain) => allDomains.add(domain));
    });

    // Create domain charts
    const domainCharts = Array.from(allDomains)
      .sort()
      .map((domain) => {
        const dataWithValues = peerDetails
          .map((peer) => {
            const contractDomains = domainStarsByContract.get(peer.contractId);
            const domainData = contractDomains?.get(domain);
            const averageStars = domainData && domainData.totalWeight > 0
              ? domainData.totalWeightedStars / domainData.totalWeight
              : null;
            
            return {
              contract: peer.contractId,
              stars: averageStars,
              label: peer.contractName || peer.organizationMarketingName || peer.contractId,
            };
          })
          .filter((item) => item.stars !== null && item.stars !== undefined);

        // Sort by stars (low to high - worst to best)
        const sortedData = [...dataWithValues].sort((a, b) => {
          const aVal = a.stars!;
          const bVal = b.stars!;
          if (aVal === bVal) {
            return a.contract.localeCompare(b.contract);
          }
          return aVal - bVal;
        });

        return {
          title: `${domain} Domain Stars (${metricsYear})`,
          type: "bar" as const,
          xKey: "contract",
          series: [{ key: "stars", name: "Domain Stars" }],
          data: sortedData,
          highlightKey: "contract",
          highlightValue: contractId,
          yAxisDomain: [0, 5] as [number, number],
          yAxisTicks: [0, 1, 2, 3, 4, 5],
        };
      })
      .filter((chart) => chart.data.length > 0);

    return NextResponse.json({
      metricsYear,
      state,
      planTypeGroup,
      enrollmentLevel,
      peers: sortedPeers,
      overallChart,
      domainCharts,
      measureCharts,
    });
  } catch (error) {
    console.error("Peer compare API error:", error);
    return NextResponse.json(
      {
        error: "Failed to build peer comparison",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
