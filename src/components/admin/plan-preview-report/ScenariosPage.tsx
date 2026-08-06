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
import type {
  PlanPreviewContractReport,
  ReportScenario,
} from "@/lib/plan-preview/report-data";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  chartValueFormatter,
  formatScore,
  formatSigned,
  reportEyebrow,
} from "./report-shared";

const SCENARIO_SHORT_LABELS: Record<string, string> = {
  baseline: "All measures",
  officialRecalc: "S26 Recalc",
  s26NoQI: "No QI",
  s29Removal: "S29 Removal",
  model1: "Model 1",
  model2: "Model 2",
  removal2028: "2028 removals",
  removal2029: "2029 removals",
};

/** Keep in sync with PLAN_PREVIEW_CHART_SCENARIO_IDS in final-scores.ts. */
const CHART_IDS = new Set([
  "baseline",
  "s26NoQI",
  "officialRecalc",
  "s29Removal",
  "model1",
  "model2",
]);

function selectedLeg(scenario: ReportScenario) {
  const score = scenario.score;
  if (!score) return null;
  return score.selectedLeg === "with_qi" ? score.withQi : score.withoutQi;
}

function scoreDelta(
  scenario: ReportScenario,
  baselineScore: number | null,
): number | null {
  const raw = scenario.score?.finalScoreRaw ?? null;
  if (raw === null || baselineScore === null || scenario.id === "baseline") {
    return null;
  }
  return Math.round((raw - baselineScore) * 1000) / 1000;
}

function ImpactCallout({
  label,
  delta,
}: {
  label: string;
  delta: number | null;
}) {
  const reduced = delta !== null && delta < 0;
  const color =
    delta === null || delta === 0
      ? "var(--fep-muted)"
      : reduced
        ? REPORT_COLORS.negative
        : REPORT_COLORS.positive;
  const verb =
    delta === null
      ? "is unavailable"
      : delta === 0
        ? "yields no score change"
        : reduced
          ? `yields a score reduction of ${Math.abs(delta).toFixed(3)} points`
          : `yields a score increase of ${delta.toFixed(3)} points`;

  return (
    <div
      className="fep-report-panel"
      style={{
        flex: 1,
        padding: "10px 12px",
        borderLeft: `4px solid ${color}`,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 10.5,
          fontWeight: 800,
          color: "var(--fep-ink)",
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 11,
          fontWeight: 700,
          color,
          lineHeight: 1.35,
        }}
      >
        Removing these measures {verb}.
      </p>
    </div>
  );
}

