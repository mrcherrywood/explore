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
  console.log('🔍 Finding missing contracts between landscape and ratings...\n');

  const { data: periodData } = await supabase
    .from('ma_plan_enrollment')
    .select('report_year, report_month')
    .order('report_year', { ascending: false })
    .order('report_month', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!periodData) {
    return;
  }

  // Get contracts from landscape query
  const landscapeQuery = `
    WITH plan_features AS (
      SELECT DISTINCT
        pl.contract_id,
        pl.plan_id,
        pl.state_abbreviation
      FROM ma_plan_landscape pl
      JOIN ma_plan_enrollment pe
        ON pe.contract_id = pl.contract_id
       AND pe.plan_id = pl.plan_id
       AND pe.report_year = ${periodData.report_year}
       AND pe.report_month = ${periodData.report_month}
      WHERE pl.state_abbreviation IS NOT NULL
    )
    SELECT DISTINCT contract_id
    FROM plan_features
  `;

  const { data: landscapeContracts } = await supabase.rpc('exec_raw_sql', { query: landscapeQuery });
  const landscapeSet = new Set(landscapeContracts?.map((r: any) => r.contract_id) || []);

  console.log(`Landscape contracts: ${landscapeSet.size}`);

  // Get contracts with 2025 ratings
  const { data: ratedContracts } = await supabase
    .from('summary_ratings')
    .select('contract_id')
    .eq('year', 2025)
    .not('overall_rating_numeric', 'is', null);

  const ratedSet = new Set(ratedContracts?.map(r => r.contract_id) || []);
  console.log(`Contracts with 2025 ratings: ${ratedSet.size}`);

  // Find intersection
  const intersection = new Set([...ratedSet].filter(id => landscapeSet.has(id)));
  console.log(`Contracts in BOTH: ${intersection.size}\n`);

  // Find contracts with ratings but NOT in landscape
  const missingFromLandscape = [...ratedSet].filter(id => !landscapeSet.has(id));
  console.log(`Contracts with ratings but NOT in landscape: ${missingFromLandscape.length}`);
  if (missingFromLandscape.length > 0) {
    console.log('Sample missing:', missingFromLandscape.slice(0, 10));
    
    // Check if these are in ma_plan_landscape at all
    const { data: checkLandscape } = await supabase
      .from('ma_plan_landscape')
      .select('contract_id')
      .in('contract_id', missingFromLandscape.slice(0, 5));
    
    console.log(`\nAre they in ma_plan_landscape table? ${checkLandscape && checkLandscape.length > 0 ? 'YES' : 'NO'}`);
    if (checkLandscape && checkLandscape.length > 0) {
      console.log('Found:', checkLandscape.map((r: any) => r.contract_id));
    }

    // Check if they have enrollment data
    const { data: checkEnrollment } = await supabase
      .from('ma_plan_enrollment')
      .select('contract_id, plan_id')
      .in('contract_id', missingFromLandscape.slice(0, 5))
      .eq('report_year', periodData.report_year)
      .eq('report_month', periodData.report_month);

    console.log(`\nDo they have enrollment data for ${periodData.report_year}-${periodData.report_month}? ${checkEnrollment && checkEnrollment.length > 0 ? 'YES' : 'NO'}`);
    if (checkEnrollment && checkEnrollment.length > 0) {
      console.log(`Found ${checkEnrollment.length} enrollment records`);
      console.log('Sample:', checkEnrollment.slice(0, 3));
    }
  }

  // Find contracts in landscape but WITHOUT ratings
  const missingRatings = [...landscapeSet].filter(id => !ratedSet.has(id));
  console.log(`\nContracts in landscape but WITHOUT ratings: ${missingRatings.length}`);
  if (missingRatings.length > 0) {
    console.log('Sample:', missingRatings.slice(0, 10));
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
