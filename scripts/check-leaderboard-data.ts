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
  console.log('🔍 Checking leaderboard data sources...\n');

  // Check ma_plan_enrollment
  const { data: enrollmentData, error: enrollmentError } = await supabase
    .from('ma_plan_enrollment')
    .select('report_year, report_month, contract_id, plan_id')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(5);

  if (enrollmentError) {
    console.error('❌ Error querying ma_plan_enrollment:', enrollmentError);
  } else {
    console.log(`✅ ma_plan_enrollment has ${enrollmentData?.length ?? 0} sample rows`);
    console.log('   Latest periods:', enrollmentData?.slice(0, 3).map(d => `${d.report_year}-${d.report_month}`).join(', '));
  }

  // Count total enrollment records
  const { count: enrollmentCount, error: countError } = await supabase
    .from('ma_plan_enrollment')
    .select('*', { count: 'exact', head: true });

  if (!countError) {
    console.log(`   Total enrollment records: ${enrollmentCount}\n`);
  }

  // Check ma_contracts
  const { count: contractCount, error: contractError } = await supabase
    .from('ma_contracts')
    .select('*', { count: 'exact', head: true });

  if (contractError) {
    console.error('❌ Error querying ma_contracts:', contractError);
  } else {
    console.log(`✅ ma_contracts has ${contractCount} records\n`);
  }

  // Check ma_plan_landscape
  const { count: landscapeCount, error: landscapeError } = await supabase
    .from('ma_plan_landscape')
    .select('*', { count: 'exact', head: true });

  if (landscapeError) {
    console.error('❌ Error querying ma_plan_landscape:', landscapeError);
  } else {
    console.log(`✅ ma_plan_landscape has ${landscapeCount} records\n`);
  }

  // Check summary_ratings
  const { count: summaryCount, error: summaryError } = await supabase
    .from('summary_ratings')
    .select('*', { count: 'exact', head: true });

  if (summaryError) {
    console.error('❌ Error querying summary_ratings:', summaryError);
  } else {
    console.log(`✅ summary_ratings has ${summaryCount} records\n`);
  }

  // Try the landscape query
  console.log('🔍 Testing fetchContractLandscape query...\n');
  
  const { data: periodData } = await supabase
    .from('ma_plan_enrollment')
    .select('report_year, report_month')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (periodData) {
    console.log(`Latest period: ${periodData.report_year}-${periodData.report_month}\n`);

    // Test the landscape query
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
      )
      SELECT COUNT(*) as count FROM plan_features
    `;

    const { data: testData, error: testError } = await supabase.rpc('exec_raw_sql', { query });

    if (testError) {
      console.error('❌ Error testing landscape query:', testError);
    } else {
      console.log('✅ Landscape query result:', testData);
    }
  } else {
    console.log('⚠️  No enrollment period data found');
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
