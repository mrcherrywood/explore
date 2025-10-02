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
  console.log('🔍 Testing actual landscape query with exec_raw_sql...\n');

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

  console.log(`Period: ${periodData.report_year}-${periodData.report_month}\n`);

  // Test if exec_raw_sql exists
  const testQuery = `SELECT 'test' as result`;
  const { data: testData, error: testError } = await supabase.rpc('exec_raw_sql', { query: testQuery });

  if (testError) {
    console.error('❌ exec_raw_sql function error:', testError);
    console.log('\nThe exec_raw_sql function may not exist in the database.');
    console.log('This function needs to be created for the leaderboard to work.');
    return;
  }

  console.log('✅ exec_raw_sql function exists\n');

  // Now test a simple contract query
  const simpleQuery = `
    SELECT contract_id
    FROM ma_plan_enrollment
    WHERE report_year = ${periodData.report_year}
      AND report_month = ${periodData.report_month}
    GROUP BY contract_id
    LIMIT 10
  `;

  const { data: simpleData, error: simpleError } = await supabase.rpc('exec_raw_sql', { query: simpleQuery });

  if (simpleError) {
    console.error('❌ Simple query error:', simpleError);
    return;
  }

  console.log('✅ Simple query returned:', simpleData);
  console.log(`   Type: ${typeof simpleData}, Is Array: ${Array.isArray(simpleData)}`);
  if (Array.isArray(simpleData)) {
    console.log(`   Length: ${simpleData.length}`);
    console.log(`   Sample:`, simpleData.slice(0, 3));
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
