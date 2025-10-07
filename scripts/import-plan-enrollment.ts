import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local (falls back to default .env behaviour)
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

type RawEnrollmentRow = {
  CONTRACT_ID: string;
  'Plan ID': string | number | null;
  'Plan Type'?: string | null;
  Enrollment?: string | number | null;
} & Record<string, string | number | null | undefined>;

type EnrollmentInsert = {
  contract_id: string;
  plan_id: string;
  plan_type: string | null;
  enrollment: number | null;
  is_suppressed: boolean;
  report_year: number;
  report_month: number;
  source_file: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const MONTHLY_FILE_REGEX = /^Monthly_Report_By_Plan_(\d{4})_(\d{1,2})(?:_condensed)?\.json$/;

function getColumnValue(row: RawEnrollmentRow, targetKey: string): string | number | null | undefined {
  if (row[targetKey] !== undefined) {
    return row[targetKey];
  }

  const matchedKey = Object.keys(row).find((candidate) => candidate.trim().toLowerCase() === targetKey.trim().toLowerCase());
  if (!matchedKey) {
    return undefined;
  }

  return row[matchedKey];
}

function discoverMonthlyFiles(): Array<{ year: number; month: number; filePath: string; fileName: string }> {
  const dataRoot = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataRoot)) {
    return [];
  }

  const years = fs.readdirSync(dataRoot).filter((entry) => /^(19|20)\d{2}$/.test(entry));
  const discovered: Array<{ year: number; month: number; filePath: string; fileName: string }> = [];

  for (const yearDir of years) {
    const yearPath = path.join(dataRoot, yearDir);
    if (!fs.statSync(yearPath).isDirectory()) {
      continue;
    }

    const files = fs.readdirSync(yearPath);
    for (const fileName of files) {
      const match = fileName.match(MONTHLY_FILE_REGEX);
      if (!match) {
        continue;
      }

      const [, yearStr, monthStr] = match;
      const year = Number.parseInt(yearStr, 10);
      const month = Number.parseInt(monthStr, 10);
      if (!Number.isFinite(year) || !Number.isFinite(month)) {
        continue;
      }

      discovered.push({
        year,
        month,
        filePath: path.join(yearPath, fileName),
        fileName,
      });
    }
  }

  return discovered.sort((a, b) => {
    if (a.year === b.year) {
      return a.month - b.month;
    }
    return a.year - b.year;
  });
}

function parseEnrollment(value: string | number | undefined | null): { enrollment: number | null; isSuppressed: boolean } {
  if (!value) {
    return { enrollment: null, isSuppressed: false };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return { enrollment: null, isSuppressed: true };
    }
    return { enrollment: Math.round(value), isSuppressed: false };
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === '0') {
    return { enrollment: 0, isSuppressed: false };
  }

  if (trimmed === '*' || trimmed.toLowerCase() === 'suppressed') {
    return { enrollment: null, isSuppressed: true };
  }

  const numeric = Number.parseInt(trimmed.replace(/,/g, ''), 10);
  if (Number.isFinite(numeric)) {
    return { enrollment: numeric, isSuppressed: false };
  }

  return { enrollment: null, isSuppressed: true };
}

async function importMonthlyFile(file: { year: number; month: number; filePath: string; fileName: string }) {
  const { year, month, filePath, fileName } = file;
  console.log(`\n📥 Importing enrollment from ${fileName} (${year}-${String(month).padStart(2, '0')})`);

  const contents = fs.readFileSync(filePath, 'utf-8');
  const sanitizedContents = contents.replace(/:\s*NaN\b/g, ': null');
  const rows = JSON.parse(sanitizedContents) as RawEnrollmentRow[];
  console.log(`  Found ${rows.length} plan rows`);

  const inserts: EnrollmentInsert[] = rows
    .map((row) => {
      const contractId = row.CONTRACT_ID?.trim();
      const planIdRaw = row['Plan ID'];
      let planId: string | null = null;

      if (typeof planIdRaw === 'string') {
        planId = planIdRaw.trim();
      } else if (typeof planIdRaw === 'number' && Number.isFinite(planIdRaw)) {
        planId = planIdRaw.toString();
      }

      if (!contractId || !planId) {
        return null;
      }

      const enrollmentRaw = getColumnValue(row, 'Enrollment');
      const { enrollment, isSuppressed } = parseEnrollment(enrollmentRaw);

      const planTypeRaw = getColumnValue(row, 'Plan Type');
      let planType: string | null = null;
      if (typeof planTypeRaw === 'string') {
        planType = planTypeRaw.trim() || null;
      } else if (planTypeRaw != null) {
        const serialized = planTypeRaw.toString().trim();
        planType = serialized.length > 0 ? serialized : null;
      }

      return {
        contract_id: contractId,
        plan_id: planId,
        plan_type: planType,
        enrollment,
        is_suppressed: isSuppressed,
        report_year: year,
        report_month: month,
        source_file: fileName,
      } satisfies EnrollmentInsert;
    })
    .filter((row): row is EnrollmentInsert => row !== null);

  console.log(`  Prepared ${inserts.length} rows for upsert`);

  const batchSize = 1000;
  for (let i = 0; i < inserts.length; i += batchSize) {
    const batch = inserts.slice(i, i + batchSize);
    const { error } = await supabase
      .from('ma_plan_enrollment')
      .upsert(batch, { onConflict: 'contract_id,plan_id,report_year,report_month' });

    if (error) {
      console.error(`  ❌ Error upserting batch ${Math.floor(i / batchSize) + 1}:`, error);
      process.exit(1);
    }

    console.log(`  ✅ Upserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} rows)`);
  }

  console.log(`✅ Completed import for ${fileName}`);
}

async function main() {
  console.log('🚀 Starting MA plan enrollment import...');

  const files = discoverMonthlyFiles();
  if (files.length === 0) {
    console.warn('⚠️  No monthly enrollment files found. Expected files named Monthly_Report_By_Plan_<YEAR>_<MM>_condensed.json');
    return;
  }

  for (const file of files) {
    await importMonthlyFile(file);
  }

  console.log('\n🎉 Enrollment import completed successfully!');
}

main().catch((error) => {
  console.error('Unexpected error during import:', error);
  process.exit(1);
});
