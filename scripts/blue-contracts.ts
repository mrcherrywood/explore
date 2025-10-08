import * as fs from 'fs';
import * as path from 'path';

let cachedBlueContracts: Set<string> | null = null;
let didWarnMissingFile = false;

type BluesListFile = {
  Sheet1?: Array<{
    CONTRACT_ID?: string;
    BLUE?: boolean;
  }>;
};

function loadBlueContractsInternal(): Set<string> {
  const filePath = path.join(process.cwd(), 'data', 'Blues_List.json');

  if (!fs.existsSync(filePath)) {
    if (!didWarnMissingFile) {
      console.warn(`⚠️ Blues list file not found at ${filePath}. All contracts will default to non-Blue.`);
      didWarnMissingFile = true;
    }
    return new Set();
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as BluesListFile;
    const entries = parsed?.Sheet1 ?? [];

    const contractIds = entries
      .filter((entry) => Boolean(entry.BLUE))
      .map((entry) => entry.CONTRACT_ID?.trim().toUpperCase())
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

    return new Set(contractIds);
  } catch (error) {
    console.error('Failed to parse Blues list JSON. Defaulting to no Blue contracts.', error);
    return new Set();
  }
}

function ensureCache(): Set<string> {
  if (!cachedBlueContracts) {
    cachedBlueContracts = loadBlueContractsInternal();
  }
  return cachedBlueContracts;
}

export function isBlueContract(contractId: unknown): boolean {
  if (typeof contractId !== 'string') {
    return false;
  }

  const normalized = contractId.trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  return ensureCache().has(normalized);
}

export function getBlueContractIds(): string[] {
  return Array.from(ensureCache().values());
}
