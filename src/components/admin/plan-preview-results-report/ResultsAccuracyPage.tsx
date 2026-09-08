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

export function ResultsAccuracyPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: PlanPreviewResultsReport;
  pageNumber: number;
  totalPages: number;
}) {
  const { accuracy, accuracySummary } = report;
  const misses = accuracy
    .filter((row) => row.delta !== null && row.delta !== 0)
    .sort((left, right) => Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0))
    .slice(0, 14);

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="PP1 prediction vs official"
      subtitle={`${report.contract.contractId} · Predicted measure stars versus published Plan Preview 2 stars`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel="Plan Preview 2 official results"
    >
      <div style={{ display: "flex", gap: 10 }}>
        <ReportStat
          label="Exact match"
          value={
            accuracySummary.compared > 0
              ? `${accuracySummary.exact}/${accuracySummary.compared}`
              : "—"
          }
        />
        <ReportStat
          label="Within 1 star"
          value={
            accuracySummary.compared > 0
              ? `${accuracySummary.withinOne}/${accuracySummary.compared}`
              : "—"
          }
        />
        <ReportStat
          label="Overall"
          value={`${formatStars(accuracySummary.overallPredicted)} → ${formatStars(accuracySummary.overallOfficial)}`}
          detail={
            accuracySummary.overallInEnvelope === null
              ? "No PP1 overall prediction"
              : accuracySummary.overallInEnvelope
                ? "Inside predicted envelope"
                : "Outside predicted envelope"
          }
        />
      </div>
      <ReportSection title="Largest prediction misses">
        <table className="fep-table">
          <thead>
            <tr>
              <th className="l">Measure</th>
              <th>PP1</th>
              <th>Official</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {misses.length === 0 ? (
              <tr>
                <td className="l" colSpan={4}>
                  {accuracySummary.compared === 0
                    ? "No PP1 predicted stars are available for this contract."
                    : "Every compared measure matched the official star."}
                </td>
              </tr>
            ) : (
              misses.map((row) => (
                <tr key={row.measureCode}>
                  <td className="l">{row.displayName}</td>
                  <td>{formatStars(row.predictedStar, 0)}</td>
                  <td>{formatStars(row.officialStar, 0)}</td>
                  <td>{formatSigned(row.delta, 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
