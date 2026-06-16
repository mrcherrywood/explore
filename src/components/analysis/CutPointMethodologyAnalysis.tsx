"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FlaskConical, Info, Sparkles, Target, Users } from "lucide-react";

import { BacktestBanner } from "./BacktestMethodologyPanels";
import { RosterAccuracyCurve } from "./RosterAccuracyCurve";
import { DecimalUpliftCurve } from "./DecimalUpliftCurve";
import { CutPointForecastAnalysis } from "./CutPointForecastAnalysis";

type ThresholdComparison = {
  key: "twoStar" | "threeStar" | "fourStar" | "fiveStar";
  label: string;
  actual: number;
  simulated: number;
  delta: number;
  absError: number;
};

type BacktestYear = {
  year: number;
  rawSampleSize: number;
  sampleSize: number;
  resampleRuns: number;
  outliersRemoved: number;
  tukeyApplied: boolean;
  guardrailsApplied: boolean;
  guardrailCap: number | null;
  meanAbsoluteError: number;
  maxAbsoluteError: number;
  thresholdComparisons: ThresholdComparison[];
  notes: string[];
};

type ReadyResponse = {
  status: "ready";
  measure: string;
  displayName: string;
  inverted: boolean;
  supportedYears: number[];
  years: BacktestYear[];
  summary: {
    comparedYears: number;
    avgMeanAbsoluteError: number;
    bestYear: number | null;
    worstYear: number | null;
  };
  methodology: {
    method: "clustering" | "cahps-percentile";
    foldCount: number;
    seed: number;
    tukeyStartsIn: number;
    exclusions: string[];
  };
};

type UnsupportedResponse = {
  status: "unsupported";
  measure: string;
  displayName: string;
  reason: string;
};

type ResponsePayload = ReadyResponse | UnsupportedResponse;

type OverallAccuracy = {
  thresholdComparisons: number;
  meanAbsoluteError: number;
  medianAbsoluteError: number;
  maxAbsoluteError: number;
  exactMatchPct: number;
  withinOnePointPct: number;
};

type OverallThresholdSummary = {
  key: "twoStar" | "threeStar" | "fourStar" | "fiveStar";
  label: string;
  count: number;
  meanAbsoluteError: number;
  clientCount: number;
  clientMeanAbsoluteError: number | null;
};

type OverallMeasureSummary = {
  measure: string;
  displayName: string;
  method: "clustering" | "cahps-percentile";
  comparedYears: number;
  thresholdCount: number;
  meanAbsoluteError: number;
  maxAbsoluteError: number;
  clientThresholdCount: number;
  clientMeanAbsoluteError: number | null;
};

type OverallResponse = {
  status: "ready";
  generatedAt: string;
  clientContractCount: number;
  measuresIncluded: number;
  measuresExcluded: number;
  excluded: { displayName: string; reason: string }[];
  fullMarket: OverallAccuracy;
  client: OverallAccuracy | null;
  byThreshold: OverallThresholdSummary[];
  measures: OverallMeasureSummary[];
};

type Props = {
  measure: string;
  displayName: string;
};

const STAR_COLORS: Record<string, string> = {
  "2": "#f97316",
  "3": "#eab308",
  "4": "#22c55e",
  "5": "#3b82f6",
};

const THRESHOLD_STAR: Record<string, string> = {
  twoStar: "2",
  threeStar: "3",
  fourStar: "4",
  fiveStar: "5",
};

function thresholdAbsError(year: BacktestYear, key: ThresholdComparison["key"]): string {
  const comp = year.thresholdComparisons.find((t) => t.key === key);
  return comp ? comp.absError.toFixed(2) : "—";
}

