"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CloverContractImpact, CloverImpactResult, CloverScenarioDetail } from "@/lib/clover-impact/analysis";
import type { CloverChartScoreId, CloverComputedScenarioId } from "@/lib/clover-impact/scenarios";

export type CloverParentWeightMode = "equal" | "enrollment";

type Props = {
  parentOrganization: string;
  contracts: CloverContractImpact[];
  chartScores: CloverImpactResult["chartScores"];
  enrollmentSource?: CloverImpactResult["enrollmentSource"];
  weightMode: CloverParentWeightMode;
  onWeightModeChange: (mode: CloverParentWeightMode) => void;
};

type ChartDatum = {
  id: CloverChartScoreId;
  label: string;
  value: number;
  color: string;
  source: "official" | "computed";
  totalEnrollment: number | null;
  weightedContractCount: number;
  baseMean: number | null;
  rewardFactor: number | null;
  caiValue: number | null;
  rewardFactorContractCount: number;
  scoredContractCount: number;
  qbpChange: number | null;
  qbpLabel: string;
  qbpGainCount: number;
  qbpLossCount: number;
  qbpGainers: QbpMovementContract[];
  qbpLosers: QbpMovementContract[];
};

type QbpMovementContract = {
  contractId: string;
  enrollment: number | null;
};

const COMPUTED_SCENARIO_IDS = new Set<CloverChartScoreId>(["s26NoQI", "s29Removal", "model1", "model2"]);
const QBP_SCENARIO_IDS = new Set<CloverChartScoreId>(["s29Removal", "model1", "model2"]);
const ESTIMATED_BENCHMARK_PMPM = 1200;
const QUALITY_BONUS_RATE = 0.05;
const ESTIMATED_ANNUAL_QBP_PER_MEMBER = ESTIMATED_BENCHMARK_PMPM * 12 * QUALITY_BONUS_RATE;

