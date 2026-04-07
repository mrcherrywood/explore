"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FlaskConical, HelpCircle, Info } from "lucide-react";

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

export function CutPointMethodologyAnalysis({ measure, displayName }: Props) {
  const [data, setData] = useState<ResponsePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: "methodology-backtest", measure });
      const res = await fetch(`/api/analysis/band-movement?${params}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok && payload?.status !== "unsupported") {
        throw new Error(payload?.error || "Failed to load");
      }
      setData(payload);
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
    if (data?.status === "ready") {
      setSelectedYear(data.supportedYears[data.supportedYears.length - 1] ?? null);
    } else {
      setSelectedYear(null);
    }
  }, [data]);

  const activeYear = useMemo(() => {
    if (data?.status !== "ready") return null;
    return data.years.find((year) => year.year === selectedYear) ?? data.years[data.years.length - 1] ?? null;
  }, [data, selectedYear]);

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

  if (!activeYear) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">No comparable backtest years were available.</div>;
  }

  return (
    <div className="space-y-6">
      <BacktestBanner data={data} displayName={displayName} />

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
                    activeYear.year === year
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Contracts Used" value={String(activeYear.sampleSize)} helper={`${activeYear.rawSampleSize} with valid scores in ${activeYear.year}`} />
        <SummaryCard label="Outliers Removed" value={String(activeYear.outliersRemoved)} helper={activeYear.tukeyApplied ? "Removed by Tukey outer fences" : "Tukey not used for this year"} accent="text-amber-500" />
        <SummaryCard label="Mean Abs Error" value={activeYear.meanAbsoluteError.toFixed(2)} helper="Average gap across 2★-5★ thresholds" accent="text-sky-500" />
        <SummaryCard label="Largest Gap" value={activeYear.maxAbsoluteError.toFixed(2)} helper={`${activeYear.resampleRuns} resamples · ${activeYear.guardrailsApplied ? `guardrail cap ${activeYear.guardrailCap}` : "no guardrails"}`} accent="text-emerald-500" />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <FlaskConical className="h-5 w-5 text-sky-400" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Actual vs Simulated Cut Points</h3>
            <p className="text-xs text-muted-foreground">{data.displayName} · {activeYear.year}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Threshold</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Simulated</th>
                <th className="px-3 py-2 text-right">Delta</th>
                <th className="px-3 py-2 text-right">Abs Error</th>
              </tr>
            </thead>
            <tbody>
              {[...activeYear.thresholdComparisons].reverse().map((comparison) => {
                const starColor = STAR_COLORS[THRESHOLD_STAR[comparison.key]];
                return (
                  <tr key={comparison.key} className="border-b border-border/50">
                    <td className="px-3 py-3 font-medium" style={{ color: starColor }}>{comparison.label}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{comparison.actual.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{comparison.simulated.toFixed(2)}</td>
                    <td className={`px-3 py-3 text-right font-semibold tabular-nums ${deltaColor(comparison.delta)}`}>
                      {fmtDelta(comparison.delta)}
                    </td>
                    <td className={`px-3 py-3 text-right tabular-nums font-semibold ${maeColor(comparison.absError)}`}>{comparison.absError.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-foreground">Yearly Error Summary</h3>
          <p className="text-xs text-muted-foreground">Use this to compare how closely the simulation tracks actual CMS cut points by year.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2 text-right">Used</th>
                <th className="px-3 py-2 text-right">Outliers</th>
                <th className="px-3 py-2 text-right">MAE</th>
                <th className="px-3 py-2 text-right">Max Gap</th>
                <th className="px-3 py-2 text-right">Tukey</th>
                <th className="px-3 py-2 text-right">Guardrails</th>
              </tr>
            </thead>
            <tbody>
              {[...data.years].reverse().map((year) => (
                <tr key={year.year} className={`border-b border-border/50 ${year.year === activeYear.year ? "bg-muted/30" : ""}`}>
                  <td className="px-3 py-3 font-medium text-foreground">{year.year}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{year.sampleSize}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{year.outliersRemoved}</td>
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${maeColor(year.meanAbsoluteError)}`}>{year.meanAbsoluteError.toFixed(2)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${maeColor(year.maxAbsoluteError)}`}>{year.maxAbsoluteError.toFixed(2)}</td>
                  <td className="px-3 py-3 text-right">{year.tukeyApplied ? "Yes" : "No"}</td>
                  <td className="px-3 py-3 text-right">{year.guardrailsApplied ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function BacktestBanner({ data, displayName }: { data: ReadyResponse; displayName: string }) {
  const [showMethodology, setShowMethodology] = useState(false);

  return (
    <div className="space-y-0 rounded-2xl border border-amber-500/30 bg-amber-500/5">
      <div className="flex gap-3 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Research backtest only</p>
          <p className="mt-1">
            This view approximates CMS-style non-CAHPS cut points for {displayName} using contract-level
            measure scores, 10-fold mean resampling, Ward-style clustering, and year-appropriate Tukey handling.
            It is designed for validation against official cut points, not for predicting the exact CMS output.
          </p>
          <button
            type="button"
            onClick={() => setShowMethodology((current) => !current)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            How is this calculated?
            {showMethodology ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {showMethodology && (
        <div className="border-t border-amber-500/20 px-4 pb-5 pt-4 text-sm text-muted-foreground">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 font-medium text-foreground">1. Data Collection</p>
              <ul className="space-y-1 pl-4 list-disc">
                <li>Loads all H+R (Medicare Advantage) contract-level scores for the selected measure across available years (2023–2026).</li>
                <li>Only contracts with valid numeric scores are included; contracts missing the measure are excluded.</li>
                <li>Excludes {data.methodology.exclusions.join(" and ")} — these use different CMS methodologies.</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-medium text-foreground">2. Outlier Deletion (Tukey)</p>
              <ul className="space-y-1 pl-4 list-disc">
                <li>Starting in {data.methodology.tukeyStartsIn}, CMS adopted Tukey outer-fence deletion. Pre-{data.methodology.tukeyStartsIn} years skip this step.</li>
                <li>Computes Q1 and Q3 from all scores, then IQR = Q3 − Q1.</li>
                <li>Outer fences: lower = Q1 − 3 × IQR, upper = Q3 + 3 × IQR (capped to the 0–100 scale bounds).</li>
                <li>Any contract score outside the fences is removed before clustering.</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-medium text-foreground">3. Mean Resampling ({data.methodology.foldCount}-Fold)</p>
              <ul className="space-y-1 pl-4 list-disc">
                <li>Contracts are deterministically shuffled (seed {data.methodology.seed}, Fisher–Yates) and assigned to {data.methodology.foldCount} equal-sized folds.</li>
                <li>For each fold, the held-out group is removed and clustering runs on the remaining ~90% of contracts.</li>
                <li>This leave-one-group-out resampling stabilizes thresholds by averaging across {data.methodology.foldCount} independent runs.</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-medium text-foreground">4. Ward&apos;s Hierarchical Clustering</p>
              <ul className="space-y-1 pl-4 list-disc">
                <li>Each resample&apos;s training scores are sorted and initialized as individual clusters.</li>
                <li>Adjacent clusters are iteratively merged using Ward&apos;s minimum variance criterion, which minimizes the weighted squared distance between cluster means.</li>
                <li>Merging continues until exactly 5 clusters remain, corresponding to star levels 1–5.</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-medium text-foreground">5. Threshold Derivation</p>
              <ul className="space-y-1 pl-4 list-disc">
                <li>For higher-is-better measures: thresholds are the minimum score of clusters 2–5 (the lower boundary of each higher star band).</li>
                {data.inverted && (
                  <li>For this inverted measure (lower is better): thresholds are the maximum score of clusters in reverse order, so lower scores earn higher stars.</li>
                )}
                <li>The {data.methodology.foldCount} sets of thresholds are averaged to produce a single set of simulated cut points.</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-medium text-foreground">6. Guardrails</p>
              <ul className="space-y-1 pl-4 list-disc">
                <li>When a prior-year official cut point is available, each threshold is capped within ±5 points (on the 0–100 scale) or ±5% of the restricted range for non-percentage scales.</li>
                <li>This prevents large year-over-year cut point swings, matching the CMS stabilization approach.</li>
                <li>If no prior-year benchmark exists (e.g. the first available year), guardrails are skipped.</li>
              </ul>
            </div>

            <div>
              <p className="mb-1.5 font-medium text-foreground">7. Evaluation</p>
              <ul className="space-y-1 pl-4 list-disc">
                <li>Final simulated thresholds are forced into monotonic order and clamped to scale bounds.</li>
                <li>Each of the four thresholds (2★–5★) is compared to the actual published CMS cut point.</li>
                <li>Mean Absolute Error (MAE) = average of the four |simulated − actual| differences.</li>
                <li>Largest Gap = the single threshold with the highest absolute error.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, helper, accent }: { label: string; value: string; helper: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${accent ?? "text-foreground"}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
