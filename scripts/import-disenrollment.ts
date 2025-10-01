import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Ensure Supabase credentials are available (aligns with other import scripts)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DISENROLLMENT_FILE_REGEX = /^disenrollment_reasons_(\d{4})\.json$/i;

type RawDisenrollmentRow = {
  CONTRACT_ID: string;
  'Organization Marketing Name'?: string;
  'Contract Name'?: string;
  'Parent Organization'?: string;
  'Problems Getting the Plan to Provide and Pay for Needed Care'?: string | number | null;
  'Problems with Coverage of Doctors and Hospitals'?: string | number | null;
  'Financial Reasons for Disenrollment'?: string | number | null;
  'Problems with Prescription Drug Benefits and Coverage'?: string | number | null;
  'Problems Getting Information and Help from the Plan'?: string | number | null;
};

type PercentValueKey =
  | 'problems_care_percent'
  | 'problems_doctors_percent'
  | 'financial_reasons_percent'
  | 'problems_rx_percent'
  | 'problems_help_percent';

type PercentNoteKey =
  | 'problems_care_note'
  | 'problems_doctors_note'
  | 'financial_reasons_note'
  | 'problems_rx_note'
  | 'problems_help_note';

type PercentFieldConfig = {
  rawKey: keyof RawDisenrollmentRow;
  percentKey: PercentValueKey;
  noteKey: PercentNoteKey;
};

type DisenrollmentInsert = {
  contract_id: string;
  year: number;
  organization_marketing_name: string | null;
  contract_name: string | null;
  parent_organization: string | null;
  problems_care_percent: number | null;
  problems_care_note: string | null;
  problems_doctors_percent: number | null;
  problems_doctors_note: string | null;
  financial_reasons_percent: number | null;
  financial_reasons_note: string | null;
  problems_rx_percent: number | null;
  problems_rx_note: string | null;
  problems_help_percent: number | null;
  problems_help_note: string | null;
  source_file: string;
};

type ContractInsert = {
  contract_id: string;
  year: number;
  organization_marketing_name: string | null;
  contract_name: string | null;
  parent_organization: string | null;
};

const PERCENT_FIELDS: PercentFieldConfig[] = [
  {
    rawKey: 'Problems Getting the Plan to Provide and Pay for Needed Care',
    percentKey: 'problems_care_percent',
    noteKey: 'problems_care_note',
  },
  {
    rawKey: 'Problems with Coverage of Doctors and Hospitals',
    percentKey: 'problems_doctors_percent',
    noteKey: 'problems_doctors_note',
  },
  {
    rawKey: 'Financial Reasons for Disenrollment',
    percentKey: 'financial_reasons_percent',
    noteKey: 'financial_reasons_note',
  },
  {
    rawKey: 'Problems with Prescription Drug Benefits and Coverage',
    percentKey: 'problems_rx_percent',
    noteKey: 'problems_rx_note',
  },
  {
    rawKey: 'Problems Getting Information and Help from the Plan',
    percentKey: 'problems_help_percent',
    noteKey: 'problems_help_note',
  },
];

function readDisenrollmentFile(year: number): RawDisenrollmentRow[] {
  const filePath = path.join(process.cwd(), 'data', year.toString(), `disenrollment_reasons_${year}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Disenrollment file not found at ${filePath}`);
  }

  const contents = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(contents) as RawDisenrollmentRow[];
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePercent(value: string | number | null | undefined): { percent: number | null; note: string | null } {
  if (value === null || value === undefined) {
    return { percent: null, note: null };
  }

  if (typeof value === 'number') {
    const percent = Number.isFinite(value) ? value : null;
    return { percent, note: percent === null ? String(value) : null };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { percent: null, note: null };
  }

  const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (percentMatch) {
    const numeric = Number.parseFloat(percentMatch[1]);
    return Number.isFinite(numeric)
      ? { percent: numeric, note: null }
      : { percent: null, note: trimmed };
  }

  const numeric = Number.parseFloat(trimmed.replace('%', ''));
  if (Number.isFinite(numeric)) {
    return { percent: numeric, note: null };
  }

  return { percent: null, note: trimmed };
}

async function importYear(year: number, fileName: string, rows: RawDisenrollmentRow[]) {
  console.log(`\n📉 Importing disenrollment reasons for ${year} (${fileName})`);
  console.log(`  Found ${rows.length} contract rows`);

  const inserts: DisenrollmentInsert[] = [];
  const contractsToUpsert = new Map<string, ContractInsert>();

  for (const row of rows) {
    const contractId = normalizeText(row.CONTRACT_ID);
    if (!contractId) {
      continue;
    }

    const insert: DisenrollmentInsert = {
      contract_id: contractId,
      year,
      organization_marketing_name: normalizeText(row['Organization Marketing Name']) ?? null,
      contract_name: normalizeText(row['Contract Name']) ?? null,
      parent_organization: normalizeText(row['Parent Organization']) ?? null,
      problems_care_percent: null,
      problems_care_note: null,
      problems_doctors_percent: null,
      problems_doctors_note: null,
      financial_reasons_percent: null,
      financial_reasons_note: null,
      problems_rx_percent: null,
      problems_rx_note: null,
      problems_help_percent: null,
      problems_help_note: null,
      source_file: fileName,
    };

    for (const field of PERCENT_FIELDS) {
      const rawValue = row[field.rawKey];
      const normalized =
        typeof rawValue === 'number'
          ? rawValue
          : normalizeText(rawValue);

      const { percent, note } = parsePercent(normalized);

      insert[field.percentKey] = percent;
      insert[field.noteKey] = note;
    }

    inserts.push(insert);

    const contractKey = `${contractId}-${year}`;
    if (!contractsToUpsert.has(contractKey)) {
      contractsToUpsert.set(contractKey, {
        contract_id: contractId,
        year,
        organization_marketing_name: insert.organization_marketing_name,
        contract_name: insert.contract_name,
        parent_organization: insert.parent_organization,
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
    console.warn('  ⚠️ No rows prepared for upsert');
    return;
  }

  const batchSize = 500;
  for (let i = 0; i < inserts.length; i += batchSize) {
    const batch = inserts.slice(i, i + batchSize);
    const { error } = await supabase
      .from('ma_disenrollment')
      .upsert(batch, { onConflict: 'contract_id,year' });

    if (error) {
      console.error(`  ❌ Error upserting disenrollment batch ${Math.floor(i / batchSize) + 1}:`, error);
      process.exit(1);
    }

    console.log(`  ✅ Upserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} rows)`);
  }

  console.log(`✅ Completed disenrollment import for ${year}`);
}

function discoverDisenrollmentFiles(): Array<{ year: number; fileName: string; filePath: string }> {
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
      const match = fileName.match(DISENROLLMENT_FILE_REGEX);
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

async function main() {
  console.log('🚀 Starting MA disenrollment import...');

  const files = discoverDisenrollmentFiles();
  if (files.length === 0) {
    console.warn('⚠️ No disenrollment files discovered (expected disenrollment_reasons_<YEAR>.json).');
    return;
  }

  for (const file of files) {
    const rows = readDisenrollmentFile(file.year);
    await importYear(file.year, file.fileName, rows);
  }

  console.log('\n🎉 Disenrollment import completed successfully!');
}

main().catch((error) => {
  console.error('Unexpected error during disenrollment import:', error);
  process.exit(1);
});
