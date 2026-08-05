"use client";

import type { Ref } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import type { PlanPreviewContractReport, ReportMeasure } from "@/lib/plan-preview/report-data";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  chartValueFormatter,
  formatStars,
} from "./report-shared";

const MAX_MOVERS = 12;

function moversFor(measures: ReportMeasure[]): (ReportMeasure & { delta: number })[] {
  return measures
    .filter(
      (measure) => measure.predictedStar !== null && measure.publishedBaselineStar !== null
    )
    .map((measure) => ({
      ...measure,
      delta: (measure.predictedStar as number) - (measure.publishedBaselineStar as number),
    }))
    .filter((measure) => measure.delta !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.delta) - Math.abs(left.delta) || right.weight - left.weight
    )
    .slice(0, MAX_MOVERS);
}

export function YoyPage({
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
  const baseline = report.scenarios.find((scenario) => scenario.id === "baseline");
  const predictedRating = baseline?.score?.finalRating ?? null;

  const chartData = [
    ...report.history.map((point) => ({
      year: String(point.year),
      overall: point.overall,
      partC: point.partC,
      partD: point.partD,
      predicted: false,
    })),
    {
      year: `${report.starsYear} (proj.)`,
      overall: predictedRating,
      partC: null,
      partD: null,
      predicted: true,
    },
  ];

  const movers = moversFor(report.measures);
  const { declined, held, improved, newOrUnrated } = report.yoySummary;

  return (
    <ReportPageFrame
      pageRef={pageRef}
      eyebrow={`Plan Preview 1 · Stars ${report.starsYear} Projection`}
      title="Year-over-Year Performance"
      subtitle={`${report.contract.contractId} · Published CMS ratings history with the Stars ${report.starsYear} projection`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
    >
      <ReportSection
        title="Overall Rating Trend"
        note={`Published Overall, Part C, and Part D summary ratings by Star year; the final bar is this report's projected Stars ${report.starsYear} Overall rating.`}
      >
        <div className="fep-report-panel" style={{ padding: "14px 10px 4px" }}>
          <ComposedChart
            width={686}
            height={225}
            data={chartData}
            margin={{ top: 20, right: 18, left: -18, bottom: 0 }}
          >
            <CartesianGrid stroke={REPORT_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10.5, fontWeight: 700, fill: REPORT_COLORS.ink }}
              axisLine={{ stroke: REPORT_COLORS.grid }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fontSize: 10, fill: REPORT_COLORS.muted }}
              axisLine={false}
              tickLine={false}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={24}
              iconSize={9}
              wrapperStyle={{ fontSize: 10, fontWeight: 700 }}
            />
            <Bar dataKey="overall" name="Overall" radius={[5, 5, 0, 0]} barSize={40} isAnimationActive={false}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.year}
                  fill={entry.predicted ? REPORT_COLORS.accent : REPORT_COLORS.band}
                />
              ))}
              <LabelList
                dataKey="overall"
                position="top"
                formatter={chartValueFormatter(1)}
                style={{ fontSize: 11, fontWeight: 800, fill: REPORT_COLORS.ink }}
              />
            </Bar>
            <Line
              dataKey="partC"
              name="Part C summary"
              stroke={REPORT_COLORS.accentSoft}
              strokeWidth={2}
              dot={{ r: 3, fill: REPORT_COLORS.accentSoft }}
              isAnimationActive={false}
            />
            <Line
              dataKey="partD"
              name="Part D summary"
              stroke={REPORT_COLORS.negative}
              strokeWidth={2}
              dot={{ r: 3, fill: REPORT_COLORS.negative }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </div>
      </ReportSection>

      <ReportSection
        title="Measure Movement vs Published Stars"
        note={`Each accrued measure's predicted Stars ${report.starsYear} star compared with the contract's published Stars ${report.baselineYear ?? "—"} star for the same measure. CAHPS predictions marked Adjusted use case-mix and reliability adjusted base stars.`}
        style={{ marginTop: 16 }}
      >
        <div style={{ display: "flex", gap: 12 }}>
          <ReportStat label="Declined" value={declined} detail="Predicted below published" />
          <ReportStat label="Held" value={held} detail="Predicted equals published" />
          <ReportStat label="Improved" value={improved} detail="Predicted above published" />
          <ReportStat label="New / unrated" value={newOrUnrated} detail="No comparison available" />
        </div>

        <div className="fep-report-panel" style={{ marginTop: 12, padding: "12px 0 4px" }}>
          <table className="fep-report-table">
            <thead>
              <tr>
                <th className="l">Largest movers</th>
                <th>Weight</th>
                <th>Stars {report.baselineYear ?? "—"} (published)</th>
                <th>Stars {report.starsYear} (predicted)</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {movers.length === 0 ? (
                <tr>
                  <td className="l" colSpan={5} style={{ color: "var(--fep-faint)" }}>
                    No rated measures moved versus the published baseline.
                  </td>
                </tr>
              ) : (
                movers.map((measure) => (
                  <tr key={measure.measureCode}>
                    <td className="l" style={{ whiteSpace: "normal", maxWidth: 330 }}>
                      <span style={{ fontWeight: 700, color: "var(--fep-ink)" }}>{measure.measureCode}</span>{" "}
                      <span style={{ color: "var(--fep-muted)" }}>{measure.displayName}</span>
                    </td>
                    <td>{measure.weight}</td>
                    <td>{formatStars(measure.publishedBaselineStar, 0)}★</td>
                    <td style={{ fontWeight: 800, color: "var(--fep-ink)" }}>
                      {formatStars(measure.predictedStar, 0)}★
                      {measure.starSource === "cahps_case_mix_reliability" ? (
                        <span className="fep-report-pill" style={{ marginLeft: 6, textTransform: "none" }}>
                          Adjusted
                        </span>
                      ) : null}
                    </td>
                    <td
                      style={{
                        fontWeight: 800,
                        color: measure.delta > 0 ? REPORT_COLORS.accent : REPORT_COLORS.negative,
                      }}
                    >
                      {measure.delta > 0 ? "+" : ""}
                      {measure.delta}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 8 }}>
          Movement reflects both the plan&apos;s score change and projected cut point movement.
          Showing the {Math.min(movers.length, MAX_MOVERS)} largest changes by star delta, then
          measure weight.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
