/**
 * Run the database migration to add star_rating and rate_percent columns
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('🚀 Running database migration...\n');
  
  console.log('Adding star_rating column...');
  const { error: error1 } = await supabase.rpc('exec_sql', { 
    sql_query: 'ALTER TABLE ma_metrics ADD COLUMN IF NOT EXISTS star_rating TEXT' 
  });
  
  if (error1) {
    console.error('❌ Error adding star_rating column:', error1);
    // Continue anyway in case column already exists
  } else {
    console.log('✅ Added star_rating column');
  }
  
  console.log('Adding rate_percent column...');
  const { error: error2 } = await supabase.rpc('exec_sql', { 
    sql_query: 'ALTER TABLE ma_metrics ADD COLUMN IF NOT EXISTS rate_percent NUMERIC' 
  });
  
  if (error2) {
    console.error('❌ Error adding rate_percent column:', error2);
    // Continue anyway in case column already exists
  } else {
    console.log('✅ Added rate_percent column');
  }
  
  console.log('\n✅ Migration completed!');
  console.log('Note: Data migration will happen during import');
}

runMigration().catch(console.error);
