import { getLatestContractRecords } from "@/lib/band-movement/analysis";

/**
 * Aetna / CVS GSD (Diabetes Care – Blood Sugar Controlled) year-end scores
 * from the Press Ganey extract are not trusted for cut-point forecast.
 * Full Market falls back to last year's published score for those contracts.
 */
let aetnaContractIdsCache: Set<string> | null = null;

export function isGlycemicStatusMeasure(measureNormalized: string): boolean {
  const n = measureNormalized.toLowerCase();
  return (
    n.includes("blood sugar controlled") ||
    n.includes("glycemic status") ||
    /\bgsd\b/.test(n)
  );
}

export function isAetnaForecastParent(parentOrg: string): boolean {
  return /cvs health/i.test(parentOrg);
}

export function aetnaForecastContractIds(): Set<string> {
  if (aetnaContractIdsCache) return aetnaContractIdsCache;
  aetnaContractIdsCache = new Set(
    getLatestContractRecords()
      .filter((record) => isAetnaForecastParent(record.parentOrg))
      .map((record) => record.contractId.trim().toUpperCase()),
  );
  return aetnaContractIdsCache;
}

export function shouldExcludeForecastScore(
  contractId: string,
  measureNormalized: string,
): boolean {
  if (!isGlycemicStatusMeasure(measureNormalized)) return false;
  return aetnaForecastContractIds().has(contractId.trim().toUpperCase());
}

export function excludeUntrustedForecastSamples<T extends { contractId: string }>(
  samples: T[],
  measureNormalized: string,
): T[] {
  return samples.filter(
    (sample) => !shouldExcludeForecastScore(sample.contractId, measureNormalized),
  );
}

export function excludeUntrustedForecastProjections<
  T extends { contractId: string; measureNormalized: string },
>(rows: T[]): T[] {
  return rows.filter(
    (row) => !shouldExcludeForecastScore(row.contractId, row.measureNormalized),
  );
}

/** Test helper — drop the parent-org contract cache. */
export function clearForecastExclusionCacheForTests(): void {
  aetnaContractIdsCache = null;
}
