import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  const migrationPath = path.join(__dirname, '../migrations/004_create_exec_raw_sql_function.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');

  console.log('Applying migration: 004_create_exec_raw_sql_function.sql');
  
  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (const statement of statements) {
    if (statement) {
      console.log('Executing:', statement.substring(0, 100) + '...');
      const { error } = await supabase.rpc('exec_raw_sql', { query: statement });
      
      if (error) {
        console.error('Migration failed:', error);
        process.exit(1);
      }
    }
  }

  console.log('Migration applied successfully!');
}

applyMigration();
