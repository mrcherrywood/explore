"use client";

import type { Ref } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import type { PlanPreviewContractReport } from "@/lib/plan-preview/report-data";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  chartValueFormatter,
  formatScore,
  formatSigned,
  formatStars,
  reportEyebrow,
} from "./report-shared";

export function QiSensitivityPage({
  report,
  pageNumber,
  totalPages,
  pageRef,
  sample,
}: {
  report: PlanPreviewContractReport;
  pageNumber: number;
  totalPages: number;
  pageRef?: Ref<HTMLDivElement>;
  sample?: boolean;
}) {
  const baseline =
    report.scenarios.find((scenario) => scenario.id === "baseline")?.score
      ?.finalScoreRaw ?? null;
  const points = report.qiSensitivity ?? [];
  const chartData = points.map((point) => ({
    name: `${point.qiStar}★ QI`,
    score: point.finalScoreRaw,
  }));

  return (
    <ReportPageFrame
      pageRef={pageRef}
      eyebrow={reportEyebrow(report.starsYear, sample)}
      title="QI Rating Sensitivity"
      subtitle={`${report.contract.contractId} · Overall score if Quality Improvement measures average each whole-star rating`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      sample={sample}
    >
      <ReportSection
        title="Overall score by average QI rating"
        note="Plan preview 1 does not include QI scores. This page injects Part C and Part D Quality Improvement (C30/D04, weight 5) at each whole-star rating into the anchored population, recomputes reward factor thresholds, and re-scores this contract."
      >
        <div className="fep-report-panel" style={{ padding: "12px 10px 4px" }}>
          <BarChart
            width={686}
            height={220}
            data={chartData}
            margin={{ top: 18, right: 16, left: -18, bottom: 0 }}
          >
            <CartesianGrid stroke={REPORT_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{
                fontSize: 11,
                fontWeight: 700,
                fill: REPORT_COLORS.ink,
              }}
              axisLine={{ stroke: REPORT_COLORS.grid }}
              tickLine={false}
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tick={{ fontSize: 10, fill: REPORT_COLORS.muted }}
              axisLine={false}
              tickLine={false}
            />
            <Bar
              dataKey="score"
              fill={REPORT_COLORS.accent}
              radius={[5, 5, 0, 0]}
              barSize={56}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="score"
                position="top"
                formatter={chartValueFormatter(3, "", "n/a")}
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  fill: REPORT_COLORS.ink,
                }}
              />
            </Bar>
          </BarChart>
        </div>
      </ReportSection>

      <ReportSection title="Detail" style={{ marginTop: 14 }}>
        <div className="fep-report-panel" style={{ padding: "10px 0 4px" }}>
          <table className="fep-report-table">
            <thead>
              <tr>
                <th className="l">Average QI rating</th>
                <th>Measures</th>
                <th>Base mean</th>
                <th>Reward factor</th>
                <th>Final score</th>
                <th>Rounded rating</th>
                <th>vs. no QI</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => {
                const delta =
                  point.finalScoreRaw !== null && baseline !== null
                    ? Math.round((point.finalScoreRaw - baseline) * 1000) /
                      1000
                    : null;
                return (
                  <tr key={point.qiStar}>
                    <td
                      className="l"
                      style={{ fontWeight: 700, color: "var(--fep-ink)" }}
                    >
                      {point.qiStar}★
                    </td>
                    <td>{point.measureCount ?? "—"}</td>
                    <td>{formatScore(point.baseMean)}</td>
                    <td>{formatSigned(point.rewardFactor, 1)}</td>
                    <td style={{ fontWeight: 800, color: "var(--fep-ink)" }}>
                      {formatScore(point.finalScoreRaw)}
                    </td>
                    <td>{formatStars(point.finalRating)}★</td>
                    <td
                      style={{
                        fontWeight: 800,
                        color:
                          delta === null || delta === 0
                            ? "var(--fep-faint)"
                            : delta > 0
                              ? REPORT_COLORS.positive
                              : REPORT_COLORS.negative,
                      }}
                    >
                      {formatSigned(delta, 3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 8 }}>
          &quot;vs. no QI&quot; compares each row to this report&apos;s all-measures
          projection, which excludes QI. Thresholds move with the full H+R
          population as QI stars change.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
