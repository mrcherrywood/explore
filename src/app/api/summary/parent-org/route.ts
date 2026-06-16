import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function escapeLiteral(value: string) {
  return value.replace(/'/g, "''");
}

type ContractRow = {
  contract_id: string;
  contract_name: string | null;
  organization_marketing_name: string | null;
  organization_type: string | null;
  snp_indicator: string | null;
};

type RatingRow = {
  contract_id: string;
  overall_rating: string | null;
  overall_rating_numeric: number | null;
  part_c_summary: string | null;
  part_c_summary_numeric: number | null;
  part_d_summary: string | null;
  part_d_summary_numeric: number | null;
};

type StateEnrollmentRow = {
  contract_id: string | null;
  state: string | null;
  total_enrollment: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const parentOrgParam = searchParams.get('parentOrg');

    const supabase = createServiceRoleClient();

    // Resolve year (default to latest in ma_contracts)
    let year: number;
    const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : NaN;
    if (Number.isFinite(parsedYear)) {
      year = parsedYear;
    } else {
      const { data: latestYearRow } = await supabase
        .from('ma_contracts')
        .select('year')
        .order('year', { ascending: false })
        .limit(1)
        .maybeSingle();
      year = (latestYearRow as { year: number } | null)?.year ?? new Date().getFullYear();
    }

    // Available years for the filter
    const { data: yearRows } = await supabase
      .from('ma_contracts')
      .select('year')
      .order('year', { ascending: false })
      .limit(5000);
    const availableYears = Array.from(
      new Set(((yearRows || []) as { year: number }[]).map((row) => row.year))
    );

    // Available parent orgs for the selected year
    const { data: parentRows } = await supabase
      .from('ma_contracts')
      .select('parent_organization')
      .eq('year', year)
      .not('parent_organization', 'is', null);

    const availableParentOrgs = Array.from(
      new Set(
        ((parentRows || []) as { parent_organization: string | null }[])
          .map((row) => (row.parent_organization || '').trim())
          .filter((value) => value.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));

    let parentOrg = parentOrgParam?.trim() || '';
    if (!parentOrg && availableParentOrgs.length > 0) {
      parentOrg = availableParentOrgs[0];
    }

    if (!parentOrg) {
      return NextResponse.json({
        year,
        parentOrg: null,
        availableYears,
        availableParentOrgs,
        contracts: [],
        statesEnrollment: [],
        totals: null,
        enrollmentPeriod: null,
      });
    }

    // Contracts that belong to this parent org for the selected year
    const { data: contractRows } = await supabase
      .from('ma_contracts')
      .select('contract_id, contract_name, organization_marketing_name, organization_type, snp_indicator')
      .eq('year', year)
      .eq('parent_organization', parentOrg)
      .order('contract_id');

    const contracts = (contractRows || []) as ContractRow[];
    const contractIds = contracts
      .map((row) => (row.contract_id || '').trim().toUpperCase())
      .filter((id) => id.length > 0);

    // CMS summary ratings per contract
    const ratingsMap = new Map<string, RatingRow>();
    if (contractIds.length > 0) {
      const { data: ratingRows } = await supabase
        .from('summary_ratings')
        .select(
          'contract_id, overall_rating, overall_rating_numeric, part_c_summary, part_c_summary_numeric, part_d_summary, part_d_summary_numeric'
        )
        .eq('year', year)
        .in('contract_id', contractIds);

      for (const row of (ratingRows || []) as RatingRow[]) {
        ratingsMap.set((row.contract_id || '').trim().toUpperCase(), row);
      }
    }

    // Enrollment by state for the parent org, using the latest enrollment period
    const perContractEnrollment = new Map<string, number>();
    const perContractStates = new Map<string, Set<string>>();
    const stateTotals = new Map<string, number>();
    let enrollmentPeriod: { year: number; month: number } | null = null;

    if (contractIds.length > 0) {
      const { data: periodRow } = await supabase
        .from('ma_plan_enrollment')
        .select('report_year, report_month')
        .order('report_year', { ascending: false })
        .order('report_month', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (periodRow) {
        const { report_year, report_month } = periodRow as { report_year: number; report_month: number };
        enrollmentPeriod = { year: report_year, month: report_month };

        const inList = contractIds.map((id) => `'${escapeLiteral(id)}'`).join(', ');
        const query = `
          WITH latest_period AS (
            SELECT ${report_year}::int AS report_year, ${report_month}::int AS report_month
          ),
          contract_landscape AS (
            SELECT DISTINCT
              pl.contract_id,
              pl.plan_id,
              pl.state_abbreviation
            FROM ma_plan_landscape pl
            JOIN latest_period lp ON lp.report_year = pl.year
            WHERE pl.state_abbreviation IS NOT NULL
              AND pl.contract_id IN (${inList})
          ),
          enrollment AS (
            SELECT
              l.contract_id,
              l.state_abbreviation AS state,
              SUM(e.enrollment) FILTER (WHERE e.enrollment IS NOT NULL) AS total_enrollment
            FROM contract_landscape l
            LEFT JOIN latest_period lp ON TRUE
            LEFT JOIN ma_plan_enrollment e
              ON e.contract_id = l.contract_id
             AND e.plan_id = l.plan_id
             AND e.report_year = lp.report_year
             AND e.report_month = lp.report_month
            GROUP BY l.contract_id, l.state_abbreviation
          )
          SELECT contract_id, state, total_enrollment
          FROM enrollment
          ORDER BY total_enrollment DESC NULLS LAST, state ASC
        `;

        const { data: rpcResult, error: rpcError } = await (
          supabase.rpc as unknown as <T>(fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: Error | null }>
        )('exec_raw_sql', { query });

        if (rpcError) {
          throw new Error(rpcError.message);
        }

        const rows: StateEnrollmentRow[] = Array.isArray(rpcResult) ? (rpcResult as StateEnrollmentRow[]) : [];

        for (const row of rows) {
          const contractId = (row.contract_id || '').trim().toUpperCase();
          const state = (row.state || '').trim();
          const enrollment =
            row.total_enrollment === null || typeof row.total_enrollment !== 'number'
              ? null
              : Number(row.total_enrollment);

          if (!state) continue;

          if (enrollment !== null && Number.isFinite(enrollment)) {
            stateTotals.set(state, (stateTotals.get(state) || 0) + enrollment);
            if (contractId) {
              perContractEnrollment.set(contractId, (perContractEnrollment.get(contractId) || 0) + enrollment);
            }
          }

          if (contractId) {
            if (!perContractStates.has(contractId)) {
              perContractStates.set(contractId, new Set<string>());
            }
            perContractStates.get(contractId)!.add(state);
          }
        }
      }
    }

    const totalParentEnrollment = Array.from(stateTotals.values()).reduce((sum, value) => sum + value, 0);

    const statesEnrollment = Array.from(stateTotals.entries())
      .map(([state, enrollment]) => ({
        state,
        enrollment,
        percent: totalParentEnrollment > 0 ? (enrollment / totalParentEnrollment) * 100 : null,
      }))
      .sort((a, b) => b.enrollment - a.enrollment);

    const toNumericRating = (numeric: number | null, text: string | null): number | null => {
      if (typeof numeric === 'number' && Number.isFinite(numeric)) {
        return numeric;
      }
      if (text) {
        const match = text.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          const parsed = Number.parseFloat(match[1]);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
      return null;
    };

    const contractsOut = contracts.map((row) => {
      const contractId = (row.contract_id || '').trim().toUpperCase();
      const rating = ratingsMap.get(contractId);
      const enrollment = perContractEnrollment.has(contractId) ? perContractEnrollment.get(contractId)! : null;
      return {
        contract_id: contractId,
        contract_name: row.contract_name,
        organization_marketing_name: row.organization_marketing_name,
        organization_type: row.organization_type,
        snp_indicator: row.snp_indicator,
        overall: toNumericRating(rating?.overall_rating_numeric ?? null, rating?.overall_rating ?? null),
        partC: toNumericRating(rating?.part_c_summary_numeric ?? null, rating?.part_c_summary ?? null),
        partD: toNumericRating(rating?.part_d_summary_numeric ?? null, rating?.part_d_summary ?? null),
        enrollment,
        statesServed: perContractStates.get(contractId)?.size ?? 0,
        enrollmentPercent:
          enrollment !== null && totalParentEnrollment > 0 ? (enrollment / totalParentEnrollment) * 100 : null,
      };
    });

    // Enrollment-weighted and simple average overall rating across rated contracts
    let weightedSum = 0;
    let weightedWeight = 0;
    let simpleSum = 0;
    let simpleCount = 0;
    for (const contract of contractsOut) {
      if (contract.overall === null) continue;
      simpleSum += contract.overall;
      simpleCount += 1;
      if (contract.enrollment !== null && contract.enrollment > 0) {
        weightedSum += contract.overall * contract.enrollment;
        weightedWeight += contract.enrollment;
      }
    }

    const totals = {
      contractCount: contractsOut.length,
      ratedContractCount: simpleCount,
      totalEnrollment: enrollmentPeriod ? totalParentEnrollment : null,
      statesServed: stateTotals.size,
      avgOverall: simpleCount > 0 ? simpleSum / simpleCount : null,
      enrollmentWeightedOverall: weightedWeight > 0 ? weightedSum / weightedWeight : null,
    };

    return NextResponse.json({
      year,
      parentOrg,
      availableYears,
      availableParentOrgs,
      contracts: contractsOut,
      statesEnrollment,
      totals,
      enrollmentPeriod,
    });
  } catch (error) {
    console.error('Parent org summary API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch parent organization summary' },
      { status: 500 }
    );
  }
}
