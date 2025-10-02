import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type RawMeasureRow = Record<string, string | null | undefined>;

type DomainMetadata = {
  domain: string;
  weight: number;
};

function normalizeMeasureName(rawName: string): string {
  return rawName
    .replace(/\u0096/g, '–')
    .replace(/\u2014/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

async function buildDomainMap(): Promise<Map<string, DomainMetadata>> {
  const { data, error } = await supabase
    .from('ma_measures')
    .select('code, domain, weight, year')
    .in('year', [2025, 2024, 2023])
    .order('year', { ascending: false });

  if (error) {
    throw new Error(`Failed to load domain metadata: ${error.message}`);
  }

  const map = new Map<string, DomainMetadata>();

  for (const row of data ?? []) {
    if (!row.domain || row.weight === null || row.weight === undefined) {
      continue;
    }

    const code = row.code?.trim();
    if (!code || map.has(code)) {
      continue;
    }

    map.set(code, {
      domain: row.domain,
      weight: row.weight,
    });
  }

  return map;
}

async function importMeasures(year: number) {
  console.log(`\n📅 Importing measure definitions for ${year}`);

  const domainMap = await buildDomainMap();
  if (domainMap.size === 0) {
    console.error('No existing domain metadata found. Aborting to avoid creating new domains.');
    process.exit(1);
  }

  const filePath = path.join(process.cwd(), 'data', year.toString(), `measure_data_${year}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`Input file not found: ${filePath}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as RawMeasureRow[];

  if (!Array.isArray(rawData) || rawData.length === 0) {
    console.error(`No data found in ${filePath}`);
    process.exit(1);
  }

  const measureDefinitions = new Map<string, { code: string; name: string; domain: string; weight: number }>();

  for (const row of rawData) {
    for (const [key, value] of Object.entries(row)) {
      if (!key.includes(':')) {
        continue;
      }

      const [codePart, rawNamePart] = key.split(':');
      const code = codePart.trim();
      const rawName = (rawNamePart ?? '').trim();

      if (!code || !rawName) {
        continue;
      }

      if (measureDefinitions.has(code)) {
        continue;
      }

      const domainInfo = domainMap.get(code);
      if (!domainInfo) {
        console.warn(`⚠️  Skipping measure ${code} because no existing domain metadata was found.`);
        continue;
      }

      const name = normalizeMeasureName(rawName);

      measureDefinitions.set(code, {
        code,
        name,
        domain: domainInfo.domain,
        weight: domainInfo.weight,
      });
    }
  }

  const measures = Array.from(measureDefinitions.values());

  if (measures.length === 0) {
    console.error('No measures prepared for import. Aborting.');
    process.exit(1);
  }

  console.log(`  🧹 Removing existing measures for ${year}...`);
  const { error: deleteError } = await supabase
    .from('ma_measures')
    .delete()
    .eq('year', year);

  if (deleteError) {
    console.error('  ❌ Failed to clear existing measures:', deleteError.message);
    process.exit(1);
  }

  const payload = measures.map((measure) => ({
    ...measure,
    alias: null,
    year,
  }));

  console.log(`  📥 Inserting ${payload.length} measures...`);
  const { error: insertError } = await supabase
    .from('ma_measures')
    .insert(payload);

  if (insertError) {
    console.error('  ❌ Failed to insert measures:', insertError.message);
    process.exit(1);
  }

  console.log(`✅ Successfully imported ${payload.length} measures for ${year}`);
}

async function main() {
  try {
    for (const y of [2023, 2024, 2025]) {
      await importMeasures(y);
    }
  } catch (error) {
    console.error('Import failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
