"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Loader2, TrendingUp, ArrowUp, ArrowDown, Minus } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

type ThresholdRow = {
  year: number;
  percentile: number;
  metric: "mean" | "variance";
  withQI: number;
  withoutQI: number;
  diff: number;
};

type YoYDelta = {
  fromYear: number;
  toYear: number;
  withQIDelta: number;
  withoutQIDelta: number;
  sameDirection: boolean;
};

type ThresholdSummary = {
  key: string;
  label: string;
  rows: ThresholdRow[];
  yoyDeltas: YoYDelta[];
  avgOffset: number;
  directionalAlignment: string;
};

type CorrelationResponse = {
  years: number[];
  summaries: ThresholdSummary[];
};

const THRESHOLD_OPTIONS = [
  { key: "mean65th", label: "Mean 65th Percentile" },
  { key: "mean85th", label: "Mean 85th Percentile" },
  { key: "variance30th", label: "Variance 30th Percentile" },
  { key: "variance70th", label: "Variance 70th Percentile" },
];

function fmt(n: number, digits = 6) {
  return n.toFixed(digits);
}

function DirectionIcon({ value }: { value: number }) {
  if (value > 0.0001) return <ArrowUp className="inline h-3.5 w-3.5 text-emerald-500" />;
  if (value < -0.0001) return <ArrowDown className="inline h-3.5 w-3.5 text-red-500" />;
  return <Minus className="inline h-3.5 w-3.5 text-muted-foreground" />;
}

export function RewardFactorQICorrelation() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [selectedKey, setSelectedKey] = useState("mean65th");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/analysis/reward-factor-qi-correlation");
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.details || err.error || "Request failed");
        }
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeSummary = useMemo(
    () => data?.summaries.find((s) => s.key === selectedKey) ?? null,
    [data, selectedKey],
  );

  const chartData = useMemo(() => {
    if (!activeSummary) return [];
    return activeSummary.rows.map((r) => ({
      year: String(r.year),
      "With QI": r.withQI,
      "Without QI": r.withoutQI,
    }));
  }, [activeSummary]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 5];
    const allVals = chartData.flatMap((d) => [d["With QI"], d["Without QI"]]);
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const padding = (max - min) * 0.3 || 0.1;
    return [Math.floor((min - padding) * 100) / 100, Math.ceil((max + padding) * 100) / 100];
  }, [chartData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!data || !activeSummary) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          <div>
            <h3 className="text-sm font-semibold">QI Threshold Correlation (Overall Rating)</h3>
            <p className="text-xs text-muted-foreground">
              How with-QI and without-QI official thresholds track each other across years
            </p>
          </div>
        </div>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          {THRESHOLD_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="p-5">
        {/* Chart */}
        <div className="mb-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border)" }}
                formatter={(value: number) => value.toFixed(6)}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="With QI"
                stroke="hsl(220, 70%, 55%)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="Without QI"
                stroke="hsl(280, 60%, 55%)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Summary table */}
        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            Year-over-Year Comparison — {activeSummary.label}
          </h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Year</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">With QI</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Without QI</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Offset</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">YoY With QI</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">YoY Without QI</th>
                <th className="px-3 py-2 text-center font-medium text-muted-foreground">Same Direction?</th>
              </tr>
            </thead>
            <tbody>
              {activeSummary.rows.map((row, i) => {
                const delta = activeSummary.yoyDeltas[i - 1];
                return (
                  <tr key={row.year} className="border-t border-border/50">
                    <td className="px-3 py-1.5 font-semibold">{row.year}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmt(row.withQI)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmt(row.withoutQI)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {row.diff >= 0 ? "+" : ""}{fmt(row.diff)}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono">
                      {delta ? (
                        <span className="inline-flex items-center gap-0.5">
                          <DirectionIcon value={delta.withQIDelta} />
                          {delta.withQIDelta >= 0 ? "+" : ""}{delta.withQIDelta.toFixed(4)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono">
                      {delta ? (
                        <span className="inline-flex items-center gap-0.5">
                          <DirectionIcon value={delta.withoutQIDelta} />
                          {delta.withoutQIDelta >= 0 ? "+" : ""}{delta.withoutQIDelta.toFixed(4)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {delta ? (
                        delta.sameDirection
                          ? <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-emerald-500">Yes</span>
                          : <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-red-500">No</span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                <td className="px-3 py-1.5">Average</td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right font-mono">
                  {activeSummary.avgOffset >= 0 ? "+" : ""}{fmt(activeSummary.avgOffset)}
                </td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-center text-[0.6rem] text-muted-foreground">
                  {activeSummary.directionalAlignment} aligned
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Cross-threshold summary */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            Summary Across All Thresholds
          </h4>
          <div className="grid grid-cols-4 gap-3">
            {data.summaries.map((s) => (
              <div
                key={s.key}
                className={`rounded-lg border p-3 ${s.key === selectedKey ? "border-blue-500/50 bg-blue-500/5" : "border-border"}`}
              >
                <p className="text-[0.65rem] text-muted-foreground">{s.label}</p>
                <p className="mt-1 font-mono text-sm font-semibold">
                  {s.avgOffset >= 0 ? "+" : ""}{s.avgOffset.toFixed(4)}
                </p>
                <p className="text-[0.6rem] text-muted-foreground">
                  avg offset &middot; {s.directionalAlignment} directional
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
