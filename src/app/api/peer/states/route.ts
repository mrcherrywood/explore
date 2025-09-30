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
      landscape AS (
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
      ),
      enrollment AS (
        SELECT
          l.state_abbreviation AS state,
          CASE
            WHEN COUNT(*) FILTER (WHERE e.enrollment IS NOT NULL) = 0 THEN NULL
            ELSE SUM(e.enrollment) FILTER (WHERE e.enrollment IS NOT NULL)
          END AS total_enrollment,
          ARRAY_AGG(DISTINCT l.plan_type_group) AS plan_type_groups
        FROM ma_plan_enrollment e
        JOIN latest_period lp
          ON lp.report_year = e.report_year
         AND lp.report_month = e.report_month
        JOIN landscape l
          ON l.contract_id = e.contract_id
         AND l.plan_id = e.plan_id
        WHERE e.contract_id = '${escapeLiteral(contractId)}'
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

    const states = rows
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
