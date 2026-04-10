"use client";

import React, { useState, useCallback } from "react";
import { Loader2, FlaskConical, CheckCircle2, XCircle } from "lucide-react";

type PercentileThresholds = {
  mean65th: number;
  mean85th: number;
  variance30th: number;
  variance70th: number;
};

type ThresholdSet = {
  label: string;
  computed: PercentileThresholds;
  official: PercentileThresholds | null;
  differences: Record<string, number> | null;
  percentDifferences: Record<string, number> | null;
  contractCount: number;
};

type RatingResult = {
  ratingType: string;
  ratingLabel: string;
  withoutQI: ThresholdSet;
  withQI: ThresholdSet;
  rFactorDistribution: Record<number, number>;
  totalContracts: number;
};

type BacktestResponse = {
  year: number;
  ratingResults: RatingResult[];
  populationSize: number;
  hasOfficialThresholds: boolean;
};

function fmt(n: number, digits = 6) { return n.toFixed(digits); }

function AccuracyBadge({ pctDiff }: { pctDiff: number }) {
  const abs = Math.abs(pctDiff);
  if (abs < 1) return <span className="inline-flex items-center gap-0.5 text-emerald-500"><CheckCircle2 className="h-3 w-3" />&lt;1%</span>;
  if (abs < 3) return <span className="text-amber-500">{abs.toFixed(1)}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-red-500"><XCircle className="h-3 w-3" />{abs.toFixed(1)}%</span>;
}

export function RewardFactorBacktest() {
  const [year, setYear] = useState(2026);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BacktestResponse | null>(null);

  const runBacktest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/reward-factor-backtest?year=${year}`);
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
  }, [year]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-5 w-5 text-violet-500" />
          <div>
            <h3 className="text-sm font-semibold">Backtest: Threshold Accuracy</h3>
            <p className="text-xs text-muted-foreground">
              Compute thresholds from actual CMS published measure stars and compare against official tech notes values
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {[2026, 2025, 2024, 2023].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            type="button"
            onClick={runBacktest}
            disabled={loading}
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run Backtest"}
          </button>
        </div>
      </div>

      {error && <p className="px-5 py-3 text-sm text-red-500">{error}</p>}

      {data && (
        <div className="p-5">
          <p className="mb-4 text-xs text-muted-foreground">
            Year: {data.year} | Population: {data.populationSize} contracts
          </p>

          <div className="flex flex-col gap-6">
            {data.ratingResults.map((rr) => (
              <div key={rr.ratingType} className="rounded-lg border border-border">
                <div className="border-b border-border bg-muted/30 px-4 py-2">
                  <h4 className="text-sm font-semibold">{rr.ratingLabel}</h4>
                  <p className="text-xs text-muted-foreground">{rr.totalContracts} contracts</p>
                </div>

                <div className="grid grid-cols-2 gap-4 p-4">
                  <ThresholdComparisonTable set={rr.withQI} />
                  <ThresholdComparisonTable set={rr.withoutQI} />
                </div>

                <div className="border-t border-border px-4 py-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">r-Factor Distribution (With QI)</p>
                  <div className="flex gap-4">
                    {[0, 0.1, 0.2, 0.3, 0.4].map((rf) => (
                      <div key={rf} className="text-xs">
                        <span className="font-semibold">{rf.toFixed(1)}</span>:{" "}
                        <span className="text-muted-foreground">{rr.rFactorDistribution[rf] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThresholdComparisonTable({ set }: { set: ThresholdSet }) {
  const hasOfficial = set.official !== null;
  const keys = ["mean65th", "mean85th", "variance30th", "variance70th"] as const;
  const labels: Record<string, string> = {
    mean65th: "Mean P65",
    mean85th: "Mean P85",
    variance30th: "Var P30",
    variance70th: "Var P70",
  };

  return (
    <div>
      <p className="mb-2 text-xs font-semibold">{set.label} ({set.contractCount} contracts)</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-1 text-left text-muted-foreground">Threshold</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Computed</th>
            {hasOfficial && <th className="px-2 py-1 text-right text-muted-foreground">Official</th>}
            {hasOfficial && <th className="px-2 py-1 text-right text-muted-foreground">Diff</th>}
            {hasOfficial && <th className="px-2 py-1 text-right text-muted-foreground">Accuracy</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-border/50">
              <td className="px-2 py-1 font-medium">{labels[k]}</td>
              <td className="px-2 py-1 text-right font-mono">{fmt(set.computed[k])}</td>
              {hasOfficial && <td className="px-2 py-1 text-right font-mono">{fmt(set.official![k])}</td>}
              {hasOfficial && set.differences && (
                <td className={`px-2 py-1 text-right font-mono ${Math.abs(set.differences[k]) < 0.01 ? "text-emerald-500" : Math.abs(set.differences[k]) < 0.05 ? "text-amber-500" : "text-red-500"}`}>
                  {set.differences[k] >= 0 ? "+" : ""}{fmt(set.differences[k])}
                </td>
              )}
              {hasOfficial && set.percentDifferences && (
                <td className="px-2 py-1 text-right"><AccuracyBadge pctDiff={set.percentDifferences[k]} /></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!hasOfficial && (
        <p className="mt-2 text-[0.6rem] text-muted-foreground italic">
          No official thresholds available for this year. Add previous years&apos; tech notes data to compare.
        </p>
      )}
    </div>
  );
}
