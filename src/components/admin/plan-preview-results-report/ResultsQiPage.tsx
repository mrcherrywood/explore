"use client";

import type { PlanPreviewResultsReport } from "@/lib/plan-preview/results-report-data";

import {
  ReportPageFrame,
  ReportSection,
  ReportStat,
  formatScore,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

export function ResultsQiPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: PlanPreviewResultsReport;
  pageNumber: number;
  totalPages: number;
}) {
  const rows = report.measures
    .filter((measure) => measure.qiSignificance)
    .sort((left, right) => left.measureCode.localeCompare(right.measureCode));

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Quality improvement"
      subtitle={`${report.contract.contractId} · Official per-measure improvement significance`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel="Plan Preview 2 official results"
    >
      <div style={{ display: "flex", gap: 10 }}>
        <ReportStat
          label="Part C QI score"
          value={formatScore(report.partC?.improvementScore)}
          detail={`C30 star ${report.measures.find((m) => m.measureCode === "C30")?.star ?? "—"}`}
        />
        <ReportStat
          label="Part D QI score"
          value={formatScore(report.partD?.improvementScore)}
          detail={`D04 star ${report.measures.find((m) => m.measureCode === "D04")?.star ?? "—"}`}
        />
      </div>
      <ReportSection title="Measure significance">
        <table className="fep-table">
          <thead>
            <tr>
              <th className="l">Measure</th>
              <th className="l">Significance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="l" colSpan={2}>
                  Upload the PP2 improve_c / improve_d files to show QI significance.
                </td>
              </tr>
            ) : (
              rows.slice(0, 18).map((measure) => (
                <tr key={measure.measureCode}>
                  <td className="l">
                    {measure.measureCode}: {measure.measureDisplayName}
                  </td>
                  <td className="l">{measure.qiSignificance}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
