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
  console.log('🔍 Checking 2025 ratings data...\n');

  // Check all 2025 ratings
  const { data: all2025 } = await supabase
    .from('summary_ratings')
    .select('contract_id, overall_rating, overall_rating_numeric, part_c_summary, part_c_summary_numeric')
    .eq('year', 2025)
    .limit(20);

  console.log('Sample 2025 ratings (first 20):');
  all2025?.forEach((row: any) => {
    console.log(`  ${row.contract_id}:`);
    console.log(`    overall_rating: "${row.overall_rating}"`);
    console.log(`    overall_rating_numeric: ${row.overall_rating_numeric}`);
    console.log(`    part_c_summary: "${row.part_c_summary}"`);
    console.log(`    part_c_summary_numeric: ${row.part_c_summary_numeric}`);
  });

  // Count 2025 ratings with numeric values
  const { count: withNumeric } = await supabase
    .from('summary_ratings')
    .select('*', { count: 'exact', head: true })
    .eq('year', 2025)
    .not('overall_rating_numeric', 'is', null);

  const { count: total2025 } = await supabase
    .from('summary_ratings')
    .select('*', { count: 'exact', head: true })
    .eq('year', 2025);

  console.log(`\n2025 Summary:`);
  console.log(`  Total records: ${total2025}`);
  console.log(`  With overall_rating_numeric: ${withNumeric}`);
  console.log(`  Without numeric: ${(total2025 || 0) - (withNumeric || 0)}`);

  // Check what values are in overall_rating for those without numeric
  const { data: nonNumeric } = await supabase
    .from('summary_ratings')
    .select('overall_rating')
    .eq('year', 2025)
    .is('overall_rating_numeric', null)
    .limit(10);

  console.log(`\nSample non-numeric overall_rating values:`);
  const uniqueValues = new Set(nonNumeric?.map(r => r.overall_rating) || []);
  uniqueValues.forEach(val => console.log(`  - "${val}"`));
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
