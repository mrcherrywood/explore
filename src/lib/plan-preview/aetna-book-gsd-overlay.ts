import { isGlycemicStatusMeasure } from "@/lib/cutpoint-forecast/exclusions";
import type { ImportedMonthlyMeasureRow } from "@/lib/cutpoint-forecast/types";

import type { AetnaBookScoreInput } from "./aetna-book-compare";

function scoreKey(contractId: string, measureNormalized: string): string {
  return `${contractId.trim().toUpperCase()}::${measureNormalized}`;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Year-end GSD from a Press Ganey extract, without writing to the forecast book.
 * Month 13 in this file is the next measurement year starting over (~13), not
 * Stars year-end. Use Projected Final when present, otherwise month 12.
 */
export function gsdYearEndFromImportedRows(
  rows: ImportedMonthlyMeasureRow[],
  starsYear: number,
): AetnaBookScoreInput[] {
  const byContract = new Map<
    string,
    { template: ImportedMonthlyMeasureRow; score: number }
  >();

  for (const row of rows) {
    if (row.year !== starsYear) continue;
    if (!isGlycemicStatusMeasure(row.measureNormalized)) continue;
    const contractId = row.contractId.trim().toUpperCase();

    if (row.projectedFinal != null && Number.isFinite(row.projectedFinal)) {
      byContract.set(contractId, {
        template: row,
        score: round2(row.projectedFinal),
      });
      continue;
    }

    if (row.normalizedMonth !== 12 || row.rate == null) continue;
    if (byContract.has(contractId)) continue;
    byContract.set(contractId, { template: row, score: round2(row.rate) });
  }

  return [...byContract.entries()]
    .map(([contractId, { template, score }]) => ({
      contractId,
      measureNormalized: template.measureNormalized,
      measureDisplayName: template.measureDisplayName,
      measureCode: template.measureCode,
      metricCategory: template.metricCategory,
      score,
    }))
    .sort((left, right) => left.contractId.localeCompare(right.contractId));
}

/** Fill GSD (or any overlay) only for book contracts that are missing that measure. */
export function mergeMissingBookScores(
  existing: AetnaBookScoreInput[],
  overlay: AetnaBookScoreInput[],
): { rows: AetnaBookScoreInput[]; added: number } {
  const bookContracts = new Set(
    existing.map((row) => row.contractId.trim().toUpperCase()),
  );
  const present = new Set(
    existing.map((row) => scoreKey(row.contractId, row.measureNormalized)),
  );
  const extra: AetnaBookScoreInput[] = [];
  for (const row of overlay) {
    const id = row.contractId.trim().toUpperCase();
    if (!bookContracts.has(id)) continue;
    const key = scoreKey(id, row.measureNormalized);
    if (present.has(key)) continue;
    present.add(key);
    extra.push({ ...row, contractId: id });
  }
  return { rows: [...existing, ...extra], added: extra.length };
}