function formatScore(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function formatScoreWithStar(value: number): string {
  return `${value.toFixed(2)} / ${(Math.round(value * 2) / 2).toFixed(1)}★`;
}

function formatEnrollment(value: number): string {
  return value.toLocaleString();
}

function formatEnrollmentLabel(value: number | null): string {
  return value === null || value <= 0 ? "Enrollment unavailable" : `${formatEnrollment(value)} members`;
}

function formatContribution(value: number | null): string {
  if (value === null) return "-";
  if (Math.abs(value) < 0.005) return "0.00";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatCurrency(value: number): string {
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1_000_000) return `${sign}$${(absoluteValue / 1_000_000).toFixed(1)}M`;
  if (absoluteValue >= 1_000) return `${sign}$${(absoluteValue / 1_000).toFixed(0)}K`;
  return `${sign}$${absoluteValue.toLocaleString()}`;
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function weightedAverage(items: Array<{ value: number | null; weight: number | null }>): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    if (item.value === null || item.weight === null || item.weight <= 0) continue;
    weightedSum += item.value * item.weight;
    totalWeight += item.weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function getScoreDetail(contract: CloverContractImpact, scoreId: CloverChartScoreId): CloverScenarioDetail | null {
  if (scoreId === "s26WithQI") return contract.calculated2026Detail;
  if (COMPUTED_SCENARIO_IDS.has(scoreId)) {
    return contract.scenarioDetails[scoreId as CloverComputedScenarioId] ?? null;
  }
  return null;
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function getContractQbpChange(contract: CloverContractImpact, scoreId: CloverChartScoreId): number | null {
  if (!QBP_SCENARIO_IDS.has(scoreId)) return null;

  const score = contract.scores[scoreId];
  if (score === null) return null;

  const officialEligible = (contract.officialScores.stars2026 ?? 0) >= 4;
  const scenarioEligible = roundToHalf(score) >= 4;
  if (officialEligible === scenarioEligible) return 0;

  return (scenarioEligible ? 1 : -1) * (contract.totalEnrollment ?? 0) * ESTIMATED_ANNUAL_QBP_PER_MEMBER;
}

function formatContractList(contracts: QbpMovementContract[]): string {
  if (contracts.length === 0) return "none";
  const visible = contracts.slice(0, 5).map((contract) => {
    const enrollment = contract.enrollment === null ? "enrollment unavailable" : `${contract.enrollment.toLocaleString()} members`;
    return `${contract.contractId} (${enrollment})`;
  });
  const remaining = contracts.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} +${remaining} more` : visible.join(", ");
}

export function CloverParentOrgChart({ parentOrganization, contracts, chartScores, enrollmentSource, weightMode, onWeightModeChange }: Props) {
  const parentContracts = useMemo(
    () => contracts.filter((contract) => (contract.parentOrganization?.trim() || "Unknown") === parentOrganization),
    [contracts, parentOrganization],
  );
  const enrollmentContracts = parentContracts.filter((contract) => (contract.totalEnrollment ?? 0) > 0);
  const totalEnrollment = enrollmentContracts.reduce((sum, contract) => sum + (contract.totalEnrollment ?? 0), 0);

  const chartData: ChartDatum[] = chartScores
    .map((score) => {
      const value = weightMode === "equal"
        ? average(parentContracts.map((contract) => contract.scores[score.id]))
        : weightedAverage(parentContracts.map((contract) => ({
            value: contract.scores[score.id],
            weight: contract.totalEnrollment,
          })));
      const baseMean = weightMode === "equal"
        ? average(parentContracts.map((contract) => getScoreDetail(contract, score.id)?.baseMean ?? null))
        : weightedAverage(parentContracts.map((contract) => ({
            value: getScoreDetail(contract, score.id)?.baseMean ?? null,
            weight: contract.totalEnrollment,
          })));
      const rewardFactor = weightMode === "equal"
        ? average(parentContracts.map((contract) => getScoreDetail(contract, score.id)?.rewardFactor ?? null))
        : weightedAverage(parentContracts.map((contract) => ({
            value: getScoreDetail(contract, score.id)?.rewardFactor ?? null,
            weight: contract.totalEnrollment,
          })));
      const caiValue = weightMode === "equal"
        ? average(parentContracts.map((contract) => getScoreDetail(contract, score.id)?.caiValue ?? null))
        : weightedAverage(parentContracts.map((contract) => ({
            value: getScoreDetail(contract, score.id)?.caiValue ?? null,
            weight: contract.totalEnrollment,
          })));
      const scoredContractCount = parentContracts.filter((contract) => contract.scores[score.id] !== null).length;
      const rewardFactorContractCount = parentContracts.filter((contract) => (getScoreDetail(contract, score.id)?.rewardFactor ?? 0) > 0).length;
      const qbpChanges = parentContracts
        .map((contract) => getContractQbpChange(contract, score.id))
        .filter((change): change is number => change !== null);
      const qbpChange = qbpChanges.length > 0 ? qbpChanges.reduce((sum, change) => sum + change, 0) : null;
      const qbpChangedContracts = parentContracts
        .map((contract) => ({
          contractId: contract.contractId,
          enrollment: contract.totalEnrollment,
          change: getContractQbpChange(contract, score.id),
        }))
        .filter((contract): contract is QbpMovementContract & { change: number } => contract.change !== null && contract.change !== 0)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
      const qbpGainers = qbpChangedContracts
        .filter((contract) => contract.change > 0)
        .map(({ contractId, enrollment }) => ({ contractId, enrollment }));
      const qbpLosers = qbpChangedContracts
        .filter((contract) => contract.change < 0)
        .map(({ contractId, enrollment }) => ({ contractId, enrollment }));

      return {
        ...score,
        value,
        totalEnrollment: totalEnrollment > 0 ? totalEnrollment : null,
        weightedContractCount: enrollmentContracts.length,
        baseMean,
        rewardFactor,
        caiValue,
        rewardFactorContractCount,
        scoredContractCount,
        qbpChange,
        qbpLabel: qbpChange !== null && qbpChange !== 0 ? formatCurrency(qbpChange) : "",
        qbpGainCount: qbpGainers.length,
        qbpLossCount: qbpLosers.length,
        qbpGainers,
        qbpLosers,
      };
    })
    .filter((score): score is ChartDatum => score.value !== null);
  const rewardFactorEntries = chartData.filter((entry) => (entry.rewardFactor ?? 0) > 0);
  const model1Entry = chartData.find((entry) => entry.id === "model1");
  const model2Entry = chartData.find((entry) => entry.id === "model2");
  const qbpExplainer = model1Entry && model2Entry && model1Entry.qbpChange !== null && model2Entry.qbpChange !== null
    ? {
        model1: model1Entry,
        model2: model2Entry,
        model1Qbp: model1Entry.qbpChange,
        model2Qbp: model2Entry.qbpChange,
      }
    : null;

  const official2026 = weightMode === "equal"
    ? average(parentContracts.map((contract) => contract.officialScores.stars2026))
    : weightedAverage(parentContracts.map((contract) => ({
        value: contract.officialScores.stars2026,
        weight: contract.totalEnrollment,
      })));

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Parent Organization Scenario Scores</h3>
          <p className="text-xs text-muted-foreground">
            {parentOrganization} - {parentContracts.length} contracts, {formatEnrollmentLabel(totalEnrollment)}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground">
            Official 2026: <span className="font-mono text-foreground">{formatScore(official2026)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-1">
            <button
              type="button"
              onClick={() => onWeightModeChange("equal")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                weightMode === "equal"
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Treat each contract under the parent organization equally."
            >
              Equal Contracts
            </button>
            <button
              type="button"
              onClick={() => onWeightModeChange("enrollment")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                weightMode === "enrollment"
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title={`Weight each contract by total enrollment${enrollmentSource ? ` from ${enrollmentSource.fileName}` : ""}.`}
            >
              Enrollment Weighted
            </button>
          </div>
        </div>
      </div>

      {weightMode === "enrollment" && enrollmentContracts.length === 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          No positive enrollment values were found for this parent organization
          {enrollmentSource ? ` in ${enrollmentSource.fileName}` : ""}.
        </div>
      ) : (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 16, bottom: 32, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="label"
                interval={0}
                angle={-12}
                textAnchor="end"
                tick={{ fontSize: 11 }}
                stroke="var(--color-muted-foreground)"
              />
              <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
              <Tooltip
                content={({ payload, label }) => {
                  if (!payload?.length) return null;
                  const entry = payload[0]?.payload as ChartDatum | undefined;
                  if (!entry) return null;

                  return (
                    <div className="rounded-xl border border-border bg-card p-3 text-xs shadow-lg">
                      <p className="font-semibold text-foreground">{String(label)}</p>
                      <p className="mt-2 text-muted-foreground">
                        {weightMode === "equal" ? "Equal Avg / Rounded Star" : "Enrollment Weighted Avg / Rounded Star"}:{" "}
                        <span className="font-mono text-foreground">{formatScoreWithStar(entry.value)}</span>
                      </p>
                      {entry.baseMean !== null ? (
                        <p className="mt-1 text-muted-foreground">
                          Avg Base Mean: <span className="font-mono text-foreground">{entry.baseMean.toFixed(2)}</span>
                        </p>
                      ) : null}
                      {entry.rewardFactor !== null ? (
                        <p className="mt-1 text-muted-foreground">
                          Avg Reward Factor: <span className="font-mono text-foreground">{formatContribution(entry.rewardFactor)}</span>
                        </p>
                      ) : null}
                      {entry.rewardFactor !== null ? (
                        <p className="mt-1 text-muted-foreground">
                          RF Contracts:{" "}
                          <span className="font-mono text-foreground">
                            {entry.rewardFactorContractCount} of {entry.scoredContractCount}
                          </span>
                        </p>
                      ) : null}
                      {entry.caiValue !== null ? (
                        <p className="mt-1 text-muted-foreground">
                          Avg CAI: <span className="font-mono text-foreground">{formatContribution(entry.caiValue)}</span>
                        </p>
                      ) : null}
                      <p className="mt-1 text-muted-foreground">
                        Parent Enrollment:{" "}
                        <span className="font-mono text-foreground">{formatEnrollmentLabel(entry.totalEnrollment)}</span>
                      </p>
                      {entry.qbpChange !== null ? (
                        <p className="mt-1 text-muted-foreground">
                          Est. Parent QBP Swing: <span className="font-mono text-foreground">{formatCurrency(entry.qbpChange)}</span>
                        </p>
                      ) : null}
                      {entry.qbpChange !== null && (entry.qbpGainCount > 0 || entry.qbpLossCount > 0) ? (
                        <p className="mt-1 text-muted-foreground">
                          QBP G/L:{" "}
                          <span className="font-mono text-foreground">
                            {entry.qbpGainCount} / {entry.qbpLossCount}
                          </span>
                        </p>
                      ) : null}
                      {weightMode === "enrollment" ? (
                        <p className="mt-1 text-muted-foreground">
                          Weighted Contracts: <span className="font-mono text-foreground">{entry.weightedContractCount}</span>
                        </p>
                      ) : null}
                    </div>
                  );
                }}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "12px",
                  fontSize: "13px",
                }}
              />
              <Bar dataKey="value" name="Parent Score" radius={[6, 6, 0, 0]}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(value) => (typeof value === "number" ? formatScoreWithStar(value) : "")}
                  fill="var(--color-foreground)"
                  fontSize={11}
                  fontWeight={600}
                />
                <LabelList
                  dataKey="qbpLabel"
                  position="insideTop"
                  fill="var(--color-background)"
                  fontSize={10}
                  fontWeight={700}
                />
                {chartData.map((entry) => (
                  <Cell key={entry.id} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        {rewardFactorEntries.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <span className="font-semibold text-foreground">Avg reward factor applied:</span>
            {rewardFactorEntries.map((entry) => (
              <span key={entry.id} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                {entry.label}{" "}
                <span className="font-mono text-foreground">{formatContribution(entry.rewardFactor)}</span>
                <span>
                  ({entry.rewardFactorContractCount} of {entry.scoredContractCount} contracts)
                </span>
              </span>
            ))}
          </div>
        ) : (
          <span>No reward factor applied to the calculated bars for this parent view.</span>
        )}
      </div>

      {qbpExplainer ? (
        <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-[11px] text-muted-foreground">
          <span className="font-semibold text-sky-300">QBP note:</span>{" "}
          For {parentOrganization}, Model 1 has an estimated net QBP swing of{" "}
          <span className={qbpExplainer.model1Qbp >= 0 ? "font-mono text-emerald-400" : "font-mono text-rose-400"}>
            {formatCurrency(qbpExplainer.model1Qbp)}
          </span>{" "}
          ({qbpExplainer.model1.qbpGainCount} gain / {qbpExplainer.model1.qbpLossCount} lose), while Model 2 has an estimated net QBP swing of{" "}
          <span className={qbpExplainer.model2Qbp >= 0 ? "font-mono text-emerald-400" : "font-mono text-rose-400"}>
            {formatCurrency(qbpExplainer.model2Qbp)}
          </span>{" "}
          ({qbpExplainer.model2.qbpGainCount} gain / {qbpExplainer.model2.qbpLossCount} lose). The difference comes from which individual
          contracts round above or below the 4.0 quality-bonus eligibility line under each measure-removal model.
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card/40 p-2">
              <p className="font-semibold text-foreground">Model 1 movement</p>
              <p className="mt-1">
                <span className="text-emerald-400">Gain:</span>{" "}
                <span className="font-mono text-foreground">{formatContractList(qbpExplainer.model1.qbpGainers)}</span>
              </p>
              <p className="mt-1">
                <span className="text-rose-400">Loss:</span>{" "}
                <span className="font-mono text-foreground">{formatContractList(qbpExplainer.model1.qbpLosers)}</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card/40 p-2">
              <p className="font-semibold text-foreground">Model 2 movement</p>
              <p className="mt-1">
                <span className="text-emerald-400">Gain:</span>{" "}
                <span className="font-mono text-foreground">{formatContractList(qbpExplainer.model2.qbpGainers)}</span>
              </p>
              <p className="mt-1">
                <span className="text-rose-400">Loss:</span>{" "}
                <span className="font-mono text-foreground">{formatContractList(qbpExplainer.model2.qbpLosers)}</span>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {chartData.map((entry) => (
          <span key={entry.id} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
    </section>
  );
}
