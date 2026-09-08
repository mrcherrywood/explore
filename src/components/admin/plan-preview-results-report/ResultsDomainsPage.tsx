"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Legend, XAxis, YAxis } from "recharts";

import type { PlanPreviewResultsReport } from "@/lib/plan-preview/results-report-data";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  chartValueFormatter,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

export function ResultsDomainsPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: PlanPreviewResultsReport;
  pageNumber: number;
  totalPages: number;
}) {
  const chartData = report.domains.map((domain) => ({
    name: domain.domain.length > 34 ? `${domain.domain.slice(0, 33)}…` : domain.domain,
    official: domain.officialMean,
    baseline: domain.baselineMean,
  }));

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Performance by domain"
      subtitle={`${report.contract.contractId} · Weighted mean of official measure stars`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel="Plan Preview 2 official results"
    >
      <ReportSection
        title="Weighted mean stars by domain"
        note={`Official Stars ${report.starsYear} versus published Stars ${report.baselineYear ?? "—"}.`}
      >
        <div className="fep-report-panel" style={{ padding: "14px 12px 4px" }}>
          <BarChart
            width={686}
            height={Math.max(200, 26 + chartData.length * 42)}
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 48, left: 4, bottom: 0 }}
            barCategoryGap={8}
          >
            <CartesianGrid stroke={REPORT_COLORS.grid} horizontal={false} />
            <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 9 }} />
            <YAxis type="category" dataKey="name" width={210} tick={{ fontSize: 9 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="baseline" name={`Stars ${report.baselineYear ?? "prior"}`} fill={REPORT_COLORS.accentSoft}>
              <LabelList dataKey="baseline" formatter={chartValueFormatter(2)} position="right" />
            </Bar>
            <Bar dataKey="official" name={`Stars ${report.starsYear}`} fill={REPORT_COLORS.accent}>
              <LabelList dataKey="official" formatter={chartValueFormatter(2)} position="right" />
            </Bar>
          </BarChart>
        </div>
        <table className="fep-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th className="l">Domain</th>
              <th>Official</th>
              <th>Prior year</th>
            </tr>
          </thead>
          <tbody>
            {report.domains.map((domain) => (
              <tr key={domain.domain}>
                <td className="l">{domain.domain}</td>
                <td>{formatStars(domain.officialMean)}</td>
                <td>{formatStars(domain.baselineMean)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
