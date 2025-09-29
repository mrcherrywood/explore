// Test script to diagnose Supabase connection issues
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

console.log('=== Supabase Connection Diagnostics ===\n');

// Check environment variables
console.log('1. Environment Variables:');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Missing');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Missing');
console.log('OPENROUTER_API_KEY:', process.env.OPENROUTER_API_KEY ? '✓ Set' : '✗ Missing');

// Test basic client creation
console.log('\n2. Client Creation:');
try {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  console.log('✓ Supabase client created successfully');
  
  // Test basic connection
  console.log('\n3. Connection Test:');
  supabase.from('messages').select('count', { count: 'exact', head: true })
    .then(({ error, count }) => {
      if (error) {
        console.log('✗ Connection failed:', error.message);
        if (error.message.includes('relation "messages" does not exist')) {
          console.log('  → The "messages" table does not exist in your database');
        }
      } else {
        console.log('✓ Connection successful');
        console.log(`  → Messages table exists with ${count || 0} rows`);
      }
    })
    .catch(err => {
      console.log('✗ Connection test failed:', err.message);
    });
    
} catch (error) {
  console.log('✗ Failed to create Supabase client:', error.message);
}
