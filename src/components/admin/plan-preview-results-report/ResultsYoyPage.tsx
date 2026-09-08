"use client";

import type { PlanPreviewResultsReport } from "@/lib/plan-preview/results-report-data";

import {
  ReportPageFrame,
  ReportSection,
  ReportStat,
  formatSigned,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

export function ResultsYoyPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: PlanPreviewResultsReport;
  pageNumber: number;
  totalPages: number;
}) {
  const movers = report.measures
    .filter((measure) => measure.star !== null && measure.publishedBaselineStar !== null)
    .map((measure) => ({
      ...measure,
      delta: (measure.star as number) - (measure.publishedBaselineStar as number),
    }))
    .filter((measure) => measure.delta !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.delta) - Math.abs(left.delta) ||
        left.measureDisplayName.localeCompare(right.measureDisplayName)
    )
    .slice(0, 14);

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Year-over-year"
      subtitle={`${report.contract.contractId} · Official stars versus published Stars ${report.baselineYear ?? "—"}`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel="Plan Preview 2 official results"
    >
      <div style={{ display: "flex", gap: 10 }}>
        <ReportStat label="Declined" value={report.yoySummary.declined} />
        <ReportStat label="Held" value={report.yoySummary.held} />
        <ReportStat label="Improved" value={report.yoySummary.improved} />
      </div>
      <ReportSection title="Largest official star moves" note="Higher stars remain better. Part C first, then Part D in the measure pages.">
        <table className="fep-table">
          <thead>
            <tr>
              <th className="l">Measure</th>
              <th>Prior</th>
              <th>Official</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {movers.length === 0 ? (
              <tr>
                <td className="l" colSpan={4}>
                  No year-over-year star changes for rated measures.
                </td>
              </tr>
            ) : (
              movers.map((measure) => (
                <tr key={measure.measureCode}>
                  <td className="l">{measure.measureDisplayName}</td>
                  <td>{formatStars(measure.publishedBaselineStar, 0)}</td>
                  <td>{formatStars(measure.star, 0)}</td>
                  <td>{formatSigned(measure.delta, 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
