"use client";

import type { Ref } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import type { PlanPreviewContractReport, ReportScenario } from "@/lib/plan-preview/report-data";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  chartValueFormatter,
  formatScore,
  formatSigned,
  formatStars,
} from "./report-shared";

const SCENARIO_SHORT_LABELS: Record<string, string> = {
  baseline: "All measures",
  removal2028: "2028 removals",
  removal2029: "2029 removals",
  cloverRecalc: "Clover recalc",
};

function selectedLeg(scenario: ReportScenario) {
  const score = scenario.score;
  if (!score) return null;
  return score.selectedLeg === "with_qi" ? score.withQi : score.withoutQi;
}

export function ScenariosPage({
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
  const scenarios = report.scenarios;
  const baselineRating = scenarios.find((s) => s.id === "baseline")?.score?.finalRating ?? null;

  const chartData = scenarios.map((scenario) => ({
    id: scenario.id,
    name: SCENARIO_SHORT_LABELS[scenario.id] ?? scenario.label,
    rating: scenario.score?.finalRating ?? null,
  }));

  return (
    <ReportPageFrame
      pageRef={pageRef}
      eyebrow={`Plan Preview 1 · Stars ${report.starsYear} Projection`}
      title="Measure Removal Scenarios"
      subtitle={`${report.contract.contractId} · Projected performance under CMS-announced retirements and the Clover-style recalculation`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
    >
      <ReportSection
        title="Predicted Rating by Scenario"
        note="Each scenario removes its measure set from every contract in the population, recomputes reward-factor thresholds, and re-scores the contract at the projected cut points."
      >
        <div className="fep-report-panel" style={{ padding: "16px 10px 6px" }}>
          <BarChart width={686} height={215} data={chartData} margin={{ top: 20, right: 16, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={REPORT_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="name"
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
            <Bar dataKey="rating" radius={[5, 5, 0, 0]} barSize={64} isAnimationActive={false}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={entry.id === "baseline" ? REPORT_COLORS.accent : REPORT_COLORS.accentSoft}
                />
              ))}
              <LabelList
                dataKey="rating"
                position="top"
                formatter={chartValueFormatter(1, "★", "n/a")}
                style={{ fontSize: 12, fontWeight: 800, fill: REPORT_COLORS.ink }}
              />
            </Bar>
          </BarChart>
        </div>
      </ReportSection>

      <ReportSection title="Scenario Detail" style={{ marginTop: 16 }}>
        <div className="fep-report-panel" style={{ padding: "12px 0 4px" }}>
          <table className="fep-report-table">
            <thead>
              <tr>
                <th className="l">Scenario</th>
                <th>Removed here</th>
                <th>Measures</th>
                <th>Base mean</th>
                <th>Reward factor</th>
                <th>CAI</th>
                <th>Final score</th>
                <th>Rating</th>
                <th>vs. all measures</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => {
                const leg = selectedLeg(scenario);
                const rating = scenario.score?.finalRating ?? null;
                const delta =
                  rating !== null && baselineRating !== null && scenario.id !== "baseline"
                    ? Math.round((rating - baselineRating) * 10) / 10
                    : null;
                return (
                  <tr key={scenario.id}>
                    <td className="l" style={{ fontWeight: 700, color: "var(--fep-ink)" }}>
                      {scenario.label}
                    </td>
                    <td>{scenario.removedContractCodes.length}</td>
                    <td>{leg?.measureCount ?? "—"}</td>
                    <td>{formatScore(leg?.baseMean)}</td>
                    <td>{formatSigned(leg?.rewardFactor ?? null, 1)}</td>
                    <td>{formatSigned(scenario.score?.caiValue ?? null, 6)}</td>
                    <td style={{ fontWeight: 700, color: "var(--fep-ink)" }}>
                      {formatScore(scenario.score?.finalScoreRaw)}
                    </td>
                    <td style={{ fontWeight: 800, color: "var(--fep-ink)" }}>
                      {rating === null ? "—" : `${formatStars(rating)}★`}
                    </td>
                    <td
                      style={{
                        fontWeight: 800,
                        color:
                          delta === null || delta === 0
                            ? "var(--fep-faint)"
                            : delta > 0
                              ? REPORT_COLORS.accent
                              : REPORT_COLORS.negative,
                      }}
                    >
                      {scenario.id === "baseline" ? "—" : formatSigned(delta, 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ReportSection>

      <ReportSection title="What Each Scenario Removes" style={{ marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {scenarios
            .filter((scenario) => scenario.id !== "baseline")
            .map((scenario) => (
              <div key={scenario.id} className="fep-report-panel" style={{ padding: "11px 14px" }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: "var(--fep-ink)" }}>
                  {scenario.label}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 9.5, lineHeight: 1.45, color: "var(--fep-muted)" }}>
                  {scenario.description}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 9.5, fontWeight: 700, color: "var(--fep-accent)" }}>
                  {scenario.removedContractCodes.length > 0
                    ? `Removed from this contract: ${scenario.removedContractCodes.join(", ")}`
                    : "No accrued measures for this contract are affected."}
                </p>
              </div>
            ))}
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 10 }}>
          The Clover-style recalc produces a Part C summary rating, so the uploaded Part C CAI
          applies instead of the Overall MA-PD CAI. QI hold-harmless is applied in every scenario:
          the final rating uses the higher of the with-QI and without-QI scores.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
