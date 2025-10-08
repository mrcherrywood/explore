import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

import { isBlueContract } from './blue-contracts';

// Load environment variables from .env.local (aligns with other import scripts)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const CAI_FILE_REGEX = /^cai_(\d{4})\.json$/i;

type RawCaiRow = {
  CONTRACT_ID: string;
  'Organization Marketing Name'?: string;
  'Contract Name'?: string;
  'Parent Organization'?: string;
  'Puerto Rico Only'?: string;
  'Part C FAC'?: string | number | null;
  'Part D MA-PD FAC'?: string | number | null;
  'Part D PDP FAC'?: string | number | null;
  'Overall FAC'?: string | number | null;
  'CAI Value'?: string | number | null;
};

type CaiInsert = {
  contract_id: string;
  year: number;
  organization_marketing_name: string | null;
  contract_name: string | null;
  parent_organization: string | null;
  puerto_rico_only: boolean | null;
  part_c_fac: number | null;
  part_d_ma_pd_fac: number | null;
  part_d_pdp_fac: number | null;
  overall_fac: number | null;
  cai_value: number | null;
  source_file: string;
};

type ContractInsert = {
  contract_id: string;
  year: number;
  organization_marketing_name: string | null;
  contract_name: string | null;
  parent_organization: string | null;
  is_blue_cross_blue_shield: boolean;
};

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      !trimmed ||
      trimmed.toLowerCase() === 'n/a' ||
      trimmed.toLowerCase() === 'not available' ||
      trimmed.toLowerCase().includes('suppressed') ||
      trimmed.toLowerCase().includes('not enough data')
    ) {
      return null;
    }

    const numeric = Number.parseFloat(trimmed.replace('%', ''));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function parseBoolean(value: unknown): boolean | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (['yes', 'y', 'true', 't', '1'].includes(lower)) {
    return true;
  }
  if (['no', 'n', 'false', 'f', '0'].includes(lower)) {
    return false;
  }

  return null;
}

function readCaiFile(year: number): RawCaiRow[] {
  const filePath = path.join(process.cwd(), 'data', year.toString(), `cai_${year}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`CAI file not found at ${filePath}`);
  }

  const contents = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(contents) as RawCaiRow[];
}

function discoverCaiFiles(): Array<{ year: number; fileName: string; filePath: string }> {
  const dataRoot = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataRoot)) {
    return [];
  }

  const entries: Array<{ year: number; fileName: string; filePath: string }> = [];

  for (const yearDir of fs.readdirSync(dataRoot)) {
    if (!/^(19|20)\d{2}$/.test(yearDir)) {
      continue;
    }

    const yearPath = path.join(dataRoot, yearDir);
    if (!fs.statSync(yearPath).isDirectory()) {
      continue;
    }

    for (const fileName of fs.readdirSync(yearPath)) {
      const match = fileName.match(CAI_FILE_REGEX);
      if (!match) {
        continue;
      }

      entries.push({
        year: Number.parseInt(match[1], 10),
        fileName,
        filePath: path.join(yearPath, fileName),
      });
    }
  }

  return entries.sort((a, b) => a.year - b.year);
}

async function importCaiYear(year: number, fileName: string, rows: RawCaiRow[]) {
  console.log(`\n📈 Importing CAI data for ${year} (${fileName})`);
  console.log(`  Found ${rows.length} contract rows`);

  const inserts: CaiInsert[] = [];
  const contractsToUpsert = new Map<string, ContractInsert>();

  for (const row of rows) {
    const contractId = normalizeText(row.CONTRACT_ID);
    if (!contractId) {
      continue;
    }

    const insert: CaiInsert = {
      contract_id: contractId,
      year,
      organization_marketing_name: normalizeText(row['Organization Marketing Name']),
      contract_name: normalizeText(row['Contract Name']),
      parent_organization: normalizeText(row['Parent Organization']),
      puerto_rico_only: parseBoolean(row['Puerto Rico Only']),
      part_c_fac: parseNumeric(row['Part C FAC']),
      part_d_ma_pd_fac: parseNumeric(row['Part D MA-PD FAC']),
      part_d_pdp_fac: parseNumeric(row['Part D PDP FAC']),
      overall_fac: parseNumeric(row['Overall FAC']),
      cai_value: parseNumeric(row['CAI Value']),
      source_file: fileName,
    };

    inserts.push(insert);

    const contractKey = `${contractId}-${year}`;
    if (!contractsToUpsert.has(contractKey)) {
      contractsToUpsert.set(contractKey, {
        contract_id: contractId,
        year,
        organization_marketing_name: insert.organization_marketing_name,
        contract_name: insert.contract_name,
        parent_organization: insert.parent_organization,
        is_blue_cross_blue_shield: isBlueContract(contractId),
      });
    }
  }

  if (contractsToUpsert.size > 0) {
    const { error: contractError } = await supabase
      .from('ma_contracts')
      .upsert(Array.from(contractsToUpsert.values()), { onConflict: 'contract_id,year' });

    if (contractError) {
      console.error('  ❌ Error upserting contracts:', contractError);
      process.exit(1);
    }

    console.log(`  ✅ Upserted ${contractsToUpsert.size} contract records`);
  }

  if (inserts.length === 0) {
    console.warn('  ⚠️ No CAI rows prepared for upsert');
    return;
  }

  const batchSize = 500;
  for (let i = 0; i < inserts.length; i += batchSize) {
    const batch = inserts.slice(i, i + batchSize);
    const { error } = await supabase
      .from('ma_cai')
      .upsert(batch, { onConflict: 'contract_id,year' });

    if (error) {
      console.error(`  ❌ Error upserting CAI batch ${Math.floor(i / batchSize) + 1}:`, error);
      process.exit(1);
    }

    console.log(`  ✅ Upserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} rows)`);
  }

  console.log(`✅ Completed CAI import for ${year}`);
}

async function main() {
  console.log('🚀 Starting MA CAI import...');

  const files = discoverCaiFiles();
  if (files.length === 0) {
    console.warn('⚠️ No CAI files discovered (expected cai_<YEAR>.json).');
    return;
  }

  for (const file of files) {
    const rows = readCaiFile(file.year);
    await importCaiYear(file.year, file.fileName, rows);
  }

  console.log('\n🎉 CAI import completed successfully!');
}

main().catch((error) => {
  console.error('Unexpected error during CAI import:', error);
  process.exit(1);
});
