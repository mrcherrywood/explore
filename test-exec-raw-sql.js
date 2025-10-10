const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', url ? 'present' : 'missing');
console.log('Key:', key ? 'present' : 'missing');

if (!url || !key) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(url, key);

async function test() {
  console.log('\nTesting exec_raw_sql function...');
  const result = await supabase.rpc('exec_raw_sql', { query: 'SELECT 1 as test' });
  
  if (result.error) {
    console.error('❌ Function does not exist or error:', result.error.message);
    process.exit(1);
  } else {
    console.log('✅ Function exists and works!');
    console.log('Result:', JSON.stringify(result.data, null, 2));
    process.exit(0);
  }
}

test();
