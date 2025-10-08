import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type ServiceSupabaseClient = SupabaseClient<Database>;

export type LatestEnrollmentPeriod = {
  reportYear: number;
  reportMonth: number;
};

export type ContractLandscapeRow = {
  contract_id: string;
  contract_name: string | null;
  organization_marketing_name: string | null;
  parent_organization: string | null;
  total_enrollment: number | null;
  plan_type_groups: string[];
  dominant_state: string | null;
  dominant_share: number | null;
  is_blue_cross_blue_shield: boolean | null;
};

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export async function fetchLatestEnrollmentPeriod(
  supabase: ServiceSupabaseClient
): Promise<LatestEnrollmentPeriod | null> {
  const { data, error } = await supabase
    .from("ma_plan_enrollment")
    .select("report_year, report_month")
    .order("report_year", { ascending: false })
    .order("report_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    reportYear: (data as { report_year: number }).report_year,
    reportMonth: (data as { report_month: number }).report_month,
  };
}

export async function fetchContractLandscape(
  supabase: ServiceSupabaseClient,
  period: LatestEnrollmentPeriod
): Promise<ContractLandscapeRow[]> {
  const query = `
    WITH plan_features AS (
      SELECT DISTINCT
        pe.contract_id,
        pe.plan_id,
        COALESCE(pl.state_abbreviation, 'XX') AS state_abbreviation,
        CASE
          WHEN COALESCE(c.snp_indicator, '') ILIKE 'yes%'
            OR COALESCE(pl.special_needs_plan_indicator, '') ILIKE 'yes%'
            OR COALESCE(pe.plan_type, '') ILIKE '%snp%'
          THEN 'SNP'
          ELSE 'NOT'
        END AS plan_type_group
      FROM ma_plan_enrollment pe
      LEFT JOIN ma_plan_landscape pl
        ON pl.contract_id = pe.contract_id
       AND pl.plan_id = pe.plan_id
      LEFT JOIN ma_contracts c
        ON c.contract_id = pe.contract_id
      WHERE pe.report_year = ${escapeLiteral(String(period.reportYear))}
        AND pe.report_month = ${escapeLiteral(String(period.reportMonth))}
        AND pe.enrollment IS NOT NULL
    ),
    contract_state_enrollment AS (
      SELECT
        pf.contract_id,
        pf.state_abbreviation,
        CASE
          WHEN COUNT(*) FILTER (WHERE pe.enrollment IS NOT NULL) = 0 THEN NULL
          ELSE SUM(pe.enrollment) FILTER (WHERE pe.enrollment IS NOT NULL)
        END AS total_enrollment
      FROM plan_features pf
      JOIN ma_plan_enrollment pe
        ON pe.contract_id = pf.contract_id
       AND pe.plan_id = pf.plan_id
       AND pe.report_year = ${escapeLiteral(String(period.reportYear))}
       AND pe.report_month = ${escapeLiteral(String(period.reportMonth))}
      GROUP BY pf.contract_id, pf.state_abbreviation
    ),
    contract_totals AS (
      SELECT
        contract_id,
        CASE
          WHEN COUNT(*) FILTER (WHERE total_enrollment IS NOT NULL) = 0 THEN NULL
          ELSE SUM(total_enrollment) FILTER (WHERE total_enrollment IS NOT NULL)
        END AS total_enrollment
      FROM contract_state_enrollment
      GROUP BY contract_id
    ),
    dominant_state AS (
      SELECT
        cse.contract_id,
        cse.state_abbreviation,
        cse.total_enrollment,
        ct.total_enrollment AS contract_total,
        CASE
          WHEN ct.total_enrollment IS NULL OR ct.total_enrollment = 0 THEN NULL
          ELSE (cse.total_enrollment::numeric / ct.total_enrollment::numeric)
        END AS share,
        ROW_NUMBER() OVER (
          PARTITION BY cse.contract_id
          ORDER BY cse.total_enrollment DESC NULLS LAST, cse.state_abbreviation ASC
        ) AS rn
      FROM contract_state_enrollment cse
      JOIN contract_totals ct ON ct.contract_id = cse.contract_id
    ),
    plan_groups AS (
      SELECT
        contract_id,
        ARRAY_AGG(DISTINCT plan_type_group) AS plan_type_groups
      FROM plan_features
      GROUP BY contract_id
    )
    SELECT
      ct.contract_id,
      mc.contract_name,
      mc.organization_marketing_name,
      mc.parent_organization,
      mc.is_blue_cross_blue_shield,
      ct.total_enrollment,
      COALESCE(pg.plan_type_groups, ARRAY[]::text[]) AS plan_type_groups,
      ds.state_abbreviation AS dominant_state,
      ds.share AS dominant_share
    FROM contract_totals ct
    LEFT JOIN plan_groups pg ON pg.contract_id = ct.contract_id
    LEFT JOIN dominant_state ds
      ON ds.contract_id = ct.contract_id AND ds.rn = 1
    LEFT JOIN ma_contracts mc ON mc.contract_id = ct.contract_id
  `;

  const { data, error } = await (supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>) (
    "exec_raw_sql",
    { query }
  );

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return (data as ContractLandscapeRow[]).map((row) => ({
    contract_id: row.contract_id,
    contract_name: row.contract_name ?? null,
    organization_marketing_name: row.organization_marketing_name ?? null,
    parent_organization: row.parent_organization ?? null,
    total_enrollment:
      row.total_enrollment === null || row.total_enrollment === undefined
        ? null
        : Number(row.total_enrollment),
    plan_type_groups: Array.isArray(row.plan_type_groups)
      ? row.plan_type_groups.map((value) => String(value).toUpperCase())
      : [],
    dominant_state: row.dominant_state ?? null,
    dominant_share:
      row.dominant_share === null || row.dominant_share === undefined
        ? null
        : Number(row.dominant_share),
    is_blue_cross_blue_shield:
      row.is_blue_cross_blue_shield === null || row.is_blue_cross_blue_shield === undefined
        ? null
        : Boolean(row.is_blue_cross_blue_shield),
  }));
}
