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

function normalizeContractId(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

async function main() {
  console.log('🔍 Debugging contract ID matching...\n');

  const { data: periodData } = await supabase
    .from('ma_plan_enrollment')
    .select('report_year, report_month')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!periodData) return;

  // Get landscape contracts
  const query = `
    WITH plan_features AS (
      SELECT DISTINCT
        pe.contract_id
      FROM ma_plan_enrollment pe
      WHERE pe.report_year = ${escapeLiteral(String(periodData.report_year))}
        AND pe.report_month = ${escapeLiteral(String(periodData.report_month))}
        AND pe.enrollment IS NOT NULL
    )
    SELECT DISTINCT contract_id FROM plan_features LIMIT 20
  `;

  const { data: landscapeData } = await supabase.rpc('exec_raw_sql', { query });
  const landscapeIds = landscapeData?.map((r: any) => normalizeContractId(r.contract_id)) || [];

  console.log('Sample landscape contract IDs (normalized):');
  console.log(landscapeIds.slice(0, 10));

  // Get ratings for these contracts
  const { data: ratingsData } = await supabase
    .from('summary_ratings')
    .select('contract_id, year, overall_rating_numeric')
    .in('contract_id', landscapeIds)
    .eq('year', 2025);

  console.log(`\nQueried summary_ratings with ${landscapeIds.length} contract IDs`);
  console.log(`Found ${ratingsData?.length || 0} rating rows`);

  if (ratingsData && ratingsData.length > 0) {
    console.log('\nSample ratings found:');
    ratingsData.slice(0, 10).forEach((r: any) => {
      console.log(`  ${r.contract_id}: ${r.overall_rating_numeric}`);
    });

    // Check how many have numeric values
    const withNumeric = ratingsData.filter(r => r.overall_rating_numeric !== null);
    console.log(`\n${withNumeric.length} have non-null overall_rating_numeric`);
  }

  // Now check if H2610 (which we know has a rating) is in the landscape
  console.log('\n--- Checking specific contract H2610 ---');
  const h2610InLandscape = landscapeIds.includes('H2610');
  console.log(`H2610 in landscape IDs? ${h2610InLandscape}`);

  const { data: h2610Rating } = await supabase
    .from('summary_ratings')
    .select('contract_id, year, overall_rating_numeric')
    .eq('contract_id', 'H2610')
    .eq('year', 2025)
    .single();

  console.log(`H2610 rating in DB:`, h2610Rating);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
