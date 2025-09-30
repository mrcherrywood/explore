/**
 * Apply migration 005: Update exec_raw_sql to allow WITH (CTE) queries
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🚀 Applying migration 005: Update exec_raw_sql to allow CTE queries\n');

  try {
    const migrationPath = join(process.cwd(), 'migrations', '005_update_exec_raw_sql_allow_cte.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing SQL directly...');
    console.log('⚠️  Cannot use exec_raw_sql to update itself (chicken-egg problem)');
    console.log('\n📋 Please run this SQL in your Supabase SQL Editor:\n');
    console.log('─'.repeat(80));
    console.log(migrationSQL);
    console.log('─'.repeat(80));
    console.log('\n✅ After running the SQL above, the peer comparison endpoints will work!');
  } catch (err) {
    console.error('❌ Error reading migration file:', err);
    process.exit(1);
  }
}

applyMigration().catch(console.error);
