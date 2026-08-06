"use client";

import type { Ref } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  XAxis,
  YAxis,
} from "recharts";

import type { PlanPreviewContractReport } from "@/lib/plan-preview/report-data";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  chartValueFormatter,
  formatSigned,
  formatStars,
} from "./report-shared";

export function DomainsPage({
  report,
  pageNumber,
  totalPages,
  pageRef,
}: {
  report: PlanPreviewContractReport;
  pageNumber: number;
  totalPages: number;
  pageRef?: Ref<HTMLDivElement>;
}) {
  const domains = report.domains;
  const chartData = domains.map((domain) => ({
    name: domain.domain.length > 34 ? `${domain.domain.slice(0, 33)}…` : domain.domain,
    predicted: domain.predictedMean,
    baseline: domain.baselineMean,
  }));
  const chartHeight = Math.max(200, 26 + chartData.length * 52);

  return (
    <ReportPageFrame
      pageRef={pageRef}
      eyebrow={`Plan Preview 1 · Stars ${report.starsYear} Projection`}
      title="Performance by Domain"
      subtitle={`${report.contract.contractId} · Weighted mean of predicted measure stars, grouped by CMS domain`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
    >
      <ReportSection
        title="Weighted Mean Stars by Domain"
        note={`Predicted Stars ${report.starsYear} domain means versus this contract's published Stars ${report.baselineYear ?? "—"} domain stars (same weighted averages as Contract Summary).`}
      >
        <div className="fep-report-panel" style={{ padding: "14px 12px 4px" }}>
          <BarChart
            width={686}
            height={chartHeight}
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 48, left: 4, bottom: 0 }}
            barCategoryGap={10}
          >
            <CartesianGrid stroke={REPORT_COLORS.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fontSize: 10, fill: REPORT_COLORS.muted }}
              axisLine={{ stroke: REPORT_COLORS.grid }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={96}
              tick={{ fontSize: 10, fontWeight: 600, fill: REPORT_COLORS.ink }}
              axisLine={false}
              tickLine={false}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={26}
              iconSize={9}
              wrapperStyle={{ fontSize: 10, fontWeight: 700 }}
              formatter={(value) => (
                <span style={{ color: REPORT_COLORS.ink, fontWeight: 700 }}>{value}</span>
              )}
            />
            <Bar
              dataKey="baseline"
              name={`Stars ${report.baselineYear ?? "—"} published`}
              fill={REPORT_COLORS.band}
              radius={[0, 4, 4, 0]}
              barSize={14}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="baseline"
                position="right"
                formatter={chartValueFormatter(2)}
                style={{ fontSize: 9, fontWeight: 700, fill: REPORT_COLORS.ink }}
              />
            </Bar>
            <Bar
              dataKey="predicted"
              name={`Predicted Stars ${report.starsYear}`}
              fill={REPORT_COLORS.accent}
              radius={[0, 4, 4, 0]}
              barSize={14}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="predicted"
                position="right"
                formatter={chartValueFormatter(2)}
                style={{ fontSize: 9, fontWeight: 800, fill: REPORT_COLORS.accent }}
              />
            </Bar>
          </BarChart>
        </div>
      </ReportSection>

      <ReportSection title="Domain Detail" style={{ marginTop: 16 }}>
        <div className="fep-report-panel" style={{ padding: "12px 0 4px" }}>
          <table className="fep-report-table">
            <thead>
              <tr>
                <th className="l">Domain</th>
                <th className="l">Part</th>
                <th>Measures rated</th>
                <th>Stars {report.baselineYear ?? "—"} published</th>
                <th>Predicted Stars {report.starsYear}</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => {
                const delta =
                  domain.predictedMean !== null && domain.baselineMean !== null
                    ? Math.round((domain.predictedMean - domain.baselineMean) * 100) / 100
                    : null;
                return (
                  <tr key={domain.domain}>
                    <td className="l" style={{ fontWeight: 600, color: "var(--fep-ink)", whiteSpace: "normal" }}>
                      {domain.domain}
                    </td>
                    <td className="l">{domain.part}</td>
                    <td>
                      {domain.ratedMeasureCount} of {domain.measureCount}
                    </td>
                    <td>{formatStars(domain.baselineMean, 2)}</td>
                    <td style={{ fontWeight: 800, color: "var(--fep-ink)" }}>
                      {formatStars(domain.predictedMean, 2)}
                    </td>
                    <td
                      style={{
                        fontWeight: 700,
                        color:
                          delta === null || delta === 0
                            ? "var(--fep-faint)"
                            : delta > 0
                              ? REPORT_COLORS.accent
                              : REPORT_COLORS.negative,
                      }}
                    >
                      {formatSigned(delta, 2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 8 }}>
          Stars {report.baselineYear ?? "—"} published domain means match Contract Summary: published
          measure stars weighted by that year&apos;s measure weights. Predicted means use accrued
          plan preview stars (MCAHPS adjusted base stars for CAHPS when uploaded) with Stars{" "}
          {report.starsYear} weights. Domain groupings follow CMS Stars{" "}
          {report.baselineYear ?? "—"} measure-to-domain assignments; measures new to Stars{" "}
          {report.starsYear} (e.g. Polypharmacy Poly-ACH) are assigned to their CMS domain.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
