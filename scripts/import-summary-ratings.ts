import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type SummaryRow = {
  CONTRACT_ID: string;
  'Organization Type'?: string;
  'Contract Name'?: string;
  'Organization Marketing Name'?: string;
  'Parent Organization'?: string;
  SNP?: string;
  [key: string]: unknown;
};

type SummaryInsert = {
  contract_id: string;
  year: number;
  organization_type: string | null;
  contract_name: string | null;
  organization_marketing_name: string | null;
  parent_organization: string | null;
  snp_indicator: string | null;
  disaster_percent_2021: number | null;
  disaster_percent_2022: number | null;
  disaster_percent_2023: number | null;
  part_c_summary: string | null;
  part_c_summary_numeric: number | null;
  part_d_summary: string | null;
  part_d_summary_numeric: number | null;
  overall_rating: string | null;
  overall_rating_numeric: number | null;
};

type ContractInsert = {
  contract_id: string;
  year: number;
  organization_type: string | null;
  contract_name: string | null;
  organization_marketing_name: string | null;
  parent_organization: string | null;
  snp_indicator: string | null;
};

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'not applicable' || trimmed.toLowerCase().includes('not enough data')) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function readSummaryFile(year: number): SummaryRow[] {
  const filePath = path.join(process.cwd(), 'data', year.toString(), `summary_rating_${year}.json`);
  const contents = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(contents) as SummaryRow[];
}

async function importSummaryYear(year: number) {
  console.log(`\n📊 Importing summary ratings for ${year}...`);
  const rows = readSummaryFile(year);
  console.log(`  Found ${rows.length} contract rows`);

  const contractMap = new Map<string, ContractInsert>();

  const inserts: SummaryInsert[] = rows
    .map((row) => {
      const contractId = row.CONTRACT_ID?.trim();
      if (!contractId) {
        return null;
      }

      const partCKey = `${year} Part C Summary`;
      const partDKey = `${year} Part D Summary`;
      const overallKey = `${year} Overall`;

      const disasterValueFor = (disasterYear: number) => {
        const key = `${disasterYear} Disaster %`;
        if (Object.hasOwn(row, key)) {
          return parseNumeric(row[key]);
        }
        return null;
      };

      const partCSummary = normalizeText(row[partCKey]);
      const partDSummary = normalizeText(row[partDKey]);
      const overallSummary = normalizeText(row[overallKey]);

      const insert: SummaryInsert = {
        contract_id: contractId,
        year,
        organization_type: normalizeText(row['Organization Type'] ?? null),
        contract_name: normalizeText(row['Contract Name'] ?? null),
        organization_marketing_name: normalizeText(row['Organization Marketing Name'] ?? null),
        parent_organization: normalizeText(row['Parent Organization'] ?? null),
        snp_indicator: normalizeText(row.SNP ?? null),
        disaster_percent_2021: disasterValueFor(2021),
        disaster_percent_2022: disasterValueFor(2022),
        disaster_percent_2023: disasterValueFor(2023),
        part_c_summary: partCSummary,
        part_c_summary_numeric: parseNumeric(partCSummary),
        part_d_summary: partDSummary,
        part_d_summary_numeric: parseNumeric(partDSummary),
        overall_rating: overallSummary,
        overall_rating_numeric: parseNumeric(overallSummary),
      };

      const contractKey = `${contractId}-${year}`;
      if (!contractMap.has(contractKey)) {
        contractMap.set(contractKey, {
          contract_id: contractId,
          year,
          organization_type: insert.organization_type,
          contract_name: insert.contract_name,
          organization_marketing_name: insert.organization_marketing_name,
          parent_organization: insert.parent_organization,
          snp_indicator: insert.snp_indicator,
        });
      }

      return insert;
    })
    .filter((insert): insert is SummaryInsert => insert !== null);

  console.log(`  Preparing to upsert ${inserts.length} rows`);

  const contractsToUpsert = Array.from(contractMap.values());
  if (contractsToUpsert.length > 0) {
    const { error: contractError } = await supabase
      .from('ma_contracts')
      .upsert(contractsToUpsert, { onConflict: 'contract_id,year' });

    if (contractError) {
      console.error('  ❌ Error upserting contracts:', contractError);
      process.exit(1);
    }

    console.log(`  ✅ Upserted ${contractsToUpsert.length} contracts for ${year}`);
  }

  const batchSize = 500;
  for (let i = 0; i < inserts.length; i += batchSize) {
    const batch = inserts.slice(i, i + batchSize);
    const { error } = await supabase
      .from('summary_ratings')
      .upsert(batch, { onConflict: 'contract_id,year' });

    if (error) {
      console.error(`  ❌ Error upserting batch ${i / batchSize + 1}:`, error);
      process.exit(1);
    }

    console.log(`  ✅ Upserted batch ${i / batchSize + 1} (${batch.length} rows)`);
  }

  console.log(`✅ Completed summary rating import for ${year}`);
}

async function main() {
  console.log('🚀 Starting summary ratings import...');

  const yearsToImport = [2023, 2024, 2025];
  for (const year of yearsToImport) {
    await importSummaryYear(year);
  }

  console.log('\n🎉 Summary ratings import completed successfully!');
}

main().catch((error) => {
  console.error('Unexpected error during import:', error);
  process.exit(1);
});
