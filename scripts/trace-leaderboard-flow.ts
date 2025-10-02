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
  console.log('🔍 Tracing leaderboard data flow...\n');

  // Step 1: Get latest period
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

  console.log(`Step 1: Latest period = ${periodData.report_year}-${periodData.report_month}\n`);

  // Step 2: Run landscape query (simplified to get count)
  const landscapeQuery = `
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
  `;

  const { data: landscapeData } = await supabase.rpc('exec_raw_sql', { query: landscapeQuery });
  
  console.log(`Step 2: Landscape query returned ${Array.isArray(landscapeData) ? landscapeData.length : 0} contracts\n`);

  if (!Array.isArray(landscapeData) || landscapeData.length === 0) {
    console.log('⚠️  No landscape data');
    return;
  }

  // Step 3: Build contract records (simulate the buildContractRecords function)
  const contractRecords = new Map();
  for (const row of landscapeData) {
    const contractId = row.contract_id?.trim().toUpperCase();
    if (!contractId) continue;
    contractRecords.set(contractId, row);
  }

  console.log(`Step 3: Built ${contractRecords.size} contract records\n`);

  // Step 4: Get all contract IDs for summary query
  const contractIds = Array.from(contractRecords.keys());
  console.log(`Step 4: Querying summary_ratings for ${contractIds.length} contracts...\n`);

  // Step 5: Fetch summary snapshots
  const { data: summaryData } = await supabase
    .from('summary_ratings')
    .select('contract_id, year, overall_rating_numeric, overall_rating')
    .in('contract_id', contractIds);

  console.log(`Step 5: Found ${summaryData?.length || 0} summary rating rows\n`);

  // Step 6: Process into snapshots (simulate fetchSummarySnapshots)
  const years = Array.from(new Set(summaryData?.map(r => r.year) || [])).sort((a, b) => b - a);
  const dataYear = years[0] ?? null;
  const priorYear = years.find(y => y < (dataYear ?? y)) ?? null;

  console.log(`Step 6: Data year = ${dataYear}, Prior year = ${priorYear}\n`);

  const overall = new Map();
  for (const row of summaryData || []) {
    const contractId = row.contract_id?.trim().toUpperCase();
    if (!contractId) continue;

    const numeric = row.overall_rating_numeric ?? (typeof row.overall_rating === 'number' ? row.overall_rating : null);
    
    if (!overall.has(contractId)) {
      overall.set(contractId, { current: null, prior: null });
    }

    if (row.year === dataYear && numeric !== null) {
      overall.get(contractId).current = numeric;
    }
    if (row.year === priorYear && numeric !== null) {
      overall.get(contractId).prior = numeric;
    }
  }

  console.log(`Step 7: Created snapshots for ${overall.size} contracts\n`);

  // Step 8: Build section (simulate buildSection)
  let matchedCount = 0;
  let unmatchedCount = 0;
  const drafts = [];

  for (const [id, snapshot] of overall.entries()) {
    const record = contractRecords.get(id);
    if (!record) {
      unmatchedCount++;
      continue;
    }

    const { current, prior } = snapshot;
    if (current === null && prior === null) {
      continue;
    }

    matchedCount++;
    drafts.push({
      entityId: id,
      value: current,
      priorValue: prior,
    });
  }

  console.log(`Step 8: Matched ${matchedCount} contracts, Unmatched ${unmatchedCount}\n`);
  console.log(`Step 9: Created ${drafts.length} draft entries\n`);

  // Filter for top performers
  const withValues = drafts.filter(d => d.value !== null);
  console.log(`Step 10: ${withValues.length} entries have current values\n`);

  if (unmatchedCount > 0) {
    console.log('\n⚠️  ISSUE FOUND: Some contracts in summary_ratings are not in landscape!');
    console.log('Sample unmatched contract IDs:');
    let count = 0;
    for (const [id] of overall.entries()) {
      if (!contractRecords.has(id) && count < 10) {
        console.log(`  - ${id}`);
        count++;
      }
    }
  }

  if (matchedCount < 10) {
    console.log('\n⚠️  ISSUE: Very few contracts matched!');
    console.log('Sample landscape contract IDs:', Array.from(contractRecords.keys()).slice(0, 10));
    console.log('Sample summary contract IDs:', Array.from(overall.keys()).slice(0, 10));
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
