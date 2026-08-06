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

import { formatMeasureAcronyms } from "@/lib/plan-preview/measure-acronyms";
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
        note="Each scenario removes its measure set, recomputes reward-factor thresholds, and re-scores at the projected cut points."
      >
        <div className="fep-report-panel" style={{ padding: "10px 10px 2px" }}>
          <BarChart width={686} height={175} data={chartData} margin={{ top: 18, right: 16, left: -18, bottom: 0 }}>
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

      <ReportSection title="Scenario Detail" style={{ marginTop: 12 }}>
        <div className="fep-report-panel" style={{ padding: "8px 0 4px" }}>
          <table className="fep-report-table compact">
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

      <ReportSection title="What Each Scenario Removes" style={{ marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {scenarios
            .filter((scenario) => scenario.id !== "baseline")
            .map((scenario) => (
              <div key={scenario.id} className="fep-report-panel" style={{ padding: "8px 10px" }}>
                <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: "var(--fep-ink)" }}>
                  {scenario.label}
                </p>
                <p style={{ margin: "3px 0 0", fontSize: 8.5, lineHeight: 1.35, color: "var(--fep-muted)" }}>
                  {scenario.description}
                </p>
                <p style={{ margin: "5px 0 0", fontSize: 8.5, fontWeight: 700, color: "var(--fep-accent)" }}>
                  {scenario.removedContractCodes.length > 0
                    ? `Removed here: ${formatMeasureAcronyms(scenario.removedContractCodes)}`
                    : "No accrued measures affected."}
                </p>
              </div>
            ))}
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 6 }}>
          Clover-style recalc uses Part C CAI (Part C summary). QI is excluded from every scenario —
          it is not scored in plan preview 1.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
