const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key);

async function test() {
  console.log('Testing table access...\n');
  
  // Test ma_plan_enrollment
  console.log('1. Testing ma_plan_enrollment...');
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('ma_plan_enrollment')
    .select('report_year, report_month')
    .order('report_year', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (enrollmentError) {
    console.error('❌ Error:', enrollmentError.message);
  } else {
    console.log('✅ Success:', enrollment);
  }
  
  // Test ma_contracts
  console.log('\n2. Testing ma_contracts...');
  const { data: contracts, error: contractsError } = await supabase
    .from('ma_contracts')
    .select('contract_id')
    .limit(1);
  
  if (contractsError) {
    console.error('❌ Error:', contractsError.message);
  } else {
    console.log('✅ Success: Found', contracts?.length, 'contracts');
  }
  
  // Test ma_measures
  console.log('\n3. Testing ma_measures...');
  const { data: measures, error: measuresError } = await supabase
    .from('ma_measures')
    .select('code, name')
    .limit(1);
  
  if (measuresError) {
    console.error('❌ Error:', measuresError.message);
  } else {
    console.log('✅ Success: Found', measures?.length, 'measures');
  }
  
  // Test summary_ratings
  console.log('\n4. Testing summary_ratings...');
  const { data: ratings, error: ratingsError } = await supabase
    .from('summary_ratings')
    .select('contract_id, year')
    .limit(1);
  
  if (ratingsError) {
    console.error('❌ Error:', ratingsError.message);
  } else {
    console.log('✅ Success: Found', ratings?.length, 'ratings');
  }
  
  // Test ma_plan_landscape
  console.log('\n5. Testing ma_plan_landscape...');
  const { data: landscape, error: landscapeError } = await supabase
    .from('ma_plan_landscape')
    .select('contract_id')
    .limit(1);
  
  if (landscapeError) {
    console.error('❌ Error:', landscapeError.message);
  } else {
    console.log('✅ Success: Found', landscape?.length, 'landscape records');
  }
}

test().catch(console.error);
