"use client";

import { useEffect, useMemo, useState } from "react";
import { ActivitySquare, AlertTriangle, ArrowDownRight, LineChart } from "lucide-react";
import { ChartRenderer } from "@/components/chart/ChartRenderer";
import type { ChartSpec } from "@/types/charts";

type HighlightCard = {
  id: string;
  label: string;
  value: string;
  helper: string;
};

type TransitionMatrix = {
  fromYear: number;
  toYear: number;
  stayRates: Array<{ rating: number; stayRate: number | null; sample: number }>;
  pairSample: number;
};

type YearlyStat = {
  year: number;
  sample: number;
  average: number | null;
  highShare: number | null;
  perfectShare: number | null;
};

type MeasureSummary = {
  id: string;
  label: string;
  description: string;
  shortLabel: string;
  codesUsed: string[];
  yearlyStats: YearlyStat[];
  transitions: TransitionMatrix[];
  highCarry: {
    base: number;
    dropRate: number | null;
    riseRate: number | null;
    flatRate: number | null;
    avgChange: number | null;
  };
  sampleContracts: number;
  samplePoints: number;
};

type AnalysisResponse = {
  datasetYears: number[];
  measures: MeasureSummary[];
  charts: {
    trend?: ChartSpec | null;
    retention?: ChartSpec | null;
  };
  highlightCards: HighlightCard[];
  insights: string[];
};

export function QualityImprovementAnalysis() {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/analysis/quality-improvement", { signal: controller.signal });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to load quality improvement analysis");
        }
        const payload: AnalysisResponse = await response.json();
        setData(payload);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load quality improvement analysis");
      } finally {
        setIsLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, []);

  const datasetRange = useMemo(() => {
    if (!data?.datasetYears?.length) return null;
    const sorted = [...data.datasetYears].sort((a, b) => a - b);
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }, [data]);

  const totalSamplePoints = useMemo(() => {
    if (!data) return 0;
    return data.measures.reduce((sum, measure) => sum + measure.samplePoints, 0);
  }, [data]);

  const latestYearlyStats = useMemo(() => {
    if (!data) return [];
    return data.measures.map((measure) => {
      const latest = measure.yearlyStats[measure.yearlyStats.length - 1];
      return { measure, latest };
    });
  }, [data]);

  const contentState = (() => {
    if (isLoading) return "loading" as const;
    if (error) return "error" as const;
    if (!data) return "empty" as const;
    return "ready" as const;
  })();

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-8 py-6 text-white shadow-2xl shadow-slate-900/30">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs uppercase tracking-[0.6em] text-slate-400">Quality Improvement Watch</p>
            <h2 className="text-3xl font-semibold">Are high-scoring contracts able to stay ahead?</h2>
            <p className="text-sm text-slate-300">
              We tracked Part C (Health Plan) and Part D (Drug Plan) Quality Improvement star ratings across recent CMS Star Rating years to
              quantify how often contracts sustain elite performance. The data tells us whether earning a 4-5★ score simply raises the bar for the following year.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Data coverage</p>
            {datasetRange ? (
              <p className="mt-2 text-lg font-semibold">
                {datasetRange.start} – {datasetRange.end}
              </p>
            ) : (
              <p className="mt-2 text-lg font-semibold">No data</p>
            )}
            <p className="mt-1 text-xs text-slate-300">
              {totalSamplePoints.toLocaleString()} contract-measure points
            </p>
          </div>
        </div>
      </section>

      {contentState === "loading" ? (
        <div className="rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading trends…</div>
      ) : null}

      {contentState === "error" ? (
        <div className="rounded-3xl border border-border bg-card p-8">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <p className="font-medium">We couldn&apos;t load the analysis.</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : null}

      {contentState === "ready" && data ? (
        <>
          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <ActivitySquare className="h-5 w-5 text-sky-400" />
              <div>
                <h3 className="text-base font-semibold text-foreground">High-performer watchlist</h3>
                <p className="text-xs text-muted-foreground">Key signals from the latest contiguous year comparisons</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {data.highlightCards.map((card) => (
                <div key={card.id} className="rounded-2xl border border-border bg-muted/40 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">{card.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{card.helper}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            {data.charts.trend ? (
              <div className="rounded-3xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Trajectory</p>
                    <h3 className="text-base font-semibold text-foreground">Average quality improvement stars</h3>
                  </div>
                  <LineChart className="h-5 w-5 text-sky-400" />
                </div>
                <ChartRenderer spec={data.charts.trend} />
              </div>
            ) : null}
            {data.charts.retention ? (
              <div className="rounded-3xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Momentum test</p>
                    <h3 className="text-base font-semibold text-foreground">What happens after a 4-5★ score</h3>
                  </div>
                  <ArrowDownRight className="h-5 w-5 text-rose-400" />
                </div>
                <ChartRenderer spec={data.charts.retention} />
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <h3 className="text-base font-semibold text-foreground">Stay-on-top odds</h3>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                {data.measures.map((measure) => {
                  const latestTransition = measure.transitions[measure.transitions.length - 1];
                  if (!latestTransition) return null;
                  return (
                    <div key={measure.id} className="rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">{measure.shortLabel}</p>
                        <h4 className="text-base font-semibold text-foreground">
                          {latestTransition.fromYear} → {latestTransition.toYear}
                        </h4>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {latestTransition.pairSample.toLocaleString()} pairs
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-border bg-card p-3">
                      <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-muted-foreground">
                        <span>Rating</span>
                        <span className="text-center">Stayed ★</span>
                        <span className="text-right">Sample</span>
                      </div>
                      <div className="mt-2 space-y-2 text-sm text-foreground">
                        {latestTransition.stayRates
                          .slice()
                          .sort((a, b) => b.rating - a.rating)
                          .map((row) => (
                            <div key={row.rating} className="grid grid-cols-3 gap-2 rounded-xl border border-border/50 px-3 py-2 text-sm">
                              <span className="font-medium">{row.rating}★</span>
                              <span className="text-center font-semibold text-sky-500">
                                {row.stayRate !== null ? `${row.stayRate}%` : "—"}
                              </span>
                              <span className="text-right text-xs text-muted-foreground">
                                {row.sample.toLocaleString()}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground">What to watch</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                {data.insights.map((insight, index) => (
                  <div key={index} className="rounded-2xl border border-border bg-muted/30 p-4">
                    <p className="text-sm text-foreground">{insight}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-4">
                <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">Latest readings</p>
                <div className="mt-4 space-y-4">
                  {latestYearlyStats.map(({ measure, latest }) => (
                    <div key={measure.id} className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">{measure.shortLabel}</p>
                          <p className="text-base font-semibold text-foreground">{measure.label}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-foreground">{latest?.average ?? "—"}★</p>
                          <p className="text-xs text-muted-foreground">
                            {latest?.highShare ?? "—"}% at 4-5★ · {latest?.perfectShare ?? "—"}% at 5★
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