function fmtDelta(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function deltaColor(delta: number): string {
  if (delta > 0) return "text-rose-500";
  if (delta < 0) return "text-emerald-500";
  return "text-muted-foreground";
}

function maeColor(mae: number): string {
  if (mae <= 0.5) return "text-emerald-500";
  if (mae <= 1.5) return "text-sky-500";
  if (mae <= 3) return "text-amber-500";
  return "text-rose-500";
}

async function fetchBacktest(measure: string, clientOnly: boolean): Promise<ResponsePayload> {
  const params = new URLSearchParams({ view: "methodology-backtest", measure });
  if (clientOnly) params.set("clientOnly", "true");
  const res = await fetch(`/api/analysis/band-movement?${params}`, { cache: "no-store" });
  const payload = await res.json().catch(() => null);
  if (!res.ok && payload?.status !== "unsupported") {
    throw new Error(payload?.error || "Failed to load");
  }
  return payload;
}

export function CutPointMethodologyAnalysis({ measure, displayName }: Props) {
  const [marketData, setMarketData] = useState<ResponsePayload | null>(null);
  const [clientData, setClientData] = useState<ResponsePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showProjected, setShowProjected] = useState(false);
  const [showOverall, setShowOverall] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [market, client] = await Promise.all([
        fetchBacktest(measure, false),
        fetchBacktest(measure, true),
      ]);
      setMarketData(market);
      setClientData(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setIsLoading(false);
    }
  }, [measure]);

  useEffect(() => {
    if (measure) fetchData();
  }, [measure, fetchData]);

  useEffect(() => {
    if (marketData?.status === "ready") {
      setSelectedYear(marketData.supportedYears[marketData.supportedYears.length - 1] ?? null);
    } else {
      setSelectedYear(null);
    }
  }, [marketData]);

  const marketYear = useMemo(() => {
    if (marketData?.status !== "ready") return null;
    return marketData.years.find((y) => y.year === selectedYear) ?? marketData.years[marketData.years.length - 1] ?? null;
  }, [marketData, selectedYear]);

  const clientYear = useMemo(() => {
    if (clientData?.status !== "ready") return null;
    return clientData.years.find((y) => y.year === selectedYear) ?? null;
  }, [clientData, selectedYear]);

  const data = marketData;
  const isCahps = data?.status === "ready" && data.methodology.method === "cahps-percentile";
  const hasClientData = clientData?.status === "ready" && clientYear !== null;

  if (isLoading) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading CMS cut point backtest...</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-3 text-red-400"><AlertTriangle className="h-5 w-5" /><span className="font-medium">Failed to load.</span></div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">No backtest data available.</div>;
  }

  if (data.status === "unsupported") {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Backtest unavailable for this measure</h3>
            <p className="mt-1 text-sm text-muted-foreground">{data.reason}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!marketYear) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">No comparable backtest years were available.</div>;
  }

  return (
    <div className="space-y-6">
      <BacktestBanner data={data} displayName={displayName} />

      <OverallAccuracySection show={showOverall} onToggle={() => setShowOverall((prev) => !prev)} />

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Rating Year</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.supportedYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setSelectedYear(year)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    marketYear.year === year
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {data.summary.comparedYears} backtest year{data.summary.comparedYears === 1 ? "" : "s"} available.
            Avg mean absolute error: {data.summary.avgMeanAbsoluteError.toFixed(2)} points.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ComparisonCard
          label="Contracts Used"
          marketValue={String(marketYear.sampleSize)}
          clientValue={hasClientData ? String(clientYear.sampleSize) : null}
          helper={`${marketYear.rawSampleSize} with valid scores in ${marketYear.year}`}
        />
        <ComparisonCard
          label="Outliers Removed"
          marketValue={String(marketYear.outliersRemoved)}
          clientValue={hasClientData ? String(clientYear.outliersRemoved) : null}
          helper={isCahps ? "CAHPS uses no outlier deletion" : marketYear.tukeyApplied ? "Removed by Tukey outer fences" : "Tukey not used for this year"}
          accent="text-amber-500"
        />
        <ComparisonCard
          label="Mean Abs Error"
          marketValue={marketYear.meanAbsoluteError.toFixed(2)}
          clientValue={hasClientData ? clientYear.meanAbsoluteError.toFixed(2) : null}
          helper="Average gap across 2★–5★ thresholds"
          accent="text-sky-500"
        />
        <ComparisonCard
          label="4★ Threshold Error"
          marketValue={thresholdAbsError(marketYear, "fourStar")}
          clientValue={hasClientData ? thresholdAbsError(clientYear, "fourStar") : null}
          helper="Simulated vs actual 4-star cut point"
          accent="text-green-500"
        />
        <ComparisonCard
          label="5★ Threshold Error"
          marketValue={thresholdAbsError(marketYear, "fiveStar")}
          clientValue={hasClientData ? thresholdAbsError(clientYear, "fiveStar") : null}
          helper="Simulated vs actual 5-star cut point"
          accent="text-blue-500"
        />
        <ComparisonCard
          label="Largest Gap"
          marketValue={marketYear.maxAbsoluteError.toFixed(2)}
          clientValue={hasClientData ? clientYear.maxAbsoluteError.toFixed(2) : null}
          helper={isCahps ? "Percentile-based thresholds · no guardrails" : `${marketYear.resampleRuns} resamples · ${marketYear.guardrailsApplied ? `guardrail cap ${marketYear.guardrailCap}` : "no guardrails"}`}
          accent="text-emerald-500"
        />
      </section>

      <ComparisonTable data={data} marketYear={marketYear} clientYear={clientYear} />
      <YearlySummaryTable data={data} clientData={clientData?.status === "ready" ? clientData : null} activeYear={marketYear.year} />

      <ProjectedClientDataSection
        measure={measure}
        displayName={displayName}
        show={showProjected}
        onToggle={() => setShowProjected((prev) => !prev)}
      />

      <RosterAccuracyCurve measure={measure} displayName={displayName} />
      <DecimalUpliftCurve measure={measure} displayName={displayName} />
    </div>
  );
}

