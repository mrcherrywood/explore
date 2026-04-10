"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Search, ChevronDown, ChevronUp, CheckCircle2, XCircle } from "lucide-react";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";

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

type ContractRow = {
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  weightedMean: number;
  weightedVariance: number;
  measureCount: number;
  meanCategory: string;
  varianceCategory: string;
  rFactor: number;
};

type OverviewResponse = {
  year: number;
  ratingType: string;
  ratingLabel: string;
  thresholdsWithQI: ThresholdSet;
  thresholdsWithoutQI: ThresholdSet;
  contracts: ContractRow[];
  rFactorDistribution: Record<number, number>;
  populationSize: number;
};

function fmt(n: number, digits = 6) { return n.toFixed(digits); }

export function RewardFactorOverview() {
  const [year, setYear] = useState(2026);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<keyof ContractRow>("rFactor");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analysis/reward-factor?year=${year}&ratingType=overall_mapd`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.details || err.error || "Request failed");
        }
        return res.json();
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year]);

  const filteredContracts = useMemo(() => {
    if (!data) return [];
    let list = data.contracts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.contractId.toLowerCase().includes(q) ||
        c.contractName?.toLowerCase().includes(q) ||
        c.parentOrganization?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "desc" ? bVal - aVal : aVal - bVal;
      }
      return sortDir === "desc"
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });
  }, [data, search, sortCol, sortDir]);

  const handleSort = (col: keyof ContractRow) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ChevronDown className="ml-1 inline h-3 w-3 opacity-30" />;
    return sortDir === "desc"
      ? <ChevronDown className="ml-1 inline h-3 w-3" />
      : <ChevronUp className="ml-1 inline h-3 w-3" />;
  };

  const getCsvData = useCallback(() => {
    const headers = ["Contract ID", "Contract Name", "Parent Organization", "Weighted Mean", "Weighted Variance", "Measures", "Mean Category", "Variance Category", "r-Factor"];
    const rows = filteredContracts.map((c) => [
      c.contractId, c.contractName ?? "", c.parentOrganization ?? "",
      c.weightedMean.toFixed(6), c.weightedVariance.toFixed(6),
      String(c.measureCount), c.meanCategory, c.varianceCategory, c.rFactor.toFixed(1),
    ]);
    return { headers, rows };
  }, [filteredContracts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Loading reward factor data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const rfWithReward = data.contracts.filter((c) => c.rFactor > 0).length;
  const dist = data.rFactorDistribution;
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...Object.values(dist));

  return (
    <div className="flex flex-col gap-6">
      {/* Year selector */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {data.ratingLabel} · {data.populationSize} contracts · {rfWithReward} with reward factor
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="rf-year" className="text-xs text-muted-foreground">Year</label>
          <select
            id="rf-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {[2026, 2025, 2024, 2023].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-4">
        {[0, 0.1, 0.2, 0.3, 0.4].map((rf) => {
          const count = dist[rf] ?? 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
          const colors = rf === 0 ? "border-border" : rf <= 0.2 ? "border-blue-500/30" : "border-emerald-500/30";
          return (
            <div key={rf} className={`rounded-xl border bg-card p-4 ${colors}`}>
              <p className="text-xs text-muted-foreground">r-Factor {rf.toFixed(1)}</p>
              <p className="mt-1 text-2xl font-semibold">{count}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{pct}% of contracts</p>
            </div>
          );
        })}
      </div>

      {/* Thresholds */}
      <div className="grid grid-cols-2 gap-4">
        <ThresholdCard set={data.thresholdsWithQI} />
        <ThresholdCard set={data.thresholdsWithoutQI} />
      </div>

      {/* Distribution chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold">r-Factor Distribution</h3>
        <div className="flex items-end gap-3">
          {[0, 0.1, 0.2, 0.3, 0.4].map((rf) => {
            const count = dist[rf] ?? 0;
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
            const height = maxCount > 0 ? Math.max(4, (count / maxCount) * 120) : 4;
            return (
              <div key={rf} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-mono text-muted-foreground">{count}</span>
                <div className="w-full rounded-t" style={{ height, background: rf === 0 ? "var(--muted)" : `hsl(${120 + rf * 200}, 60%, 50%)` }} />
                <span className="text-xs font-semibold">{rf.toFixed(1)}</span>
                <span className="text-[0.6rem] text-muted-foreground">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contract table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Per-Contract Reward Factor</h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search contract, name, or org..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs"
              />
            </div>
            <ExportCsvButton fileName={`rfactor-${year}-overall-mapd`} getData={getCsvData} />
          </div>
        </div>
        <div className="max-h-[500px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Contract</th>
                <th className="px-3 py-2 text-left font-medium">Contract Name</th>
                <th className="px-3 py-2 text-left font-medium">Parent Organization</th>
                <th className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => handleSort("weightedMean")}>Weighted Mean<SortIcon col="weightedMean" /></th>
                <th className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => handleSort("weightedVariance")}>Weighted Variance<SortIcon col="weightedVariance" /></th>
                <th className="px-3 py-2 text-center font-medium">Mean Category</th>
                <th className="px-3 py-2 text-center font-medium">Variance Category</th>
                <th className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => handleSort("rFactor")}>r-Factor<SortIcon col="rFactor" /></th>
                <th className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => handleSort("measureCount")}>Measures<SortIcon col="measureCount" /></th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.slice(0, 300).map((c) => (
                <tr key={c.contractId} className="border-t border-border/50 hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-mono">{c.contractId}</td>
                  <td className="px-3 py-1.5 max-w-[200px] truncate text-muted-foreground" title={c.contractName ?? ""}>{c.contractName ?? "—"}</td>
                  <td className="px-3 py-1.5 max-w-[200px] truncate text-muted-foreground" title={c.parentOrganization ?? ""}>{c.parentOrganization ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{c.weightedMean.toFixed(4)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{c.weightedVariance.toFixed(4)}</td>
                  <td className="px-3 py-1.5 text-center"><CategoryBadge category={c.meanCategory} /></td>
                  <td className="px-3 py-1.5 text-center"><CategoryBadge category={c.varianceCategory} /></td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold">{c.rFactor.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right">{c.measureCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredContracts.length > 300 && (
            <p className="p-3 text-center text-xs text-muted-foreground">Showing 300 of {filteredContracts.length} contracts</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    high: "bg-emerald-500/10 text-emerald-500",
    relatively_high: "bg-blue-500/10 text-blue-500",
    below_threshold: "bg-muted text-muted-foreground",
    low: "bg-emerald-500/10 text-emerald-500",
    medium: "bg-amber-500/10 text-amber-500",
  };
  const labels: Record<string, string> = {
    high: "High",
    relatively_high: "Rel. High",
    below_threshold: "Below",
    low: "Low",
    medium: "Medium",
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[0.6rem] font-medium ${colors[category] ?? "bg-muted text-muted-foreground"}`}>
      {labels[category] ?? category}
    </span>
  );
}

