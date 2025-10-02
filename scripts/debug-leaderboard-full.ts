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
  console.log('🔍 Full leaderboard debugging...\n');

  // Check summary_ratings years
  const { data: yearsData } = await supabase
    .from('summary_ratings')
    .select('year')
    .order('year', { ascending: false });

  const years = Array.from(new Set(yearsData?.map(d => d.year) || []));
  console.log('Years in summary_ratings:', years);

  // Count ratings by year
  for (const year of years) {
    const { count } = await supabase
      .from('summary_ratings')
      .select('*', { count: 'exact', head: true })
      .eq('year', year);
    
    const { count: withRating } = await supabase
      .from('summary_ratings')
      .select('*', { count: 'exact', head: true })
      .eq('year', year)
      .not('overall_rating_numeric', 'is', null);

    console.log(`  ${year}: ${count} total, ${withRating} with ratings`);
  }

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

  console.log(`\nLatest enrollment period: ${periodData.report_year}-${periodData.report_month}\n`);

  // Get a sample of contracts from landscape
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
      ct.contract_id
    FROM contract_totals ct
    LIMIT 20
  `;

  const { data: contractIds } = await supabase.rpc('exec_raw_sql', { query });
  
  if (!Array.isArray(contractIds) || contractIds.length === 0) {
    console.log('⚠️  No contracts found in landscape');
    return;
  }

  const ids = contractIds.map((row: any) => row.contract_id);
  console.log(`Sample contract IDs from landscape (${ids.length}):`, ids.slice(0, 10));

  // Check which have ratings
  const { data: ratingsData } = await supabase
    .from('summary_ratings')
    .select('contract_id, year, overall_rating_numeric, overall_rating')
    .in('contract_id', ids);

  console.log(`\nRatings found for these contracts: ${ratingsData?.length || 0}`);
  
  const contractsWithRatings = new Set(ratingsData?.map(r => r.contract_id) || []);
  console.log(`Unique contracts with ratings: ${contractsWithRatings.size}`);
  
  if (ratingsData && ratingsData.length > 0) {
    console.log('\nSample ratings:');
    ratingsData.slice(0, 10).forEach((row: any) => {
      console.log(`  ${row.contract_id} (${row.year}): ${row.overall_rating_numeric || row.overall_rating || 'null'}`);
    });
  }

  // Check contracts without ratings
  const contractsWithoutRatings = ids.filter(id => !contractsWithRatings.has(id));
  console.log(`\nContracts without ratings: ${contractsWithoutRatings.length}`);
  if (contractsWithoutRatings.length > 0) {
    console.log('Sample:', contractsWithoutRatings.slice(0, 5));
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
