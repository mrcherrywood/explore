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

async function main() {
  console.log('🔍 Debugging leaderboard contract landscape...\n');

  // Get latest period
  const { data: periodData } = await supabase
    .from('ma_plan_enrollment')
    .select('report_year, report_month')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!periodData) {
    console.log('⚠️  No enrollment period data found');
    return;
  }

  console.log(`Latest period: ${periodData.report_year}-${periodData.report_month}\n`);

  // Run the full landscape query
  const query = `
    WITH plan_features AS (
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
      JOIN ma_plan_enrollment pe
        ON pe.contract_id = pl.contract_id
       AND pe.plan_id = pl.plan_id
       AND pe.report_year = ${periodData.report_year}
       AND pe.report_month = ${periodData.report_month}
      LEFT JOIN ma_contracts c
        ON c.contract_id = pl.contract_id
      WHERE pl.state_abbreviation IS NOT NULL
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
       AND pe.report_year = ${periodData.report_year}
       AND pe.report_month = ${periodData.report_month}
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
    LIMIT 10
  `;

  const { data: landscapeData, error: landscapeError } = await supabase.rpc('exec_raw_sql', { query });

  if (landscapeError) {
    console.error('❌ Error running landscape query:', landscapeError);
    return;
  }

  console.log('✅ Landscape query returned', Array.isArray(landscapeData) ? landscapeData.length : 0, 'rows\n');
  
  if (Array.isArray(landscapeData) && landscapeData.length > 0) {
    console.log('Sample contracts:');
    landscapeData.slice(0, 5).forEach((row: any) => {
      console.log(`  - ${row.contract_id}: ${row.contract_name || 'N/A'}`);
      console.log(`    Org: ${row.parent_organization || 'N/A'}`);
      console.log(`    Enrollment: ${row.total_enrollment}`);
      console.log(`    Plan types: ${JSON.stringify(row.plan_type_groups)}`);
      console.log(`    Dominant state: ${row.dominant_state} (${row.dominant_share})`);
    });
  }

  // Now test summary_ratings join
  console.log('\n🔍 Checking summary_ratings for these contracts...\n');
  
  const { data: summaryData, error: summaryError } = await supabase
    .from('summary_ratings')
    .select('contract_id, year, overall_rating_numeric')
    .limit(10);

  if (summaryError) {
    console.error('❌ Error querying summary_ratings:', summaryError);
  } else {
    console.log('✅ Summary ratings sample:');
    summaryData?.slice(0, 5).forEach((row: any) => {
      console.log(`  - ${row.contract_id}: ${row.overall_rating_numeric} (${row.year})`);
    });
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