function AccuracyBadge({ pctDiff }: { pctDiff: number }) {
  const abs = Math.abs(pctDiff);
  if (abs < 1) return <span className="inline-flex items-center gap-0.5 text-emerald-500"><CheckCircle2 className="h-3 w-3" />&lt;1%</span>;
  if (abs < 3) return <span className="text-amber-500">{abs.toFixed(1)}%</span>;
  return <span className="inline-flex items-center gap-0.5 text-red-500"><XCircle className="h-3 w-3" />{abs.toFixed(1)}%</span>;
}

function ThresholdCard({ set }: { set: ThresholdSet }) {
  const hasOfficial = set.official !== null;
  const keys = ["mean65th", "mean85th", "variance30th", "variance70th"] as const;
  const labels: Record<string, string> = {
    mean65th: "Mean 65th %ile",
    mean85th: "Mean 85th %ile",
    variance30th: "Variance 30th %ile",
    variance70th: "Variance 70th %ile",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold">{set.label}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{set.contractCount} contracts</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-1 text-left text-muted-foreground">Threshold</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Computed</th>
            {hasOfficial && <th className="px-2 py-1 text-right text-muted-foreground">Official</th>}
            {hasOfficial && <th className="px-2 py-1 text-right text-muted-foreground">Accuracy</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k} className="border-t border-border/50">
              <td className="px-2 py-1.5 font-medium">{labels[k]}</td>
              <td className="px-2 py-1.5 text-right font-mono">{fmt(set.computed[k])}</td>
              {hasOfficial && <td className="px-2 py-1.5 text-right font-mono">{fmt(set.official![k])}</td>}
              {hasOfficial && set.percentDifferences && (
                <td className="px-2 py-1.5 text-right"><AccuracyBadge pctDiff={set.percentDifferences[k]} /></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
