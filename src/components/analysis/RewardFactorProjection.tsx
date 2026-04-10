"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Loader2, Upload, Search, ChevronDown, ChevronUp, Info } from "lucide-react";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";

type PercentileThresholds = {
  mean65th: number;
  mean85th: number;
  variance30th: number;
  variance70th: number;
};

type QISensitivityResult = { qiStar: number; thresholds: PercentileThresholds };

type ContractProjectionResult = {
  contractId: string;
  isClient: boolean;
  weightedMean: number;
  weightedVariance: number;
  measureCount: number;
  rFactor: number;
  meanCategory: string;
  varianceCategory: string;
  qiSensitiveRFactorRange: [number, number];
};

type RatingTypeResult = {
  primaryThresholds: PercentileThresholds;
  qiSensitivity: QISensitivityResult[];
  qiBand: { min: PercentileThresholds; max: PercentileThresholds };
  contractResults: ContractProjectionResult[];
  populationSize: number;
  clientContractCount: number;
  officialComparison: {
    official: PercentileThresholds;
    differences: Record<string, number>;
    percentDifferences: Record<string, number>;
  } | null;
};

type ProjectionResponse = {
  year: number;
  mode: string;
  projectedMeasureCount: number;
  clientContracts: number;
  results: Record<string, RatingTypeResult>;
};

const RATING_TYPE_LABELS: Record<string, string> = {
  overall_mapd: "Overall (MA-PD)",
  part_c: "Part C",
  part_d_mapd: "Part D (MA-PD)",
};

function fmt(n: number, digits = 4) {
  return n.toFixed(digits);
}

function pctDiff(calc: number, official: number) {
  if (official === 0) return "N/A";
  return `${(((calc - official) / official) * 100).toFixed(2)}%`;
}

