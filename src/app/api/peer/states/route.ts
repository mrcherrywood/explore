import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatEnrollment, getEnrollmentLevel } from "@/lib/peer/enrollment-levels";

export const runtime = "nodejs";

type RpcRow = {
  state: string | null;
  total_enrollment: number | null;
  plan_type_groups: string[] | null;
};

function escapeLiteral(value: string) {
  return value.replace(/'/g, "''");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contractId = typeof body?.contractId === "string" ? body.contractId.trim() : "";

    if (!contractId) {
      return NextResponse.json({ error: "contractId is required" }, { status: 400 });
    }

    let supabase;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("Peer states API configuration error:", clientError);
      return NextResponse.json(
        {
          error: "Supabase credentials not configured",
          code: "SUPABASE_CONFIG_MISSING",
        },
        { status: 503 }
      );
    }

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
      return NextResponse.json({ states: [] });
    }

    const { report_year, report_month } = periodRow as { report_year: number; report_month: number };

    const query = `
      WITH latest_period AS (
        SELECT ${report_year}::int AS report_year, ${report_month}::int AS report_month
      ),
      contract_landscape AS (
        SELECT DISTINCT
          pl.contract_id,
          pl.plan_id,
          pl.state_abbreviation,
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
        WHERE pl.state_abbreviation IS NOT NULL
          AND pl.contract_id = '${escapeLiteral(contractId)}'
      ),
      enrollment AS (
        SELECT
          l.state_abbreviation AS state,
          CASE
            WHEN COUNT(*) FILTER (WHERE e.enrollment IS NOT NULL) = 0 THEN NULL
            ELSE SUM(e.enrollment) FILTER (WHERE e.enrollment IS NOT NULL)
          END AS total_enrollment,
          ARRAY_AGG(DISTINCT l.plan_type_group) AS plan_type_groups
        FROM contract_landscape l
        LEFT JOIN latest_period lp ON TRUE
        LEFT JOIN ma_plan_enrollment e
          ON e.contract_id = l.contract_id
         AND e.plan_id = l.plan_id
         AND e.report_year = lp.report_year
         AND e.report_month = lp.report_month
        GROUP BY l.state_abbreviation
      )
      SELECT state, total_enrollment, plan_type_groups
      FROM enrollment
      ORDER BY total_enrollment DESC NULLS LAST, state ASC
    `;

    const { data: rpcResult, error: rpcError } = await (supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>)("exec_raw_sql", { query });

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    const rows: RpcRow[] = Array.isArray(rpcResult) ? (rpcResult as RpcRow[]) : [];

    let states = rows
      .filter((row) => row.state)
      .map((row) => {
        const enrollmentTotal =
          row.total_enrollment === null || typeof row.total_enrollment !== "number"
            ? null
            : Number(row.total_enrollment);
        const level = getEnrollmentLevel(enrollmentTotal);
        return {
          state: row.state as string,
          totalEnrollment: enrollmentTotal,
          enrollmentLevel: level,
          formattedEnrollment: formatEnrollment(enrollmentTotal),
          availablePlanTypes: Array.isArray(row.plan_type_groups) ? row.plan_type_groups : [],
        };
      });

    if (states.length === 0) {
      const { data: landscapeRows, error: landscapeError } = await supabase
        .from("ma_plan_landscape")
        .select("plan_type, special_needs_plan_indicator")
        .eq("contract_id", contractId)
        .limit(2000);

      if (landscapeError) {
        throw new Error(landscapeError.message);
      }

      const fallbackPlanTypes = new Set<string>();
      (landscapeRows ?? []).forEach((row: { plan_type: string | null; special_needs_plan_indicator: string | null }) => {
        const planType = (row.plan_type ?? "").toLowerCase();
        const snpIndicator = (row.special_needs_plan_indicator ?? "").toLowerCase();
        if (planType.includes("snp") || snpIndicator.startsWith("yes")) {
          fallbackPlanTypes.add("SNP");
        } else {
          fallbackPlanTypes.add("NOT");
        }
      });

      states = [
        {
          state: "ALL",
          totalEnrollment: null,
          enrollmentLevel: getEnrollmentLevel(null),
          formattedEnrollment: formatEnrollment(null),
          availablePlanTypes: Array.from(fallbackPlanTypes.size ? fallbackPlanTypes : ["ALL"]),
        },
      ];
    }

    const summedEnrollment = states.reduce((acc, entry) => {
      if (entry.totalEnrollment === null) {
        return acc;
      }
      return acc + entry.totalEnrollment;
    }, 0);

    const hasReportedEnrollment = states.some((entry) => entry.totalEnrollment !== null);
    const contractTotalEnrollment = hasReportedEnrollment ? summedEnrollment : null;
    const contractEnrollmentLevel = getEnrollmentLevel(contractTotalEnrollment);

    return NextResponse.json({
      period: { year: report_year, month: report_month },
      states,
      contractEnrollment: {
        total: contractTotalEnrollment,
        level: contractEnrollmentLevel,
        formattedTotal: formatEnrollment(contractTotalEnrollment),
      },
    });
  } catch (error) {
    console.error("Peer states API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch states",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
