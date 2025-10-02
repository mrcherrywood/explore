import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

async function main() {
  console.log('🔍 Debugging API data flow step by step...\n');

  // Step 1: Get period
  const { data: periodData } = await supabase
    .from('ma_plan_enrollment')
    .select('report_year, report_month')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!periodData) {
    console.log('No period data');
    return;
  }

  console.log(`Step 1: Period = ${periodData.report_year}-${periodData.report_month}`);

  // Step 2: Run the EXACT query from the code
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
      WHERE pe.report_year = ${escapeLiteral(String(periodData.report_year))}
        AND pe.report_month = ${escapeLiteral(String(periodData.report_month))}
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
       AND pe.report_year = ${escapeLiteral(String(periodData.report_year))}
       AND pe.report_month = ${escapeLiteral(String(periodData.report_month))}
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

  const { data: landscapeData, error } = await supabase.rpc('exec_raw_sql', { query });

  if (error) {
    console.error('Step 2 ERROR:', error);
    return;
  }

  console.log(`Step 2: Landscape query returned ${Array.isArray(landscapeData) ? landscapeData.length : 0} rows`);

  if (!Array.isArray(landscapeData)) {
    console.log('Step 2: Data is not an array!', typeof landscapeData);
    return;
  }

  // Step 3: Build contract records
  const contractRecords = new Map();
  for (const row of landscapeData) {
    const contractId = row.contract_id?.trim().toUpperCase();
    if (!contractId) continue;
    contractRecords.set(contractId, row);
  }

  console.log(`Step 3: Built ${contractRecords.size} contract records`);

  // Step 4: Get summary ratings
  const contractIds = Array.from(contractRecords.keys());
  const { data: summaryData } = await supabase
    .from('summary_ratings')
    .select('contract_id, year, overall_rating_numeric, overall_rating')
    .in('contract_id', contractIds);

  console.log(`Step 4: Found ${summaryData?.length || 0} summary rating rows for these contracts`);

  // Step 5: Process ratings
  const years = Array.from(new Set(summaryData?.map(r => r.year) || [])).sort((a, b) => b - a);
  const dataYear = years[0] ?? null;
  const priorYear = years.find(y => y < (dataYear ?? y)) ?? null;

  console.log(`Step 5: dataYear=${dataYear}, priorYear=${priorYear}`);

  const overall = new Map();
  for (const row of summaryData || []) {
    const contractId = row.contract_id?.trim().toUpperCase();
    if (!contractId) continue;

    const value = row.overall_rating_numeric ?? (typeof row.overall_rating === 'number' ? row.overall_rating : null);
    
    if (!overall.has(contractId)) {
      overall.set(contractId, { current: null, prior: null });
    }

    if (row.year === dataYear) {
      overall.get(contractId).current = value;
    }
    if (row.year === priorYear) {
      overall.get(contractId).prior = value;
    }
  }

  console.log(`Step 6: Created ${overall.size} snapshot entries`);

  // Step 7: Match snapshots with records
  let matched = 0;
  let withCurrentValue = 0;
  for (const [id, snapshot] of overall.entries()) {
    const record = contractRecords.get(id);
    if (!record) continue;
    matched++;
    if (snapshot.current !== null) {
      withCurrentValue++;
    }
  }

  console.log(`Step 7: ${matched} snapshots matched with contract records`);
  console.log(`Step 8: ${withCurrentValue} have current (2025) values`);

  console.log(`\n❌ PROBLEM: Only ${withCurrentValue} contracts have 2025 ratings!`);
  console.log('Expected: ~500 contracts with ratings');
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
