// Script to create the exec_raw_sql PostgreSQL function via Supabase
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

async function createFunction() {
  const migrationPath = path.join(__dirname, '../migrations/004_create_exec_raw_sql_function.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  console.log('Creating exec_raw_sql function via Supabase SQL Editor API...');
  console.log('SQL to execute:\n', sql);

  // Use Supabase's SQL execution endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to create function:', error);
    console.log('\n\nPlease run this SQL manually in Supabase SQL Editor:');
    console.log('Dashboard -> SQL Editor -> New Query -> Paste the SQL above');
    process.exit(1);
  }

  console.log('Function created successfully!');
}

createFunction();
