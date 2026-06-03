"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CloverContractImpact, CloverImpactResult, CloverScenarioDetail } from "@/lib/clover-impact/analysis";
import type { CloverChartScoreId, CloverComputedScenarioId } from "@/lib/clover-impact/scenarios";

type Props = {
  contract: CloverContractImpact;
  chartScores: CloverImpactResult["chartScores"];
};

type ChartDatum = {
  id: CloverChartScoreId;
  label: string;
  value: number;
  color: string;
  source: "official" | "computed";
  totalEnrollment: number | null;
  baseMean: number | null;
  rewardFactor: number | null;
  caiValue: number | null;
};

const COMPUTED_SCENARIO_IDS = new Set<CloverChartScoreId>(["s26NoQI", "s29Removal", "model1", "model2"]);

function formatScore(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function formatScoreWithStar(value: number): string {
  return `${value.toFixed(2)} / ${(Math.round(value * 2) / 2).toFixed(1)}★`;
}

function formatEnrollment(value: number | null): string {
  return value === null ? "Enrollment unavailable" : `${value.toLocaleString()} members`;
}

function formatContribution(value: number | null): string {
  if (value === null) return "-";
  if (Math.abs(value) < 0.005) return "0.00";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function getScoreDetail(contract: CloverContractImpact, scoreId: CloverChartScoreId): CloverScenarioDetail | null {
  if (scoreId === "s26WithQI") return contract.calculated2026Detail;
  if (COMPUTED_SCENARIO_IDS.has(scoreId)) {
    return contract.scenarioDetails[scoreId as CloverComputedScenarioId] ?? null;
  }
  return null;
}

export function CloverScenarioChart({ contract, chartScores }: Props) {
  const chartData: ChartDatum[] = chartScores
    .map((score) => {
      const detail = getScoreDetail(contract, score.id);
      return {
        ...score,
        value: contract.scores[score.id],
        totalEnrollment: contract.totalEnrollment,
        baseMean: detail?.baseMean ?? null,
        rewardFactor: detail?.rewardFactor ?? null,
        caiValue: detail?.caiValue ?? null,
      };
    })
    .filter((score): score is ChartDatum => score.value !== null);
  const rewardFactorEntries = chartData.filter((entry) => (entry.rewardFactor ?? 0) > 0);

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Historical and Scenario Overall Stars Scores</h3>
          <p className="text-xs text-muted-foreground">
            {contract.contractId} - {contract.organizationMarketingName || contract.contractName || "Unknown contract"}
          </p>
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground md:text-right">
          <span>
            Official 2026: <span className="font-mono text-foreground">{formatScore(contract.officialScores.stars2026)}</span>
          </span>
          <span>
            Enrollment: <span className="font-mono text-foreground">{formatEnrollment(contract.totalEnrollment)}</span>
          </span>
        </div>
      </div>

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
                      Score / Rounded Star: <span className="font-mono text-foreground">{formatScoreWithStar(entry.value)}</span>
                    </p>
                    {entry.baseMean !== null ? (
                      <p className="mt-1 text-muted-foreground">
                        Base Mean: <span className="font-mono text-foreground">{entry.baseMean.toFixed(2)}</span>
                      </p>
                    ) : null}
                    {entry.rewardFactor !== null ? (
                      <p className="mt-1 text-muted-foreground">
                        Reward Factor: <span className="font-mono text-foreground">{formatContribution(entry.rewardFactor)}</span>
                      </p>
                    ) : null}
                    {entry.caiValue !== null ? (
                      <p className="mt-1 text-muted-foreground">
                        CAI: <span className="font-mono text-foreground">{formatContribution(entry.caiValue)}</span>
                      </p>
                    ) : null}
                    <p className="mt-1 text-muted-foreground">
                      Enrollment: <span className="font-mono text-foreground">{formatEnrollment(entry.totalEnrollment)}</span>
                    </p>
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
            <Bar dataKey="value" name="Overall Score" radius={[6, 6, 0, 0]}>
              <LabelList
                dataKey="value"
                position="top"
                formatter={(value) => (typeof value === "number" ? formatScoreWithStar(value) : "")}
                fill="var(--color-foreground)"
                fontSize={11}
                fontWeight={600}
              />
              {chartData.map((entry) => (
                <Cell key={entry.id} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        {rewardFactorEntries.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <span className="font-semibold text-foreground">Reward factor applied:</span>
            {rewardFactorEntries.map((entry) => (
              <span key={entry.id} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                {entry.label} <span className="font-mono text-foreground">{formatContribution(entry.rewardFactor)}</span>
              </span>
            ))}
          </div>
        ) : (
          <span>No reward factor applied to the calculated bars for this contract.</span>
        )}
      </div>

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
