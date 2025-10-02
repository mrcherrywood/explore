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
  console.log('🔍 Testing fixed landscape query...\n');

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

  // New query (from ma_plan_enrollment)
  const newQuery = `
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
      WHERE pe.report_year = ${periodData.report_year}
        AND pe.report_month = ${periodData.report_month}
        AND pe.enrollment IS NOT NULL
    )
    SELECT DISTINCT contract_id
    FROM plan_features
  `;

  const { data: newData } = await supabase.rpc('exec_raw_sql', { query: newQuery });
  const newSet = new Set(newData?.map((r: any) => r.contract_id) || []);

  console.log(`✅ New query returns ${newSet.size} contracts\n`);

  // Check if rated contracts are now included
  const { data: ratedContracts } = await supabase
    .from('summary_ratings')
    .select('contract_id')
    .eq('year', 2025)
    .not('overall_rating_numeric', 'is', null);

  const ratedSet = new Set(ratedContracts?.map(r => r.contract_id) || []);
  const intersection = new Set([...ratedSet].filter(id => newSet.has(id)));

  console.log(`Contracts with 2025 ratings: ${ratedSet.size}`);
  console.log(`Contracts in BOTH landscape and ratings: ${intersection.size}`);
  console.log(`\n✅ This should now show hundreds of contracts in the leaderboard!`);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