export function ScenariosPage({
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
  const scenarios = report.scenarios;
  const chartScenarios = scenarios.filter((scenario) =>
    CHART_IDS.has(scenario.id),
  );
  const baselineScore =
    scenarios.find((s) => s.id === "baseline")?.score?.finalScoreRaw ?? null;
  const removal2028 = scenarios.find((s) => s.id === "removal2028");
  const removal2029 = scenarios.find((s) => s.id === "removal2029");

  const chartData = chartScenarios.map((scenario) => ({
    id: scenario.id,
    name: SCENARIO_SHORT_LABELS[scenario.id] ?? scenario.label,
    score: scenario.score?.finalScoreRaw ?? null,
  }));

  const scoreValues = chartData
    .map((row) => row.score)
    .filter((value): value is number => value !== null);
  const yMin = scoreValues.length
    ? Math.max(1, Math.floor(Math.min(...scoreValues) - 0.2))
    : 1;
  const yMax = scoreValues.length
    ? Math.min(5, Math.ceil(Math.max(...scoreValues) + 0.2))
    : 5;

  return (
    <ReportPageFrame
      pageRef={pageRef}
      eyebrow={reportEyebrow(report.starsYear, sample)}
      title="Measure Removal Scenarios"
      subtitle={`${report.contract.contractId} · Same scenario set as Clover Impact / Peer Analysis, scored on accrued plan preview stars`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      sample={sample}
    >
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <ImpactCallout
          label="Stars 2028 removals"
          delta={
            removal2028 ? scoreDelta(removal2028, baselineScore) : null
          }
        />
        <ImpactCallout
          label="Stars 2029 removals"
          delta={
            removal2029 ? scoreDelta(removal2029, baselineScore) : null
          }
        />
      </div>

      <ReportSection
        title="Predicted score by scenario"
        note="Each scenario removes its measure set, recomputes reward factor thresholds, and re-scores at the projected cut points. Bar labels show unrounded final scores."
        style={{ marginTop: 12 }}
      >
        <div className="fep-report-panel" style={{ padding: "10px 10px 2px" }}>
          <BarChart
            width={686}
            height={160}
            data={chartData}
            margin={{ top: 18, right: 16, left: -18, bottom: 0 }}
          >
            <CartesianGrid stroke={REPORT_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{
                fontSize: 10,
                fontWeight: 700,
                fill: REPORT_COLORS.ink,
              }}
              axisLine={{ stroke: REPORT_COLORS.grid }}
              tickLine={false}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 10, fill: REPORT_COLORS.muted }}
              axisLine={false}
              tickLine={false}
            />
            <Bar
              dataKey="score"
              radius={[5, 5, 0, 0]}
              barSize={56}
              isAnimationActive={false}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={
                    entry.id === "baseline"
                      ? REPORT_COLORS.accent
                      : REPORT_COLORS.accentSoft
                  }
                />
              ))}
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

      <ReportSection title="Scenario Detail" style={{ marginTop: 10 }}>
        <div className="fep-report-panel" style={{ padding: "6px 0 2px" }}>
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
                <th>vs. all measures</th>
              </tr>
            </thead>
            <tbody>
              {chartScenarios.map((scenario) => {
                const leg = selectedLeg(scenario);
                const delta = scoreDelta(scenario, baselineScore);
                return (
                  <tr key={scenario.id}>
                    <td
                      className="l"
                      style={{ fontWeight: 700, color: "var(--fep-ink)" }}
                    >
                      {SCENARIO_SHORT_LABELS[scenario.id] ?? scenario.label}
                    </td>
                    <td>{scenario.removedContractCodes.length}</td>
                    <td>{leg?.measureCount ?? "—"}</td>
                    <td>{formatScore(leg?.baseMean)}</td>
                    <td>{formatSigned(leg?.rewardFactor ?? null, 1)}</td>
                    <td>{formatSigned(scenario.score?.caiValue ?? null, 6)}</td>
                    <td style={{ fontWeight: 700, color: "var(--fep-ink)" }}>
                      {formatScore(scenario.score?.finalScoreRaw)}
                    </td>
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
                      {scenario.id === "baseline"
                        ? "—"
                        : formatSigned(delta, 3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ReportSection>

      <ReportSection
        title="What Each Scenario Removes"
        style={{ marginTop: 10 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
          }}
        >
          {chartScenarios
            .filter((scenario) => scenario.id !== "baseline")
            .map((scenario) => (
              <div
                key={scenario.id}
                className="fep-report-panel"
                style={{ padding: "7px 9px" }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 10,
                    fontWeight: 800,
                    color: "var(--fep-ink)",
                  }}
                >
                  {SCENARIO_SHORT_LABELS[scenario.id] ?? scenario.label}
                </p>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 8,
                    lineHeight: 1.3,
                    color: "var(--fep-muted)",
                  }}
                >
                  {scenario.description}
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 8,
                    fontWeight: 700,
                    color: "var(--fep-accent)",
                  }}
                >
                  {scenario.removedContractCodes.length > 0
                    ? `Removed here: ${formatMeasureAcronyms(scenario.removedContractCodes)}`
                    : "No accrued measures affected."}
                </p>
              </div>
            ))}
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 6 }}>
          Official Recalc uses Part C CAI (Part C summary). QI is excluded from
          every scenario on this page — it is not scored in plan preview 1. Stars
          2028 / 2029 impact boxes use the CMS-announced retirement sets.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
