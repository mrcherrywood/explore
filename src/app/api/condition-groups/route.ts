import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { CONDITION_GROUPS, matchMeasureToGroup } from "@/lib/condition-groups/groups";
import { US_STATE_NAMES } from "@/lib/leaderboard/states";

export const runtime = "nodejs";

type MeasureMeta = {
  code: string;
  name: string | null;
  domain: string | null;
  weight: number | null;
  year: number;
};

type MetricEntry = {
  contract_id: string;
  metric_code: string;
  metric_label: string | null;
  rate_percent: number | null;
  star_rating: string | null;
  year: number;
};

type MeasureDetail = {
  code: string;
  name: string;
  weight: number;
  yearData: Record<string, { avgStar: number | null; avgRate: number | null }>;
};

type GroupDetailResult = {
  groupId: string;
  groupLabel: string;
  groupColor: string;
  measures: MeasureDetail[];
  yearScores: Record<string, number | null>;
};

function normalizeCode(code?: string | null) {
  return (code ?? "").trim().toUpperCase();
}

function computeConditionGroupData(
  metricRows: MetricEntry[],
  measuresByYearCode: Map<string, MeasureMeta>,
  years: number[]
): {
  chartData: Record<string, string | number | null>[];
  groupDetails: GroupDetailResult[];
} {
  type GroupYearAcc = {
    totalWeightedStars: number;
    totalWeight: number;
    measureAcc: Map<
      string,
      { code: string; name: string; weight: number; stars: number[]; rates: number[] }
    >;
  };

  const groupYearData = new Map<string, Map<number, GroupYearAcc>>();
  for (const group of CONDITION_GROUPS) {
    groupYearData.set(group.id, new Map());
  }

  for (const entry of metricRows) {
    const code = normalizeCode(entry.metric_code);
    const metaKey = `${entry.year}|${code}`;
    const resolvedName =
      measuresByYearCode.get(metaKey)?.name?.trim() ||
      entry.metric_label?.trim() ||
      code;
    const group = matchMeasureToGroup(resolvedName);
    if (!group) continue;

    const meta = measuresByYearCode.get(metaKey);
    const weight = meta?.weight ?? 1;
    const starRaw = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
    const hasStar = starRaw !== null && Number.isFinite(starRaw) && starRaw > 0;

    const yearMap = groupYearData.get(group.id)!;
    if (!yearMap.has(entry.year)) {
      yearMap.set(entry.year, { totalWeightedStars: 0, totalWeight: 0, measureAcc: new Map() });
    }

    const acc = yearMap.get(entry.year)!;
    if (hasStar) {
      acc.totalWeightedStars += starRaw! * weight;
      acc.totalWeight += weight;
    }

    const normalizedName = resolvedName.replace(/\s+/g, " ").trim().toLowerCase();
    if (!acc.measureAcc.has(normalizedName)) {
      acc.measureAcc.set(normalizedName, { code, name: resolvedName, weight, stars: [], rates: [] });
    }

    const mAcc = acc.measureAcc.get(normalizedName)!;
    mAcc.code = code;
    if (hasStar) mAcc.stars.push(starRaw!);
    if (entry.rate_percent !== null && Number.isFinite(entry.rate_percent)) {
      mAcc.rates.push(entry.rate_percent);
    }
  }

  const chartData = years.map((year) => {
    const row: Record<string, string | number | null> = { year: year.toString() };
    for (const group of CONDITION_GROUPS) {
      const acc = groupYearData.get(group.id)?.get(year);
      row[group.id] =
        acc && acc.totalWeight > 0
          ? Math.round((acc.totalWeightedStars / acc.totalWeight) * 100) / 100
          : null;
    }
    return row;
  });

  const groupDetails: GroupDetailResult[] = CONDITION_GROUPS.map((group) => {
    const yearMap = groupYearData.get(group.id)!;
    const measureMap = new Map<string, MeasureDetail>();
    const yearScores: Record<string, number | null> = {};

    for (const year of years) {
      const acc = yearMap.get(year);
      yearScores[year.toString()] =
        acc && acc.totalWeight > 0
          ? Math.round((acc.totalWeightedStars / acc.totalWeight) * 100) / 100
          : null;

      if (!acc) continue;

      acc.measureAcc.forEach((mAcc, key) => {
        if (!measureMap.has(key)) {
          measureMap.set(key, { code: mAcc.code, name: mAcc.name, weight: mAcc.weight, yearData: {} });
        }
        const detail = measureMap.get(key)!;
        const avgStar =
          mAcc.stars.length > 0 ? mAcc.stars.reduce((s, v) => s + v, 0) / mAcc.stars.length : null;
        const avgRate =
          mAcc.rates.length > 0 ? mAcc.rates.reduce((s, v) => s + v, 0) / mAcc.rates.length : null;
        detail.yearData[year.toString()] = { avgStar, avgRate };
      });
    }

    return {
      groupId: group.id,
      groupLabel: group.label,
      groupColor: group.color,
      measures: Array.from(measureMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      yearScores,
    };
  });

  return { chartData, groupDetails };
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contractId =
      typeof body?.contractId === "string" ? body.contractId.trim() : "";
    const parentOrganization =
      typeof body?.parentOrganization === "string"
        ? body.parentOrganization.trim()
        : "";
    const stateCode =
      typeof body?.stateCode === "string" ? body.stateCode.trim().toUpperCase() : "";
    const years: number[] = Array.isArray(body?.years)
      ? body.years.filter((y: unknown) => typeof y === "number")
      : [];

    if (!contractId && !parentOrganization) {
      return NextResponse.json(
        { error: "contractId or parentOrganization is required" },
        { status: 400 }
      );
    }
    if (years.length < 2) {
      return NextResponse.json(
        { error: "At least 2 years are required" },
        { status: 400 }
      );
    }

    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch {
      return NextResponse.json(
        { error: "Supabase credentials not configured" },
        { status: 503 }
      );
    }

    const { data: measures } = await supabase
      .from("ma_measures")
      .select("code, name, domain, weight, year")
      .in("year", years);

    const measuresByYearCode = new Map<string, MeasureMeta>();
    (measures || []).forEach((m: MeasureMeta) => {
      const key = `${m.year}|${normalizeCode(m.code)}`;
      measuresByYearCode.set(key, m);
    });

    let contractIds: string[] = [];

    if (contractId) {
      contractIds = [contractId];
    } else {
      const { data: contractData } = await supabase
        .from("ma_contracts")
        .select("contract_id, year")
        .ilike("parent_organization", `${parentOrganization}%`)
        .in("year", years);

      contractIds = Array.from(
        new Set(
          (contractData || [])
            .map((r: { contract_id: string }) => r.contract_id.trim().toUpperCase())
            .filter(Boolean)
        )
      );
    }

    if (contractIds.length === 0) {
      return NextResponse.json(
        { error: "No contracts found" },
        { status: 404 }
      );
    }

    const { data: metricRows, error: metricError } = await supabase
      .from("ma_metrics")
      .select("contract_id, metric_code, metric_label, rate_percent, star_rating, year")
      .in("contract_id", contractIds)
      .in("year", years)
      .order("year", { ascending: true });

    if (metricError) {
      throw new Error(metricError.message);
    }

    const { chartData, groupDetails } = computeConditionGroupData(
      (metricRows as MetricEntry[]) || [],
      measuresByYearCode,
      years
    );

    const latestYear = Math.max(...years);

    type StateInfo = { stateCode: string; stateName: string; contractCount: number };
    type ChartSpecOut = {
      title: string;
      type: "bar";
      xKey: string;
      xLabelKey: string;
      xLabelMaxLines: number;
      xLabelLineLength: number;
      xLabelAngle: number;
      xLabelPadding: number;
      highlightLegendSelected: string;
      highlightLegendPeers: string;
      series: { key: string; name: string }[];
      data: Record<string, string | number | null>[];
      highlightKey: string;
      highlightValue: string;
      yAxisDomain?: [number, number];
      yAxisTicks?: number[];
    };

    let stateInfo: StateInfo | null = null;
    let stateGroupCharts: ChartSpecOut[] = [];
    let stateMeasureChartsByGroup: Record<string, ChartSpecOut[]> = {};
    let stateComparison: { contractCount: number; groupDetails: GroupDetailResult[] } | null = null;

    if (stateCode && US_STATE_NAMES[stateCode]) {
      const yearsList = years.map((y) => escapeLiteral(String(y))).join(", ");
      const stateMetricsQuery = `
        WITH state_contracts AS (
          SELECT DISTINCT contract_id
          FROM ma_plan_landscape
          WHERE state_abbreviation = '${escapeLiteral(stateCode)}'
        )
        SELECT m.contract_id, m.metric_code, m.metric_label, m.rate_percent, m.star_rating, m.year
        FROM ma_metrics m
        JOIN state_contracts sc ON sc.contract_id = m.contract_id
        WHERE m.year IN (${yearsList})
        ORDER BY m.contract_id ASC
      `;

      const countQuery = `
        SELECT COUNT(DISTINCT contract_id) AS cnt
        FROM ma_plan_landscape
        WHERE state_abbreviation = '${escapeLiteral(stateCode)}'
      `;

      const [metricsResult, countResult] = await Promise.all([
        (supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>)(
          "exec_raw_sql", { query: stateMetricsQuery }
        ),
        (supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>)(
          "exec_raw_sql", { query: countQuery }
        ),
      ]);

      if (!metricsResult.error) {
        const stateMetricRows = Array.isArray(metricsResult.data) ? (metricsResult.data as MetricEntry[]) : [];
        const stateContractCount =
          Array.isArray(countResult.data) && countResult.data.length > 0
            ? Number((countResult.data[0] as { cnt: number }).cnt) || 0
            : 0;

        const stateContractIds = Array.from(
          new Set(stateMetricRows.map((r) => r.contract_id.trim().toUpperCase()).filter(Boolean))
        );

        const { data: stateContractMeta } = await supabase
          .from("ma_contracts")
          .select("contract_id, contract_name, organization_marketing_name")
          .in("contract_id", stateContractIds);

        const nameMap = new Map<string, string>();
        (stateContractMeta || []).forEach((row: { contract_id: string; contract_name: string | null; organization_marketing_name: string | null }) => {
          const id = row.contract_id.trim().toUpperCase();
          nameMap.set(id, row.organization_marketing_name || row.contract_name || id);
        });

        if (stateMetricRows.length > 0) {
          const stateAvgData = computeConditionGroupData(stateMetricRows, measuresByYearCode, years);
          stateComparison = {
            contractCount: stateContractCount,
            groupDetails: stateAvgData.groupDetails,
          };
        }

        const latestYearRows = stateMetricRows.filter((r) => r.year === latestYear);

        const contractGroupAccs = new Map<string, Map<string, { totalWeightedStars: number; totalWeight: number }>>();
        const measureAccsByGroup = new Map<string, Map<string, Map<string, { code: string; displayName: string; stars: number[]; rates: number[] }>>>();

        for (const group of CONDITION_GROUPS) {
          measureAccsByGroup.set(group.id, new Map());
        }

        for (const entry of latestYearRows) {
          const cId = entry.contract_id.trim().toUpperCase();
          const code = normalizeCode(entry.metric_code);
          const metaKey = `${entry.year}|${code}`;
          const resolvedName = measuresByYearCode.get(metaKey)?.name?.trim() || entry.metric_label?.trim() || code;
          const group = matchMeasureToGroup(resolvedName);
          if (!group) continue;

          const meta = measuresByYearCode.get(metaKey);
          const weight = meta?.weight ?? 1;
          const starRaw = entry.star_rating ? Number.parseFloat(entry.star_rating) : null;
          const hasStar = starRaw !== null && Number.isFinite(starRaw) && starRaw > 0;

          if (!contractGroupAccs.has(cId)) contractGroupAccs.set(cId, new Map());
          const cGroups = contractGroupAccs.get(cId)!;
          if (!cGroups.has(group.id)) cGroups.set(group.id, { totalWeightedStars: 0, totalWeight: 0 });
          const gAcc = cGroups.get(group.id)!;
          if (hasStar) {
            gAcc.totalWeightedStars += starRaw! * weight;
            gAcc.totalWeight += weight;
          }

          const normalizedName = resolvedName.replace(/\s+/g, " ").trim().toLowerCase();
          const groupMeasures = measureAccsByGroup.get(group.id)!;
          if (!groupMeasures.has(normalizedName)) groupMeasures.set(normalizedName, new Map());
          const measureContracts = groupMeasures.get(normalizedName)!;
          if (!measureContracts.has(cId)) {
            measureContracts.set(cId, { code, displayName: resolvedName, stars: [], rates: [] });
          }
          const mAcc = measureContracts.get(cId)!;
          if (hasStar) mAcc.stars.push(starRaw!);
          if (entry.rate_percent !== null && Number.isFinite(entry.rate_percent)) {
            mAcc.rates.push(entry.rate_percent);
          }
        }

        const chartLabelOpts = {
          xLabelKey: "label",
          xLabelMaxLines: 1,
          xLabelLineLength: 8,
          xLabelAngle: -60,
          xLabelPadding: 36,
          highlightLegendSelected: "Selected Contract",
          highlightLegendPeers: "State Contracts",
        };
        const selectedContract = contractId || contractIds[0];

        stateGroupCharts = CONDITION_GROUPS.map((group) => {
          const data: Record<string, string | number | null>[] = [];
          for (const [cId, groups] of contractGroupAccs) {
            const acc = groups.get(group.id);
            if (!acc || acc.totalWeight === 0) continue;
            const score = Math.round((acc.totalWeightedStars / acc.totalWeight) * 100) / 100;
            data.push({ contract: cId, score, label: nameMap.get(cId) || cId });
          }
          if (data.length === 0) return null;
          data.sort((a, b) => ((a.score as number) ?? 0) - ((b.score as number) ?? 0));
          return {
            title: `${group.label} — Weighted Score (${latestYear})`,
            type: "bar" as const,
            xKey: "contract",
            ...chartLabelOpts,
            series: [{ key: "score", name: "Weighted Stars" }],
            data,
            highlightKey: "contract",
            highlightValue: selectedContract,
            yAxisDomain: [0, 5] as [number, number],
            yAxisTicks: [0, 1, 2, 3, 4, 5],
          };
        }).filter((c): c is NonNullable<typeof c> => c !== null);

        for (const group of CONDITION_GROUPS) {
          const groupMeasures = measureAccsByGroup.get(group.id)!;
          const charts: ChartSpecOut[] = [];

          for (const [, contractMap] of Array.from(groupMeasures.entries()).sort(([a], [b]) => a.localeCompare(b))) {
            let displayName = "";
            const data: Record<string, string | number | null>[] = [];
            let hasRateValues = false;
            let hasStarValues = false;

            for (const [cId, mAcc] of contractMap) {
              displayName = mAcc.displayName;
              const avgRate = mAcc.rates.length > 0 ? mAcc.rates.reduce((s, v) => s + v, 0) / mAcc.rates.length : null;
              const avgStar = mAcc.stars.length > 0 ? mAcc.stars.reduce((s, v) => s + v, 0) / mAcc.stars.length : null;
              if (avgRate !== null) hasRateValues = true;
              if (avgStar !== null && avgRate === null) hasStarValues = true;
              const value = avgRate ?? avgStar;
              if (value === null) continue;
              data.push({ contract: cId, value, star: avgStar, label: nameMap.get(cId) || cId });
            }

            if (data.length === 0) continue;
            data.sort((a, b) => ((a.value as number) ?? 0) - ((b.value as number) ?? 0));
            const usesStarsOnly = !hasRateValues && hasStarValues;

            charts.push({
              title: `${displayName} (${latestYear})`,
              type: "bar" as const,
              xKey: "contract",
              ...chartLabelOpts,
              series: [{ key: "value", name: usesStarsOnly ? "Stars" : "Rate %" }],
              data,
              highlightKey: "contract",
              highlightValue: selectedContract,
              ...(usesStarsOnly ? { yAxisDomain: [0, 5] as [number, number], yAxisTicks: [0, 1, 2, 3, 4, 5] } : {}),
            });
          }

          stateMeasureChartsByGroup[group.id] = charts;
        }

        stateInfo = {
          stateCode,
          stateName: US_STATE_NAMES[stateCode] ?? stateCode,
          contractCount: stateContractCount,
        };
      } else {
        console.error("State metrics query failed:", metricsResult.error.message);
      }
    }

    let nationalComparison: {
      contractCount: number;
      groupDetails: GroupDetailResult[];
    } | null = null;

    if (contractId) {
      const yearsList = years.map((y) => escapeLiteral(String(y))).join(", ");
      const nationalMetricsQuery = `
        SELECT contract_id, metric_code, metric_label, rate_percent, star_rating, year
        FROM ma_metrics
        WHERE year IN (${yearsList})
        ORDER BY year ASC
      `;

      const nationalCountQuery = `
        SELECT COUNT(DISTINCT contract_id) AS cnt
        FROM ma_metrics
        WHERE year IN (${yearsList})
      `;

      const [nationalMetricsResult, nationalCountResult] = await Promise.all([
        (supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>)(
          "exec_raw_sql", { query: nationalMetricsQuery }
        ),
        (supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>)(
          "exec_raw_sql", { query: nationalCountQuery }
        ),
      ]);

      if (nationalMetricsResult.error) {
        console.error("National metrics query failed:", nationalMetricsResult.error.message);
      } else {
        const nationalMetricRows = Array.isArray(nationalMetricsResult.data)
          ? (nationalMetricsResult.data as MetricEntry[])
          : [];
        const nationalContractCount =
          Array.isArray(nationalCountResult.data) && nationalCountResult.data.length > 0
            ? Number((nationalCountResult.data[0] as { cnt: number }).cnt) || 0
            : 0;

        if (nationalMetricRows.length > 0) {
          const nationalData = computeConditionGroupData(nationalMetricRows, measuresByYearCode, years);
          nationalComparison = {
            contractCount: nationalContractCount,
            groupDetails: nationalData.groupDetails,
          };
        }
      }
    }

    return NextResponse.json({
      years,
      chartData,
      groupDetails,
      groups: CONDITION_GROUPS.map((g) => ({
        id: g.id,
        label: g.label,
        color: g.color,
      })),
      stateInfo,
      stateComparison,
      stateGroupCharts,
      stateMeasureChartsByGroup,
      nationalComparison,
    });
  } catch (error) {
    console.error("Condition groups API error:", error);
    return NextResponse.json(
      {
        error: "Failed to build condition group analysis",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
