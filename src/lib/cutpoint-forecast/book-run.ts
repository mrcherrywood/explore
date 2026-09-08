import type { ForecastProjectionRunRecord } from "./types";

/**
 * Each stars year + dataset has one accruing "book" run. Every import lands on
 * it and the cut-point overlay / PP1 read from it, so the forecast always
 * reflects the most recent data without anyone choosing a run.
 *
 * The book is the largest approved run; if nothing is approved yet, the
 * oldest run (the original upload). Later add-on-only runs never win.
 */
export function pickForecastBookRun<
  T extends Pick<ForecastProjectionRunRecord, "id" | "status" | "createdAt" | "projectionCount">,
>(runs: T[]): T | null {
  if (runs.length === 0) return null;

  const largestApproved = runs
    .filter((run) => run.status === "approved")
    .sort((left, right) => {
      const byCount = right.projectionCount - left.projectionCount;
      if (byCount !== 0) return byCount;
      return left.createdAt.localeCompare(right.createdAt);
    })[0];
  if (largestApproved) return largestApproved;

  return [...runs].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  )[0];
}

/** Latest approved Stars year, else the newest year that has any run. */
export function pickDefaultForecastYear(
  runs: Pick<ForecastProjectionRunRecord, "forecastYear" | "status">[]
): number | null {
  const approvedYears = runs
    .filter((run) => run.status === "approved")
    .map((run) => run.forecastYear);
  if (approvedYears.length > 0) return Math.max(...approvedYears);
  if (runs.length === 0) return null;
  return Math.max(...runs.map((run) => run.forecastYear));
}
