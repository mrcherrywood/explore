"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Search, Target } from "lucide-react";

import type { MeasureSelectableStar, MeasureStarPercentileResponse } from "@/lib/percentile-analysis/measure-likelihood-types";
import type { PercentileMethod } from "@/lib/percentile-analysis/workbook-types";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "ready" | "error";

const STAR_OPTIONS: MeasureSelectableStar[] = [2, 3, 4, 5];

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

const METHOD_OPTIONS: { id: PercentileMethod; label: string }[] = [
  { id: "percentrank_inc", label: "Percentile Rank" },
  { id: "percentileofscore", label: "Percentile of Score" },
];

export function PercentileMeasureLikelihoodPanel() {
  const [data, setData] = useState<MeasureStarPercentileResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState("");
  const [selectedStar, setSelectedStar] = useState<MeasureSelectableStar>(4);
  const [method, setMethod] = useState<PercentileMethod>("percentrank_inc");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoadState("loading");
      setError(null);

      const params = new URLSearchParams({
        view: "measure-star-percentile",
        method,
        star: String(selectedStar),
      });
      if (selectedMeasure) {
        params.set("measure", selectedMeasure);
      }

      try {
        const response = await fetch(`/api/analysis/percentile-analysis?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload: MeasureStarPercentileResponse = await response.json();
        if (!response.ok || payload.status === "error" || payload.status === "missing_inputs") {
          throw new Error(payload.error || "Failed to load measure percentile analysis");
        }

        setData(payload);
        if (!selectedMeasure && payload.selectedMeasure) {
          setSelectedMeasure(payload.selectedMeasure);
        }
        setLoadState("ready");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load measure percentile analysis");
        setLoadState("error");
      }
    }

    load();
    return () => controller.abort();
  }, [method, selectedMeasure, selectedStar]);

  return (
    <section className="min-w-0 rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.45em] text-muted-foreground">Likelihood View</p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">Measure star percentile equivalents</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Pick a measure and star rating to see the percentile equivalent of that CMS cut point historically and for 2026.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="flex flex-col gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2 uppercase tracking-[0.25em]">
            <Search className="h-3.5 w-3.5" />
            Measure
          </span>
          <select
            value={selectedMeasure}
            onChange={(event) => setSelectedMeasure(event.target.value)}
            className="rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
          >
            {(data?.availableMeasures ?? []).map((measure) => (
              <option key={measure} value={measure}>
                {measure}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2 uppercase tracking-[0.25em]">
            <Target className="h-3.5 w-3.5" />
            Star rating
          </span>
          <div className="flex flex-wrap gap-2">
            {STAR_OPTIONS.map((star) => {
              const isActive = star === selectedStar;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setSelectedStar(star)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs transition",
                    isActive
                      ? "border-sky-500/70 bg-sky-500/10 text-sky-400"
                      : "border-border text-muted-foreground hover:border-border/60 hover:text-foreground"
                  )}
                >
                  {star} stars
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <span className="uppercase tracking-[0.25em]">Method</span>
          <div className="flex flex-wrap gap-2">
            {METHOD_OPTIONS.map((opt) => {
              const isActive = opt.id === method;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMethod(opt.id)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-xs transition",
                    isActive
                      ? "border-sky-500/70 bg-sky-500/10 text-sky-400"
                      : "border-border text-muted-foreground hover:border-border/60 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loadState === "loading" ? (
        <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading measure percentile analysis...</span>
          </div>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="mt-6 rounded-2xl border border-border bg-muted/20 p-6">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <p className="font-medium">The measure percentile analysis could not be loaded.</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : null}

      {loadState === "ready" && data ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-sm text-foreground">
              Measure: <span className="font-semibold">{data.selectedMeasure}</span>
              {" • "}
              Star: <span className="font-semibold">{data.selectedStar}</span>
            </p>
          </div>

          <section className="rounded-3xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Historical 2024-2026</h3>
            <p className="mt-1 text-xs text-muted-foreground">Sample-size-weighted summary across available years.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Weighted percentile</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">
                  {typeof data.historicalSummary?.weightedAveragePercentile === "number"
                    ? formatPercent(data.historicalSummary.weightedAveragePercentile)
                    : "—"}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Historical range</div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {typeof data.historicalSummary?.minPercentile === "number" &&
                  typeof data.historicalSummary?.maxPercentile === "number"
                    ? `${formatPercent(data.historicalSummary.minPercentile)}–${formatPercent(data.historicalSummary.maxPercentile)}`
                    : "—"}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">Total sample size</div>
                <div className="mt-2 text-lg font-semibold text-foreground">{data.historicalSummary?.totalSampleSize ?? 0}</div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold text-foreground">Year-by-year percentile equivalents</h3>
              <p className="mt-1 text-xs text-muted-foreground">Percentile associated with the selected star cut point in each year.</p>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Year</th>
                    <th className="px-4 py-3 text-left font-medium">Cut point score</th>
                    <th className="px-4 py-3 text-left font-medium">Associated percentile</th>
                    <th className="px-4 py-3 text-left font-medium">Sample size</th>
                  </tr>
                </thead>
                <tbody>
                  {data.yearlyResults.map((result) => (
                    <tr key={`${result.year}-${result.star}`} className="border-t border-border">
                      <td className="px-4 py-3 text-foreground">{result.year}</td>
                      <td className="px-4 py-3 text-foreground">{result.cutPointScore}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {typeof result.percentileEquivalent === "number" ? formatPercent(result.percentileEquivalent) : "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground">{result.sampleSize}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <h3 className="text-sm font-semibold text-foreground">Assumptions</h3>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              {data.assumptions.map((assumption) => (
                <li key={assumption} className={cn("leading-5")}>
                  {assumption}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
