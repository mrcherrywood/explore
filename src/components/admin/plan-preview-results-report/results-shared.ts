import type { PlanPreviewResultsReport } from "@/lib/plan-preview/results-report-data";

/** Footer product line on every Plan Preview 2 report page. */
export const PP2_PRODUCT_LABEL = "Plan Preview 2 official results";

export type ResultsPageProps = {
  report: PlanPreviewResultsReport;
  pageNumber: number;
  totalPages: number;
  sample?: boolean;
};

export type ResultsMeasurePart = "Part C" | "Part D";

export function resultsMeasurePart(measureCode: string): ResultsMeasurePart {
  return measureCode.toUpperCase().startsWith("D") ? "Part D" : "Part C";
}

/** QI codes move (C30 in 2026, C29 in 2027); match the display name. */
export function isQualityImprovementMeasure(displayName: string): boolean {
  return /quality improvement/i.test(displayName);
}

export function qualityImprovementMeasure<
  T extends { measureDisplayName: string; measureCode: string },
>(measures: T[], part: ResultsMeasurePart): T | undefined {
  return measures.find(
    (row) =>
      isQualityImprovementMeasure(row.measureDisplayName) &&
      resultsMeasurePart(row.measureCode) === part,
  );
}

/** Natural measure-code order (C01, C02 … C30, D01 …). */
export function compareMeasureCodes(left: string, right: string): number {
  return left
    .toUpperCase()
    .localeCompare(right.toUpperCase(), undefined, { numeric: true });
}

/** Weight lookup so pages that only carry a measure code can show it. */
export function weightByMeasureCode(
  report: PlanPreviewResultsReport,
): Map<string, number> {
  return new Map(
    report.measures.map((measure) => [
      measure.measureCode.toUpperCase(),
      measure.weight,
    ]),
  );
}
