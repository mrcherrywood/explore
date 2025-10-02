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
  console.log('🔍 Checking rating value parsing...\n');

  // Get a sample of 2025 ratings
  const { data: ratings2025 } = await supabase
    .from('summary_ratings')
    .select('contract_id, overall_rating, overall_rating_numeric')
    .eq('year', 2025)
    .limit(20);

  console.log('Sample 2025 ratings:');
  ratings2025?.forEach((row: any) => {
    const value = row.overall_rating_numeric ?? (typeof row.overall_rating === 'number' ? row.overall_rating : null);
    console.log(`  ${row.contract_id}:`);
    console.log(`    overall_rating: "${row.overall_rating}" (type: ${typeof row.overall_rating})`);
    console.log(`    overall_rating_numeric: ${row.overall_rating_numeric} (type: ${typeof row.overall_rating_numeric})`);
    console.log(`    computed value: ${value}`);
  });

  // Check how many have numeric values
  const { count: withNumeric } = await supabase
    .from('summary_ratings')
    .select('*', { count: 'exact', head: true })
    .eq('year', 2025)
    .not('overall_rating_numeric', 'is', null);

  console.log(`\n✅ ${withNumeric} contracts have overall_rating_numeric for 2025`);

  // Try parsing overall_rating as a number
  const { data: textRatings } = await supabase
    .from('summary_ratings')
    .select('contract_id, overall_rating, overall_rating_numeric')
    .eq('year', 2025)
    .is('overall_rating_numeric', null)
    .limit(10);

  console.log('\nContracts with NULL overall_rating_numeric:');
  textRatings?.forEach((row: any) => {
    const parsed = Number(row.overall_rating);
    console.log(`  ${row.contract_id}: "${row.overall_rating}" -> ${parsed} (isFinite: ${Number.isFinite(parsed)})`);
  });
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
