import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ENROLLMENT_LEVELS, EnrollmentLevelId, formatEnrollment, getEnrollmentLevel } from "@/lib/peer/enrollment-levels";

export const runtime = "nodejs";

const PLAN_TYPE_GROUPS = new Set(["SNP", "NOT", "ALL"]);

function escapeLiteral(value: string) {
  return value.replace(/'/g, "''");
}

function assertEnrollmentLevel(value: unknown): value is EnrollmentLevelId {
  return typeof value === "string" && ENROLLMENT_LEVELS.some((bucket) => bucket.id === value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contractIdRaw = typeof body?.contractId === "string" ? body.contractId.trim() : "";
    const contractId = contractIdRaw.toUpperCase();
    const states = Array.isArray(body?.states)
      ? Array.from(
          new Set(
            (body.states as unknown[])
              .map((value: unknown) => (typeof value === "string" ? value.trim().toUpperCase() : ""))
              .filter((value): value is string => Boolean(value && value.length > 0))
          )
        )
      : [];
    const planTypeGroup = typeof body?.planTypeGroup === "string" ? body.planTypeGroup.trim().toUpperCase() : "";
    const enrollmentLevel = body?.enrollmentLevel;

    if (!contractId) {
      return NextResponse.json({ error: "contractId is required" }, { status: 400 });
    }
    if (states.length === 0) {
      return NextResponse.json({ error: "states is required" }, { status: 400 });
    }
    if (!PLAN_TYPE_GROUPS.has(planTypeGroup)) {
      return NextResponse.json({ error: "planTypeGroup must be SNP, NOT, or ALL" }, { status: 400 });
    }
    if (!assertEnrollmentLevel(enrollmentLevel)) {
      return NextResponse.json({ error: "Invalid enrollment level" }, { status: 400 });
    }

    const statesInClause = states.map((value: string) => `'${escapeLiteral(value)}'`).join(", ");

    if (!statesInClause) {
      return NextResponse.json({ error: "states is required" }, { status: 400 });
    }

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

    const planTypeFilterClause = planTypeGroup === "ALL"
      ? ""
      : `WHERE l.plan_type_group = '${escapeLiteral(planTypeGroup)}'`;

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
        WHERE pl.state_abbreviation IN (${statesInClause})
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
        ${planTypeFilterClause}
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
      const normalizedContractId = (row.contract_id || "").trim().toUpperCase();
      const total = row.total_enrollment === null || typeof row.total_enrollment !== "number"
        ? null
        : Number(row.total_enrollment);
      return {
        contractId: normalizedContractId,
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
      const normalizedId = (row.contract_id || "").trim().toUpperCase();
      if (!normalizedId) {
        return;
      }
      if (!contractMeta.has(normalizedId)) {
        contractMeta.set(normalizedId, {
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
      const normalizedId = (row.contract_id || "").trim().toUpperCase();
      if (!normalizedId) {
        return;
      }
      if (!latestRatings.has(normalizedId)) {
        latestRatings.set(normalizedId, {
          value: row.overall_rating_numeric,
          year: row.year,
          text: row.overall_rating,
        });
      }
    });

    const contractListClause = uniquePeerContracts.map((value) => `'${escapeLiteral(value)}'`).join(", ");
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

    const { data: metricRows, error: metricError } = await (supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>) (
      "exec_raw_sql",
      { query: metricsQuery }
    );

    if (metricError) {
      throw new Error(metricError.message);
    }

    // Fetch measure metadata to get domain and weight information
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

    const metricByName = new Map<string, {
      label: string;
      latestYear: number | null;
      values: Map<string, { rate: number | null; star: number | null; year: number | null }>;
    }>();

    (metricRows as MetricEntry[] | null)?.forEach((entry) => {
      const normalizedContractId = (entry.normalized_contract_id || "").trim().toUpperCase();
      if (!normalizedContractId) {
        return;
      }
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
          latestYear: null,
          values: new Map(),
        });
      }
      const metric = metricByName.get(metricKey)!;
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
      const hasValue = rateValue !== null || starValue !== null;

      const metricEntry = metric.values.get(normalizedContractId) || {
        rate: null,
        star: null,
        year: null,
      };

      if (hasValue) {
        if ((entryYear ?? -Infinity) > (metricEntry.year ?? -Infinity)) {
          metric.values.set(normalizedContractId, {
            rate: rateValue,
            star: starValue,
            year: entryYear,
          });
        }

        if (entryYear !== null && ((metric.latestYear ?? -Infinity) < entryYear)) {
          metric.latestYear = entryYear;
        }
      }
    });

    metricByName.forEach((metric) => {
      if (metric.latestYear === null) {
        return;
      }
      metric.values.forEach((value, contractId) => {
        if (value.year !== metric.latestYear) {
          metric.values.set(contractId, {
            rate: null,
            star: null,
            year: value.year,
          });
        }
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
        let hasRateValues = false;
        let hasStarValues = false;

        const dataWithValues = peerDetails
          .map((peer) => {
            const values = metric.values.get(peer.contractId);
            const rateValue = values?.rate ?? null;
            const starValue = values?.star ?? null;

            if (rateValue !== null && rateValue !== undefined) {
              hasRateValues = true;
            }
            if ((rateValue === null || rateValue === undefined) && starValue !== null && starValue !== undefined) {
              hasStarValues = true;
            }

            const chosenValue = rateValue !== null && rateValue !== undefined ? rateValue : starValue;

            return {
              contract: peer.contractId,
              value: chosenValue,
              star: starValue,
              label: peer.contractName || peer.organizationMarketingName || peer.contractId,
            };
          })
          .filter((item) => item.value !== null && item.value !== undefined);

        if (dataWithValues.length === 0) {
          return null;
        }

        const labelLower = metric.label.toLowerCase();
        const isInvertedMeasure =
          labelLower.includes("members choosing to leave") ||
          labelLower.includes("complaints about");

        const sortedData = [...dataWithValues].sort((a, b) => {
          const aVal = a.value!;
          const bVal = b.value!;
          if (aVal === bVal) {
            return a.contract.localeCompare(b.contract);
          }
          return isInvertedMeasure ? bVal - aVal : aVal - bVal;
        });

        const chartYear = metric.latestYear ?? metricsYear;
        const usesStarsOnly = !hasRateValues && hasStarValues;

        return {
          title: `${metric.label} (${chartYear})`,
          type: "bar" as const,
          xKey: "contract",
          series: [{ key: "value", name: usesStarsOnly ? "Stars" : "Rate %" }],
          data: sortedData,
          highlightKey: "contract",
          highlightValue: contractId,
          yAxisDomain: usesStarsOnly ? ([0, 5] as [number, number]) : undefined,
          yAxisTicks: usesStarsOnly ? [0, 1, 2, 3, 4, 5] : undefined,
        };
      })
      .filter((chart): chart is NonNullable<typeof chart> => Boolean(chart));

    // Calculate domain stars for each contract
    const domainStarsByContract = new Map<string, Map<string, { totalWeightedStars: number; totalWeight: number; count: number }>>();
    
    (metricRows as MetricEntry[] | null)?.forEach((entry) => {
      const normalizedContractId = (entry.normalized_contract_id || "").trim().toUpperCase();
      if (!normalizedContractId) {
        return;
      }
      const measureInfo = measureMap.get(entry.metric_code);
      if (!measureInfo?.domain || !measureInfo?.weight) return;
      
      const starValue = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
      if (!Number.isFinite(starValue) || starValue === null || starValue <= 0) return;

      const domain = measureInfo.domain;
      const weight = measureInfo.weight;

      if (!domainStarsByContract.has(normalizedContractId)) {
        domainStarsByContract.set(normalizedContractId, new Map());
      }

      const contractDomains = domainStarsByContract.get(normalizedContractId)!;
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

        const sortedData = [...dataWithValues].sort((a, b) => {
          const aVal = a.stars!;
          const bVal = b.stars!;
          if (aVal === bVal) {
            return a.contract.localeCompare(b.contract);
          }
          return aVal - bVal;
        });

        if (sortedData.length === 0) {
          return null;
        }

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
      .filter((chart): chart is NonNullable<typeof chart> => Boolean(chart));

    const metricDiagnostics = Array.from(metricByName.entries()).map(([key, metric]) => {
      const contractsWithValues = new Set(Array.from(metric.values.keys()));
      const missingContracts = uniquePeerContracts.filter((peerId) => !contractsWithValues.has(peerId));
      return {
        key,
        label: metric.label,
        latestYear: metric.latestYear,
        valueCount: contractsWithValues.size,
        missingCount: missingContracts.length,
        sampleMissing: missingContracts.slice(0, 10),
      };
    });

    const domainDiagnostics = Array.from(allDomains).map((domain) => {
      const contractsWithDomain = new Set<string>();
      domainStarsByContract.forEach((domains, contract) => {
        if (domains.has(domain)) {
          contractsWithDomain.add(contract);
        }
      });
      const missingContracts = uniquePeerContracts.filter((peerId) => !contractsWithDomain.has(peerId));
      return {
        domain,
        valueCount: contractsWithDomain.size,
        missingCount: missingContracts.length,
        sampleMissing: missingContracts.slice(0, 10),
      };
    });

    return NextResponse.json({
      metricsYear,
      states,
      planTypeGroup,
      enrollmentLevel,
      peers: sortedPeers,
      overallChart,
      domainCharts,
      measureCharts,
      diagnostics: {
        totalPeers: uniquePeerContracts.length,
        metrics: metricDiagnostics,
        domains: domainDiagnostics,
      },
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