export function RewardFactorProjection() {
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState(2026);
  const [mode, setMode] = useState<"full_market" | "client_only">("full_market");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProjectionResponse | null>(null);
  const [activeRatingType, setActiveRatingType] = useState("overall_mapd");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string>("rFactor");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [clientOnly, setClientOnly] = useState(false);

  const parseCSV = useCallback((text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
      return row;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setError("CSV file is empty or has no data rows");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/analysis/reward-factor-projection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectedData: rows, year, mode }),
      });

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
  }, [file, year, mode, parseCSV]);

  const activeResult = data?.results[activeRatingType] ?? null;

  const filteredContracts = useMemo(() => {
    if (!activeResult) return [];
    let list = activeResult.contractResults;
    if (clientOnly) list = list.filter((c) => c.isClient);
    if (search) list = list.filter((c) => c.contractId.includes(search.toUpperCase()));
    return [...list].sort((a, b) => {
      const aVal = a[sortCol as keyof ContractProjectionResult] as number;
      const bVal = b[sortCol as keyof ContractProjectionResult] as number;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [activeResult, search, sortCol, sortDir, clientOnly]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ChevronDown className="ml-1 inline h-3 w-3 opacity-30" />;
    return sortDir === "desc"
      ? <ChevronDown className="ml-1 inline h-3 w-3" />
      : <ChevronUp className="ml-1 inline h-3 w-3" />;
  };

  const rFactorDistribution = useMemo(() => {
    if (!activeResult) return null;
    const contracts = clientOnly ? activeResult.contractResults.filter((c) => c.isClient) : activeResult.contractResults;
    const dist = { 0: 0, 0.1: 0, 0.2: 0, 0.3: 0, 0.4: 0 };
    for (const c of contracts) dist[c.rFactor as keyof typeof dist]++;
    return dist;
  }, [activeResult, clientOnly]);

  const getCsvData = useCallback(() => {
    const headers = ["Contract ID", "Client", "Weighted Mean", "Weighted Variance", "Measures", "Mean Category", "Variance Category", "r-Factor", "QI Min r-Factor", "QI Max r-Factor"];
    const rows = filteredContracts.map((c) => [
      c.contractId,
      c.isClient ? "Yes" : "No",
      fmt(c.weightedMean),
      fmt(c.weightedVariance),
      String(c.measureCount),
      c.meanCategory,
      c.varianceCategory,
      String(c.rFactor),
      String(c.qiSensitiveRFactorRange[0]),
      String(c.qiSensitiveRFactorRange[1]),
    ]);
    return { headers, rows };
  }, [filteredContracts]);

  return (
    <div className="flex flex-col gap-6">
      {/* Upload + Controls */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Upload Projected Data</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <label htmlFor="csv-upload" className="mb-1 block text-xs text-muted-foreground">CSV File</label>
            <div className="relative">
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:text-primary"
              />
            </div>
            <p className="mt-1 text-[0.65rem] text-muted-foreground">
              Columns: contract_id, measure_code, projected_score, projected_star (score or star required)
            </p>
          </div>
          <div>
            <label htmlFor="year-select" className="mb-1 block text-xs text-muted-foreground">Year</label>
            <select
              id="year-select"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="mode-select" className="mb-1 block text-xs text-muted-foreground">Population</label>
            <select
              id="mode-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as "full_market" | "client_only")}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="full_market">Full Market</option>
              <option value="client_only">Client Only</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || loading}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 inline h-4 w-4" />}
            {loading ? "Running..." : "Run Projection"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>

      {data && activeResult && (
        <>
          {/* Rating type tabs */}
          <div className="flex gap-2">
            {Object.entries(RATING_TYPE_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveRatingType(key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  activeRatingType === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground border border-border"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="Population" value={activeResult.populationSize} subtitle={`${activeResult.clientContractCount} client contracts`} />
            <SummaryCard label="Projected Measures" value={data.projectedMeasureCount} subtitle={`${data.clientContracts} contracts`} />
            <SummaryCard
              label="Contracts with r-Factor > 0"
              value={activeResult.contractResults.filter((c) => c.rFactor > 0).length}
              subtitle={`of ${activeResult.contractResults.length} total`}
            />
            <SummaryCard
              label="QI-Sensitive Contracts"
              value={activeResult.contractResults.filter((c) => c.qiSensitiveRFactorRange[0] !== c.qiSensitiveRFactorRange[1]).length}
              subtitle="r-factor changes with QI"
            />
          </div>

          {/* Thresholds comparison */}
          <ThresholdsPanel result={activeResult} ratingType={activeRatingType} />

          {/* QI Sensitivity */}
          <QISensitivityPanel result={activeResult} />

          {/* r-Factor distribution */}
          {rFactorDistribution && <DistributionPanel distribution={rFactorDistribution} />}

          {/* Contract table */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold">Per-Contract Results</h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={clientOnly} onChange={(e) => setClientOnly(e.target.checked)} className="rounded" />
                  Client only
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search contract..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs"
                  />
                </div>
                <ExportCsvButton fileName={`rfactor-projection-${year}`} getData={getCsvData} />
              </div>
            </div>
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Contract</th>
                    <th className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => handleSort("weightedMean")}>Mean<SortIcon col="weightedMean" /></th>
                    <th className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => handleSort("weightedVariance")}>Variance<SortIcon col="weightedVariance" /></th>
                    <th className="px-3 py-2 text-center font-medium">Mean Cat.</th>
                    <th className="px-3 py-2 text-center font-medium">Var. Cat.</th>
                    <th className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => handleSort("rFactor")}>r-Factor<SortIcon col="rFactor" /></th>
                    <th className="px-3 py-2 text-center font-medium">QI Range</th>
                    <th className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => handleSort("measureCount")}>Measures<SortIcon col="measureCount" /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.slice(0, 200).map((c) => {
                    const qiSensitive = c.qiSensitiveRFactorRange[0] !== c.qiSensitiveRFactorRange[1];
                    return (
                      <tr key={c.contractId} className="border-t border-border/50 hover:bg-muted/30">
                        <td className="px-3 py-1.5 font-mono">
                          {c.contractId}
                          {c.isClient && <span className="ml-1.5 rounded bg-primary/10 px-1 py-0.5 text-[0.6rem] text-primary">client</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono">{fmt(c.weightedMean)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{fmt(c.weightedVariance)}</td>
                        <td className="px-3 py-1.5 text-center"><CategoryBadge category={c.meanCategory} /></td>
                        <td className="px-3 py-1.5 text-center"><CategoryBadge category={c.varianceCategory} /></td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold">{c.rFactor.toFixed(1)}</td>
                        <td className={`px-3 py-1.5 text-center font-mono ${qiSensitive ? "text-amber-500" : "text-muted-foreground"}`}>
                          {qiSensitive ? `${c.qiSensitiveRFactorRange[0]}-${c.qiSensitiveRFactorRange[1]}` : "stable"}
                        </td>
                        <td className="px-3 py-1.5 text-right">{c.measureCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredContracts.length > 200 && (
                <p className="p-3 text-center text-xs text-muted-foreground">Showing 200 of {filteredContracts.length} contracts</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, subtitle }: { label: string; value: number | string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
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

function ThresholdsPanel({ result, ratingType }: { result: RatingTypeResult; ratingType: string }) {
  const { primaryThresholds: primary, officialComparison: official } = result;
  const label = RATING_TYPE_LABELS[ratingType] ?? ratingType;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Modeled Thresholds — {label} (Without QI)</h3>
        <div className="group relative">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="absolute bottom-full left-0 mb-1 hidden w-64 rounded-lg border border-border bg-popover p-2 text-xs text-muted-foreground shadow-lg group-hover:block">
            Primary thresholds computed without improvement measures (C30/D04). The &quot;Official&quot; column shows CMS published thresholds for the &quot;without improvement, with new measures&quot; scenario.
          </div>
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Threshold</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Modeled</th>
            {official && <th className="px-3 py-2 text-right font-medium text-muted-foreground">Official (CMS)</th>}
            {official && <th className="px-3 py-2 text-right font-medium text-muted-foreground">Difference</th>}
            {official && <th className="px-3 py-2 text-right font-medium text-muted-foreground">% Diff</th>}
          </tr>
        </thead>
        <tbody>
          {[
            { label: "Mean 65th %ile", key: "mean65th" as const },
            { label: "Mean 85th %ile", key: "mean85th" as const },
            { label: "Variance 30th %ile", key: "variance30th" as const },
            { label: "Variance 70th %ile", key: "variance70th" as const },
          ].map(({ label: rowLabel, key }) => (
            <tr key={key} className="border-t border-border/50">
              <td className="px-3 py-1.5 font-medium">{rowLabel}</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(primary[key], 6)}</td>
              {official && <td className="px-3 py-1.5 text-right font-mono">{fmt(official.official[key], 6)}</td>}
              {official && (
                <td className={`px-3 py-1.5 text-right font-mono ${Math.abs(official.differences[key]) < 0.01 ? "text-emerald-500" : Math.abs(official.differences[key]) < 0.05 ? "text-amber-500" : "text-red-500"}`}>
                  {official.differences[key] >= 0 ? "+" : ""}{fmt(official.differences[key], 6)}
                </td>
              )}
              {official && (
                <td className="px-3 py-1.5 text-right font-mono text-muted-foreground">
                  {pctDiff(primary[key], official.official[key])}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QISensitivityPanel({ result }: { result: RatingTypeResult }) {
  const { qiSensitivity, qiBand } = result;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold">QI Sensitivity Band (With Improvement Measures)</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Shows how thresholds shift when QI measures (C30/D04, weight 5) are added at each star level.
        The true &quot;with improvement&quot; thresholds fall within this band.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground">QI Star</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Mean 65th</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Mean 85th</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Var 30th</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Var 70th</th>
          </tr>
        </thead>
        <tbody>
          {qiSensitivity.map((qi) => (
            <tr key={qi.qiStar} className="border-t border-border/50">
              <td className="px-3 py-1.5 font-medium">{qi.qiStar} star</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(qi.thresholds.mean65th, 6)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(qi.thresholds.mean85th, 6)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(qi.thresholds.variance30th, 6)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(qi.thresholds.variance70th, 6)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-border bg-muted/30 font-semibold">
            <td className="px-3 py-1.5">Band range</td>
            <td className="px-3 py-1.5 text-right font-mono">{fmt(qiBand.min.mean65th, 4)}–{fmt(qiBand.max.mean65th, 4)}</td>
            <td className="px-3 py-1.5 text-right font-mono">{fmt(qiBand.min.mean85th, 4)}–{fmt(qiBand.max.mean85th, 4)}</td>
            <td className="px-3 py-1.5 text-right font-mono">{fmt(qiBand.min.variance30th, 4)}–{fmt(qiBand.max.variance30th, 4)}</td>
            <td className="px-3 py-1.5 text-right font-mono">{fmt(qiBand.min.variance70th, 4)}–{fmt(qiBand.max.variance70th, 4)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DistributionPanel({ distribution }: { distribution: Record<number, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(...Object.values(distribution));

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold">r-Factor Distribution</h3>
      <div className="flex items-end gap-3">
        {[0, 0.1, 0.2, 0.3, 0.4].map((rf) => {
          const count = distribution[rf] ?? 0;
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
  );
}
