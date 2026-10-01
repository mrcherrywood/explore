import { LOW_STAR_MAX } from "./clover-removal-constants";

export type LowStarMatrixPart = "Part C" | "Part D";

function measurePart(code: string): LowStarMatrixPart {
  return code.toUpperCase().startsWith("D") ? "Part D" : "Part C";
}

function compareCodes(left: string, right: string): number {
  return left.toUpperCase().localeCompare(right.toUpperCase(), undefined, { numeric: true });
}

export const LOW_STAR_CONTRACTS_PER_PAGE = 8;
export const LOW_STAR_ROWS_PER_PAGE = 32;

export type LowStarMatrixSource = {
  /** Stars 2026 Recalc and Clover-20 measure codes. */
  recalcCodes?: readonly string[];
  contracts: Array<{
    contractId: string;
    pathMeasures: Array<{
      code: string;
      displayName: string;
      weight: number | null;
      star: number | null;
    }>;
  }>;
};

export type LowStarMatrixRow = {
  code: string;
  displayName: string;
  weight: number | null;
  /** In the Stars 2026 Recalc and Clover-20 set. */
  inRecalcSet: boolean;
  stars: Array<number | null>;
  /** Contracts in the organization, not just this page, scored 3★ or lower. */
  lowCount: number;
};

export type LowStarMatrixPage = {
  part: LowStarMatrixPart;
  contractIds: string[];
  rows: LowStarMatrixRow[];
  /** How many 3★-or-lower measures each column contract has in this part. */
  contractLowCounts: number[];
};

export function isLowStar(star: number | null): boolean {
  return star != null && star <= LOW_STAR_MAX;
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

/** Measures scored 3★ or lower on at least one contract, Part C then Part D, busiest themes first. */
export function buildLowStarMatrixPages(report: LowStarMatrixSource): LowStarMatrixPage[] {
  const contractIds = report.contracts.map((contract) => contract.contractId);
  const recalcCodes = new Set((report.recalcCodes ?? []).map((code) => code.toUpperCase()));
  const byCode = new Map<
    string,
    { code: string; displayName: string; weight: number | null; stars: Map<string, number | null> }
  >();
  for (const contract of report.contracts) {
    for (const measure of contract.pathMeasures) {
      const existing = byCode.get(measure.code);
      if (!existing) {
        byCode.set(measure.code, {
          code: measure.code,
          displayName: measure.displayName,
          weight: measure.weight,
          stars: new Map([[contract.contractId, measure.star]]),
        });
        continue;
      }
      existing.stars.set(contract.contractId, measure.star);
      if (existing.weight == null) existing.weight = measure.weight;
    }
  }

  const pages: LowStarMatrixPage[] = [];
  for (const part of ["Part C", "Part D"] as const) {
    const partRows = [...byCode.values()]
      .filter((row) => measurePart(row.code) === part)
      .map((row) => {
        const stars = contractIds.map((id) => row.stars.get(id) ?? null);
        return {
          code: row.code,
          displayName: row.displayName,
          weight: row.weight,
          inRecalcSet: recalcCodes.has(row.code.toUpperCase()),
          stars,
          lowCount: stars.filter(isLowStar).length,
        };
      })
      .filter((row) => row.lowCount > 0)
      .sort((left, right) => right.lowCount - left.lowCount || compareCodes(left.code, right.code));
    if (partRows.length === 0) continue;
    const contractLowCounts = contractIds.map((_, index) => partRows.filter((row) => isLowStar(row.stars[index])).length);
    for (const rowChunk of chunk(partRows, LOW_STAR_ROWS_PER_PAGE)) {
      for (const [columnIndex, ids] of chunk(contractIds, LOW_STAR_CONTRACTS_PER_PAGE).entries()) {
        const start = columnIndex * LOW_STAR_CONTRACTS_PER_PAGE;
        pages.push({
          part,
          contractIds: ids,
          rows: rowChunk.map((row) => ({
            ...row,
            stars: row.stars.slice(start, start + ids.length),
          })),
          contractLowCounts: contractLowCounts.slice(start, start + ids.length),
        });
      }
    }
  }
  return pages;
}