function OverallAccuracySection({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  const [data, setData] = useState<OverallResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show || data) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetch("/api/analysis/band-movement?view=methodology-backtest-overall", { cache: "no-store" })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error || "Failed to load combined accuracy");
        if (!cancelled) setData(payload as OverallResponse);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load combined accuracy");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [show, data]);

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Combined Accuracy — All Measures</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Pools every 2★–5★ cut point we simulate across all backtestable measures and years into a
              single mean absolute error, so you can see the big-picture accuracy of the methodology.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={show}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            show ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {show ? "Hide combined accuracy" : "Show combined accuracy"}
        </button>
      </div>

      {show && (
        <div className="mt-6 border-t border-border pt-6">
          {isLoading && (
            <p className="text-sm text-muted-foreground">
              Crunching every measure&apos;s backtest — this can take a few seconds on first load…
            </p>
          )}
          {error && (
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {!isLoading && !error && data && <OverallAccuracyContent data={data} />}
        </div>
      )}
    </section>
  );
}

function OverallAccuracyContent({ data }: { data: OverallResponse }) {
  const hasClient = data.client !== null;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ComparisonCard
          label="Combined MAE"
          marketValue={data.fullMarket.meanAbsoluteError.toFixed(2)}
          clientValue={hasClient ? data.client!.meanAbsoluteError.toFixed(2) : null}
          helper={`Pooled across ${data.fullMarket.thresholdComparisons.toLocaleString()} thresholds`}
          accent="text-sky-500"
        />
        <ComparisonCard
          label="Median Abs Error"
          marketValue={data.fullMarket.medianAbsoluteError.toFixed(2)}
          clientValue={hasClient ? data.client!.medianAbsoluteError.toFixed(2) : null}
          helper="Typical (50th percentile) gap"
          accent="text-emerald-500"
        />
        <ComparisonCard
          label="Within 1 Point"
          marketValue={`${data.fullMarket.withinOnePointPct.toFixed(0)}%`}
          clientValue={hasClient ? `${data.client!.withinOnePointPct.toFixed(0)}%` : null}
          helper={`Exact match: ${data.fullMarket.exactMatchPct.toFixed(0)}% of thresholds`}
          accent="text-green-500"
        />
        <ComparisonCard
          label="Measures Covered"
          marketValue={String(data.measuresIncluded)}
          clientValue={null}
          helper={`${data.measuresExcluded} excluded (QI / no comparable years)`}
          accent="text-foreground"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Threshold</th>
              <th className="px-3 py-2 text-right">Market MAE</th>
              {hasClient && <th className="px-3 py-2 text-right text-violet-500">Client MAE</th>}
              <th className="px-3 py-2 text-right">Samples</th>
            </tr>
          </thead>
          <tbody>
            {[...data.byThreshold].reverse().map((t) => (
              <tr key={t.key} className="border-b border-border/50">
                <td className="px-3 py-3 font-medium" style={{ color: STAR_COLORS[THRESHOLD_STAR[t.key]] }}>{t.label}</td>
                <td className={`px-3 py-3 text-right tabular-nums font-semibold ${maeColor(t.meanAbsoluteError)}`}>{t.meanAbsoluteError.toFixed(2)}</td>
                {hasClient && (
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${t.clientMeanAbsoluteError !== null ? maeColor(t.clientMeanAbsoluteError) : ""}`}>
                    {t.clientMeanAbsoluteError !== null ? t.clientMeanAbsoluteError.toFixed(2) : "—"}
                  </td>
                )}
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{t.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-foreground">Per-measure mean absolute error</h4>
        <p className="mb-3 text-xs text-muted-foreground">Sorted worst-fit first, so the biggest accuracy gaps surface at the top.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Measure</th>
                <th className="px-3 py-2 text-right">Method</th>
                <th className="px-3 py-2 text-right">Years</th>
                <th className="px-3 py-2 text-right">Market MAE</th>
                {hasClient && <th className="px-3 py-2 text-right text-violet-500">Client MAE</th>}
                <th className="px-3 py-2 text-right">Max</th>
              </tr>
            </thead>
            <tbody>
              {data.measures.map((m) => (
                <tr key={m.measure} className="border-b border-border/50">
                  <td className="px-3 py-3 font-medium text-foreground">{m.displayName}</td>
                  <td className="px-3 py-3 text-right text-xs text-muted-foreground">{m.method === "cahps-percentile" ? "CAHPS" : "Clustering"}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{m.comparedYears}</td>
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${maeColor(m.meanAbsoluteError)}`}>{m.meanAbsoluteError.toFixed(2)}</td>
                  {hasClient && (
                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${m.clientMeanAbsoluteError !== null ? maeColor(m.clientMeanAbsoluteError) : ""}`}>
                      {m.clientMeanAbsoluteError !== null ? m.clientMeanAbsoluteError.toFixed(2) : "—"}
                    </td>
                  )}
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${maeColor(m.maxAbsoluteError)}`}>{m.maxAbsoluteError.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Combined MAE is the average of every individual 2★–5★ absolute error (|simulated − actual|) across
        all measures and backtest years, weighting each threshold equally.
      </p>
    </div>
  );
}

function ComparisonCard({ label, marketValue, clientValue, helper, accent }: {
  label: string;
  marketValue: string;
  clientValue: string | null;
  helper: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-3">
        <p className={`text-3xl font-semibold ${accent ?? "text-foreground"}`}>{marketValue}</p>
        {clientValue !== null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">vs</span>
            <span className={`text-xl font-semibold text-violet-500`}>{clientValue}</span>
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {clientValue !== null ? (
          <><span className={accent ?? "text-foreground"}>Full Market</span> vs <span className="text-violet-500">Client Only</span> · {helper}</>
        ) : helper}
      </p>
    </div>
  );
}

function ComparisonTable({ data, marketYear, clientYear }: {
  data: ReadyResponse;
  marketYear: BacktestYear;
  clientYear: BacktestYear | null;
}) {
  const clientMap = new Map(clientYear?.thresholdComparisons.map((c) => [c.key, c]));

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <FlaskConical className="h-5 w-5 text-sky-400" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Actual vs Simulated Cut Points</h3>
          <p className="text-xs text-muted-foreground">{data.displayName} · {marketYear.year}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Threshold</th>
              <th className="px-3 py-2 text-right">Actual</th>
              <th className="px-3 py-2 text-right">Full Market</th>
              <th className="px-3 py-2 text-right">Delta</th>
              {clientYear && (
                <>
                  <th className="px-3 py-2 text-right text-violet-500">Client Only</th>
                  <th className="px-3 py-2 text-right text-violet-500">Delta</th>
                  <th className="px-3 py-2 text-right">Diff</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {[...marketYear.thresholdComparisons].reverse().map((comparison) => {
              const starColor = STAR_COLORS[THRESHOLD_STAR[comparison.key]];
              const clientComp = clientMap.get(comparison.key);
              const diff = clientComp ? clientComp.simulated - comparison.simulated : null;
              return (
                <tr key={comparison.key} className="border-b border-border/50">
                  <td className="px-3 py-3 font-medium" style={{ color: starColor }}>{comparison.label}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{comparison.actual.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{comparison.simulated.toFixed(2)}</td>
                  <td className={`px-3 py-3 text-right font-semibold tabular-nums ${deltaColor(comparison.delta)}`}>
                    {fmtDelta(comparison.delta)}
                  </td>
                  {clientComp && (
                    <>
                      <td className="px-3 py-3 text-right tabular-nums text-violet-500 font-medium">{clientComp.simulated.toFixed(2)}</td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${deltaColor(clientComp.delta)}`}>
                        {fmtDelta(clientComp.delta)}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${diff !== null && diff > 0 ? "text-rose-400" : diff !== null && diff < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                        {diff !== null ? fmtDelta(diff) : "—"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {clientYear && (
        <p className="mt-3 text-xs text-muted-foreground">
          <Users className="mr-1 inline h-3.5 w-3.5 text-violet-400" />
          Client population: {clientYear.sampleSize} contracts (vs {marketYear.sampleSize} full market).
          &quot;Diff&quot; = client simulated minus full market simulated.
        </p>
      )}
    </section>
  );
}

function ProjectedClientDataSection({ measure, displayName, show, onToggle }: {
  measure: string;
  displayName: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Projected Client Data</h3>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Apply the same CMS methodology to your client&apos;s projected year-end scores instead of
              published history. Projections come from the latest <strong>approved</strong> run — upload current
              client data and approve it under <span className="font-medium text-foreground">Admin → Forecast</span>.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={show}
          className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
            show
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          {show ? "Hide projected cut points" : "Use projected client data"}
        </button>
      </div>

      {show && (
        <div className="mt-6 border-t border-border pt-6">
          <CutPointForecastAnalysis measure={measure} displayName={displayName} />
        </div>
      )}
    </section>
  );
}

function YearlySummaryTable({ data, clientData, activeYear }: {
  data: ReadyResponse;
  clientData: ReadyResponse | null;
  activeYear: number;
}) {
  const clientYearMap = new Map(clientData?.years.map((y) => [y.year, y]));

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Yearly Error Summary</h3>
        <p className="text-xs text-muted-foreground">
          {clientData
            ? "Full Market vs Client Only — how closely each population tracks actual CMS cut points."
            : "Use this to compare how closely the simulation tracks actual CMS cut points by year."}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2 text-right">Market N</th>
              {clientData && <th className="px-3 py-2 text-right text-violet-500">Client N</th>}
              <th className="px-3 py-2 text-right">Market MAE</th>
              {clientData && <th className="px-3 py-2 text-right text-violet-500">Client MAE</th>}
              <th className="px-3 py-2 text-right">Market Max</th>
              {clientData && <th className="px-3 py-2 text-right text-violet-500">Client Max</th>}
              <th className="px-3 py-2 text-right">Tukey</th>
              <th className="px-3 py-2 text-right">Guardrails</th>
            </tr>
          </thead>
          <tbody>
            {[...data.years].reverse().map((year) => {
              const cy = clientYearMap.get(year.year);
              return (
                <tr key={year.year} className={`border-b border-border/50 ${year.year === activeYear ? "bg-muted/30" : ""}`}>
                  <td className="px-3 py-3 font-medium text-foreground">{year.year}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{year.sampleSize}</td>
                  {clientData && <td className="px-3 py-3 text-right tabular-nums text-violet-500">{cy?.sampleSize ?? "—"}</td>}
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${maeColor(year.meanAbsoluteError)}`}>{year.meanAbsoluteError.toFixed(2)}</td>
                  {clientData && (
                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${cy ? maeColor(cy.meanAbsoluteError) : ""}`}>
                      {cy?.meanAbsoluteError.toFixed(2) ?? "—"}
                    </td>
                  )}
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${maeColor(year.maxAbsoluteError)}`}>{year.maxAbsoluteError.toFixed(2)}</td>
                  {clientData && (
                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${cy ? maeColor(cy.maxAbsoluteError) : ""}`}>
                      {cy?.maxAbsoluteError.toFixed(2) ?? "—"}
                    </td>
                  )}
                  <td className="px-3 py-3 text-right">{year.tukeyApplied ? "Yes" : "No"}</td>
                  <td className="px-3 py-3 text-right">{year.guardrailsApplied ? "Yes" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
