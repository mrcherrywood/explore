import { BOOK_COMPARE_EVEN_TOLERANCE, splitBookCompareRows } from "./book-compare-split";
import type { PlanPreviewPredictionsResult } from "./predictions";
import type { ResultsBookCompare, ResultsBookCompareRow } from "./results-report-types";

export type { ResultsBookCompare, ResultsBookCompareRow } from "./results-report-types";
export { splitBookCompareRows };

export type ResultsBookCompareMeasure = {
  measureCode: string;
  measureDisplayName: string;
  weight: number;
  pp1Score: number | null;
  inverted?: boolean;
};

const EVEN_TOLERANCE = BOOK_COMPARE_EVEN_TOLERANCE;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function emptyResultsBookCompare(): ResultsBookCompare {
  return { bookContractCount: 0, leads: 0, trails: 0, even: 0, rows: [] };
}

/** Mean plan preview score per measure code across every book contract except `contractId`. */
export function bookScoreMeansByMeasure(
  predictions: PlanPreviewPredictionsResult,
  contractId: string,
): { bookContractCount: number; means: Map<string, { mean: number; n: number }> } {
  const sums = new Map<string, { sum: number; n: number }>();
  let bookContractCount = 0;
  for (const contract of predictions.contracts) {
    if (contract.contractId.toUpperCase() === contractId.toUpperCase()) continue;
    bookContractCount += 1;
    for (const measure of contract.measures) {
      if (measure.score === null || !Number.isFinite(measure.score)) continue;
      const code = measure.measureCode.toUpperCase();
      const entry = sums.get(code) ?? { sum: 0, n: 0 };
      entry.sum += measure.score;
      entry.n += 1;
      sums.set(code, entry);
    }
  }
  const means = new Map<string, { mean: number; n: number }>();
  for (const [code, entry] of sums) {
    means.set(code, { mean: entry.sum / entry.n, n: entry.n });
  }
  return { bookContractCount, means };
}

export function buildResultsBookCompare(input: {
  contractId: string;
  measures: ResultsBookCompareMeasure[];
  predictions: PlanPreviewPredictionsResult | null | undefined;
}): ResultsBookCompare {
  if (!input.predictions) return emptyResultsBookCompare();
  const { bookContractCount, means } = bookScoreMeansByMeasure(
    input.predictions,
    input.contractId,
  );

  const rows: ResultsBookCompareRow[] = [];
  for (const measure of input.measures) {
    if (measure.pp1Score === null || !Number.isFinite(measure.pp1Score)) continue;
    const book = means.get(measure.measureCode.toUpperCase());
    if (!book) continue;
    const inverted = measure.inverted ?? false;
    const delta = round2(measure.pp1Score - book.mean);
    rows.push({
      measureCode: measure.measureCode,
      measureDisplayName: measure.measureDisplayName,
      weight: measure.weight,
      inverted,
      contractScore: round2(measure.pp1Score),
      bookMean: round2(book.mean),
      bookContracts: book.n,
      delta,
      advantage: inverted ? round2(-delta) : delta,
    });
  }

  rows.sort(
    (left, right) =>
      right.advantage - left.advantage ||
      left.measureDisplayName.localeCompare(right.measureDisplayName),
  );

  return {
    bookContractCount,
    leads: rows.filter((row) => row.advantage > EVEN_TOLERANCE).length,
    trails: rows.filter((row) => row.advantage < -EVEN_TOLERANCE).length,
    even: rows.filter((row) => Math.abs(row.advantage) <= EVEN_TOLERANCE).length,
    rows,
  };
}

