import type { ResultsBookCompare, ResultsBookCompareRow } from "./results-report-types";

export const BOOK_COMPARE_EVEN_TOLERANCE = 1;

/** Rows split for the leads / trails chart; even measures are listed separately. */
export function splitBookCompareRows(compare: ResultsBookCompare): {
  leads: ResultsBookCompareRow[];
  trails: ResultsBookCompareRow[];
  even: ResultsBookCompareRow[];
} {
  return {
    leads: compare.rows.filter((row) => row.advantage > BOOK_COMPARE_EVEN_TOLERANCE),
    trails: compare.rows
      .filter((row) => row.advantage < -BOOK_COMPARE_EVEN_TOLERANCE)
      .sort((left, right) => left.advantage - right.advantage),
    even: compare.rows.filter((row) => Math.abs(row.advantage) <= BOOK_COMPARE_EVEN_TOLERANCE),
  };
}
