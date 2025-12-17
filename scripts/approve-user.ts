/**
 * Script to approve a user by email
 * Usage: npx tsx scripts/approve-user.ts <email>
 * 
 * This script requires the SUPABASE_SERVICE_ROLE_KEY environment variable
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Make sure these environment variables are set in .env.local or .env');
  process.exit(1);
}

const email = process.argv[2];

if (!email) {
  console.error('Usage: npx tsx scripts/approve-user.ts <email>');
  console.error('Example: npx tsx scripts/approve-user.ts user@example.com');
  process.exit(1);
}

async function approveUser(email: string) {
  const supabase = createClient(supabaseUrl!, supabaseServiceKey!, {
    auth: { persistSession: false },
  });

  console.log(`Looking for user with email: ${email}`);

  // First, find the user approval record by email
  const { data: approval, error: findError } = await supabase
    .from('user_approvals')
    .select('*')
    .eq('email', email)
    .single();

  if (findError || !approval) {
    console.error(`Error: No pending approval found for email: ${email}`);
    console.error(findError?.message || 'User not found');
    process.exit(1);
  }

  if (approval.status === 'approved') {
    console.log(`User ${email} is already approved.`);
    process.exit(0);
  }

  // Update the approval status
  const { data: updated, error: updateError } = await supabase
    .from('user_approvals')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      notes: 'Approved via CLI script',
    })
    .eq('id', approval.id)
    .select()
    .single();

  if (updateError) {
    console.error('Error approving user:', updateError.message);
    process.exit(1);
  }

  console.log('✓ User approved successfully!');
  console.log(`  Email: ${updated.email}`);
  console.log(`  Status: ${updated.status}`);
  console.log(`  Approved at: ${updated.reviewed_at}`);
}

async function listPendingUsers() {
  const supabase = createClient(supabaseUrl!, supabaseServiceKey!, {
    auth: { persistSession: false },
  });

  const { data: approvals, error } = await supabase
    .from('user_approvals')
    .select('*')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching users:', error.message);
    process.exit(1);
  }

  if (!approvals || approvals.length === 0) {
    console.log('No user approval records found.');
    return;
  }

  console.log('\nAll user approvals:');
  console.log('─'.repeat(80));
  
  for (const a of approvals) {
    const status = a.status === 'approved' ? '✓' : a.status === 'rejected' ? '✗' : '○';
    const statusColor = a.status === 'approved' ? '\x1b[32m' : a.status === 'rejected' ? '\x1b[31m' : '\x1b[33m';
    console.log(`${statusColor}${status}\x1b[0m ${a.email} (${a.status}) - requested ${new Date(a.requested_at).toLocaleDateString()}`);
  }
  console.log('─'.repeat(80));
  
  const pending = approvals.filter(a => a.status === 'pending');
  console.log(`\nTotal: ${approvals.length} users, ${pending.length} pending approval`);
}

// If --list flag is provided, list all users
if (process.argv[2] === '--list') {
  listPendingUsers();
} else {
  approveUser(email);
}








