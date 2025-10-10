/**
 * Import MA Metrics data from JSON files into the database
 * This script reads measure_data and measure_stars files and populates the ma_metrics table
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface MeasureRow {
  CONTRACT_ID: string;
  'Organization Type': string;
  'Contract Name': string;
  'Organization Marketing Name': string;
  [key: string]: string; // For measure columns like "C01: Breast Cancer Screening"
}

interface MetricInsert {
  contract_id: string;
  year: number;
  metric_code: string;
  metric_label: string;
  metric_category: string;
  rate_percent: number | null;
  star_rating: string | null;
  source_file: string;
}

const normalizeMeasureName = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();

const deriveCategory = (code: string) =>
  code.startsWith('C') ? 'Part C' : code.startsWith('D') ? 'Part D' : 'Other';

async function buildMeasureLookup(year: number) {
  const { data, error } = await supabase
    .from('ma_measures')
    .select('code, name')
    .eq('year', year);

  if (error) {
    console.error(`  ❌ Error fetching measure metadata for ${year}:`, error);
    process.exit(1);
  }

  const codeToName = new Map<string, string>();
  const nameToCategoryToCode = new Map<string, Map<string, string>>();

  for (const row of data ?? []) {
    if (!row.code || !row.name) continue;
    const code = row.code.trim();
    const name = row.name.trim();
    const normalized = normalizeMeasureName(name);
    codeToName.set(code, name);
    const category = deriveCategory(code);
    if (!nameToCategoryToCode.has(normalized)) {
      nameToCategoryToCode.set(normalized, new Map());
    }
    const categoryMap = nameToCategoryToCode.get(normalized)!;
    if (!categoryMap.has(category)) {
      categoryMap.set(category, code);
    }
  }

  return { codeToName, nameToCategoryToCode };
}

async function importYear(year: number) {
  console.log(`\n📅 Importing data for year ${year}...`);

  const dataPath = path.join(process.cwd(), 'data', year.toString(), `measure_data_${year}.json`);
  const starsPath = path.join(process.cwd(), 'data', year.toString(), `measure_stars_${year}.json`);

  // Read JSON files
  const measureData: MeasureRow[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const measureStars: MeasureRow[] = JSON.parse(fs.readFileSync(starsPath, 'utf-8'));

  console.log(`  Found ${measureData.length} contracts`);

  const measureLookup = await buildMeasureLookup(year);

  // Fetch contract roster for this year to enforce FK constraints
  const { data: contractRows, error: contractFetchError } = await supabase
    .from('ma_contracts')
    .select('contract_id')
    .eq('year', year);

  if (contractFetchError) {
    console.error('  ❌ Error fetching contracts:', contractFetchError);
    process.exit(1);
  }

  const validContracts = new Set(
    (contractRows ?? [])
      .map((row) => (row as { contract_id: string }).contract_id?.trim())
      .filter((value): value is string => Boolean(value))
  );

  // Create a map for quick lookup
  const starsMap = new Map(
    measureStars.map(row => [row.CONTRACT_ID.trim(), row])
  );
  
  const metricsToInsert: MetricInsert[] = [];
  let processedCount = 0;
  const missingContracts = new Set<string>();

  // Process each contract
  for (const dataRow of measureData) {
    const contractId = dataRow.CONTRACT_ID.trim();

    if (!validContracts.has(contractId)) {
      missingContracts.add(contractId);
      continue;
    }

    const starsRow = starsMap.get(contractId);

    if (!starsRow) {
      console.warn(`  ⚠️  No stars data found for contract ${contractId}`);
      continue;
    }
    // Process each measure column
    for (const [key, value] of Object.entries(dataRow)) {
      if (['CONTRACT_ID', 'Organization Type', 'Contract Name', 'Organization Marketing Name', 'Parent Organization'].includes(key)) {
        continue;
      }

      // Extract measure code and label
      const match = key.match(/^([A-Z]\d+):\s*(.+)$/);
      if (!match) continue;

      const [, rawCode, rawLabel] = match;
      const label = rawLabel.trim();
      const normalizedLabel = normalizeMeasureName(label);

      let code = rawCode.trim();
      const knownName = measureLookup.codeToName.get(code);
      if (knownName) {
        const normalizedKnownName = normalizeMeasureName(knownName);
        if (normalizedKnownName !== normalizedLabel) {
          const categoryFromCode = deriveCategory(code);
          const remappedCode = measureLookup.nameToCategoryToCode.get(normalizedLabel)?.get(categoryFromCode)
            ?? measureLookup.nameToCategoryToCode.get(normalizedLabel)?.values().next().value;
          if (remappedCode) {
            code = remappedCode;
          }
        }
      } else {
        const categoryFromCode = deriveCategory(code);
        const categoryMap = measureLookup.nameToCategoryToCode.get(normalizedLabel);
        const remappedCode = categoryMap?.get(categoryFromCode) ?? categoryMap?.values().next().value;
        if (remappedCode) {
          code = remappedCode;
        } else {
          console.warn(`  ⚠️  Skipping measure "${label}" (${code}) for contract ${contractId} - no code mapping found in ma_measures ${year}`);
          continue;
        }
      }

      const canonicalName = measureLookup.codeToName.get(code) ?? label;

      const metricCategory = code.startsWith('C') ? 'Part C' : code.startsWith('D') ? 'Part D' : 'Other';
      const starValue = starsRow[key];
      
      // Parse numeric value
      let ratePercent: number | null = null;
      if (value && value.trim() !== '' && value !== 'Plan not required to report measure') {
        const numericValue = parseFloat(value);
        if (!isNaN(numericValue)) {
          ratePercent = numericValue;
        }
      }
      
      // Parse star rating
      let starRating: string | null = null;
      if (starValue && starValue.trim() !== '' && starValue !== 'Plan not required to report measure') {
        starRating = starValue.trim();
      }
      
      // Only insert if we have at least one value
      if (ratePercent !== null || starRating !== null) {
        metricsToInsert.push({
          contract_id: contractId,
          year,
          metric_code: code,
          metric_label: canonicalName,
          metric_category: metricCategory,
          rate_percent: ratePercent,
          star_rating: starRating,
          source_file: `measure_data_${year}.json`,
        });
      }
    }
    
    processedCount++;
    if (processedCount % 100 === 0) {
      console.log(`  Processed ${processedCount}/${measureData.length} contracts...`);
    }
  }
  
  console.log(`  📊 Prepared ${metricsToInsert.length} metrics to insert`);

  if (missingContracts.size > 0) {
    console.warn(
      `  ⚠️ Skipping ${missingContracts.size} contracts without ma_contracts entries: ${Array.from(missingContracts).slice(0, 10).join(', ')}${
        missingContracts.size > 10 ? '…' : ''
      }`
    );
  }

  // Insert in batches
  const batchSize = 1000;
  for (let i = 0; i < metricsToInsert.length; i += batchSize) {
    const batch = metricsToInsert.slice(i, i + batchSize);
    const { error } = await supabase
      .from('ma_metrics')
      .insert(batch);
    
    if (error) {
      console.error(`  ❌ Error inserting batch ${i / batchSize + 1}:`, error);
    } else {
      console.log(`  ✅ Inserted batch ${i / batchSize + 1} (${batch.length} records)`);
    }
  }
  
  console.log(`✅ Completed import for year ${year}`);
}

async function main() {
  console.log('🚀 Starting MA Metrics import...\n');
  
  // Clear existing data
  console.log('🗑️  Clearing existing ma_metrics data...');
  const { error: deleteError } = await supabase
    .from('ma_metrics')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  
  if (deleteError) {
    console.error('❌ Error clearing data:', deleteError);
    process.exit(1);
  }
  console.log('✅ Cleared existing data\n');
  
  // Import each year
  const yearsToImport = [2023, 2024, 2025, 2026];

  for (const year of yearsToImport) {
    await importYear(year);
  }
  
  console.log('\n🎉 Import completed successfully!');
}

main().catch(console.error);
