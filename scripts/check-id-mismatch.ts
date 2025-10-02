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
  console.log('🔍 Checking for contract ID mismatches...\n');

  // Get sample from landscape (via enrollment)
  const { data: enrollmentSample } = await supabase
    .from('ma_plan_enrollment')
    .select('contract_id')
    .eq('report_year', 2025)
    .eq('report_month', 8)
    .limit(10);

  console.log('Sample contract IDs from ma_plan_enrollment:');
  enrollmentSample?.slice(0, 5).forEach((row: any) => {
    console.log(`  "${row.contract_id}" (length: ${row.contract_id.length}, type: ${typeof row.contract_id})`);
  });

  // Get sample from summary_ratings
  const { data: ratingsSample } = await supabase
    .from('summary_ratings')
    .select('contract_id')
    .eq('year', 2025)
    .not('overall_rating_numeric', 'is', null)
    .limit(10);

  console.log('\nSample contract IDs from summary_ratings (with ratings):');
  ratingsSample?.slice(0, 5).forEach((row: any) => {
    console.log(`  "${row.contract_id}" (length: ${row.contract_id.length}, type: ${typeof row.contract_id})`);
  });

  // Check if H2610 (which has a rating) is in enrollment
  const { data: h2610Enrollment } = await supabase
    .from('ma_plan_enrollment')
    .select('contract_id')
    .eq('contract_id', 'H2610')
    .eq('report_year', 2025)
    .eq('report_month', 8)
    .limit(1);

  console.log(`\nIs H2610 in ma_plan_enrollment (2025-8)? ${h2610Enrollment && h2610Enrollment.length > 0 ? 'YES' : 'NO'}`);

  // Check ma_contracts
  const { data: contractsSample } = await supabase
    .from('ma_contracts')
    .select('contract_id')
    .limit(10);

  console.log('\nSample contract IDs from ma_contracts:');
  contractsSample?.slice(0, 5).forEach((row: any) => {
    console.log(`  "${row.contract_id}" (length: ${row.contract_id.length})`);
  });

  // Check ma_plan_landscape
  const { data: landscapeSample } = await supabase
    .from('ma_plan_landscape')
    .select('contract_id')
    .limit(10);

  console.log('\nSample contract IDs from ma_plan_landscape:');
  landscapeSample?.slice(0, 5).forEach((row: any) => {
    console.log(`  "${row.contract_id}" (length: ${row.contract_id.length})`);
  });

  // Check if H2610 is in ma_plan_landscape
  const { data: h2610Landscape } = await supabase
    .from('ma_plan_landscape')
    .select('contract_id')
    .eq('contract_id', 'H2610')
    .limit(1);

  console.log(`\nIs H2610 in ma_plan_landscape? ${h2610Landscape && h2610Landscape.length > 0 ? 'YES' : 'NO'}`);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
