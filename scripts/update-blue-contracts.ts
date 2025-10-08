import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { getBlueContractIds } from './blue-contracts';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateBlueContracts() {
  console.log('Loading Blue Cross contract IDs...');
  const blueContractIds = getBlueContractIds();
  console.log(`Found ${blueContractIds.length} Blue Cross contracts`);

  if (blueContractIds.length === 0) {
    console.log('No Blue Cross contracts found in Blues_List.json');
    return;
  }

  console.log('\nUpdating ma_contracts table...');
  
  // First, set all contracts to false
  const { error: resetError } = await supabase
    .from('ma_contracts')
    .update({ is_blue_cross_blue_shield: false })
    .neq('contract_id', '');

  if (resetError) {
    console.error('Error resetting Blue Cross flags:', resetError);
    return;
  }

  console.log('Reset all contracts to non-Blue');

  // Then update the Blue Cross contracts in batches
  const batchSize = 100;
  let updated = 0;

  for (let i = 0; i < blueContractIds.length; i += batchSize) {
    const batch = blueContractIds.slice(i, i + batchSize);
    
    const { error: updateError, count } = await supabase
      .from('ma_contracts')
      .update({ is_blue_cross_blue_shield: true })
      .in('contract_id', batch);

    if (updateError) {
      console.error(`Error updating batch ${i / batchSize + 1}:`, updateError);
      continue;
    }

    updated += count ?? 0;
    console.log(`Updated batch ${i / batchSize + 1}: ${batch.length} contracts`);
  }

  console.log(`\n✅ Successfully updated ${updated} Blue Cross contracts`);

  // Verify the update
  const { data: blueCount } = await supabase
    .from('ma_contracts')
    .select('contract_id', { count: 'exact', head: true })
    .eq('is_blue_cross_blue_shield', true);

  console.log(`\nVerification: ${blueCount} contracts marked as Blue Cross in database`);
}

updateBlueContracts()
  .then(() => {
    console.log('\n✅ Update complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
