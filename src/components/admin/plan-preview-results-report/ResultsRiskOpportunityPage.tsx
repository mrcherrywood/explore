"use client";

import type { PlanPreviewResultsReport } from "@/lib/plan-preview/results-report-data";
import type { RiskOpportunityRow } from "@/lib/plan-preview/risk-opportunity";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  formatScore,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

function ProximityTable({
  rows,
  empty,
  cutLabel,
}: {
  rows: RiskOpportunityRow[];
  empty: string;
  cutLabel: string;
}) {
  return (
    <table className="fep-table">
      <thead>
        <tr>
          <th className="l">Measure</th>
          <th>Star</th>
          <th>Score</th>
          <th>{cutLabel}</th>
          <th>Gap</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td className="l" colSpan={5}>
              {empty}
            </td>
          </tr>
        ) : (
          rows.slice(0, 8).map((row) => (
            <tr key={`${row.kind}-${row.measureCode}`}>
              <td className="l">
                {row.measureCode}: {row.displayName}
              </td>
              <td>{formatStars(row.officialStar, 0)}</td>
              <td>{formatScore(row.score, row.inverted ? 2 : 1)}</td>
              <td>{formatScore(row.cut, row.inverted ? 2 : 1)}</td>
              <td>{formatScore(row.gap, row.inverted ? 2 : 1)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function ResultsRiskOpportunityPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: PlanPreviewResultsReport;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Risk and opportunity"
      subtitle={`${report.contract.contractId} · PP1 scores against official cut points`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel="Plan Preview 2 official results"
    >
      <div style={{ display: "flex", gap: 10 }}>
        <ReportStat
          label="Risk measures"
          value={report.risk.length}
          detail="Within 2 points of the lower cut (1 for CAHPS, 0.05 for inverted)"
        />
        <ReportStat
          label="Opportunity measures"
          value={report.opportunity.length}
          detail="Within 2 points of the next-star cut (1 for CAHPS, 0.05 for inverted)"
        />
      </div>
      <ReportSection
        title="Risk"
        note="Just above the cut that awarded this star. A small score drop, or a slightly harder cut, would lose a star."
        style={{ marginTop: 14 }}
      >
        <div
          className="fep-report-panel"
          style={{ padding: "8px 10px", borderColor: REPORT_COLORS.negative }}
        >
          <ProximityTable
            rows={report.risk}
            cutLabel="Lower cut"
            empty="No rated measures sit close to the lower official cut."
          />
        </div>
      </ReportSection>
      <ReportSection
        title="Opportunity"
        note="Just below the next-star cut. A small score gain, or a slightly easier cut, would earn another star."
      >
        <div
          className="fep-report-panel"
          style={{ padding: "8px 10px", borderColor: REPORT_COLORS.positive }}
        >
          <ProximityTable
            rows={report.opportunity}
            cutLabel="Next cut"
            empty="No rated measures sit close to the next official cut."
          />
        </div>
      </ReportSection>
    </ReportPageFrame>
  );
}
