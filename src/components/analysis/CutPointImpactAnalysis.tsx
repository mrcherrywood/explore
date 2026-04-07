"use client";

import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import { AlertTriangle, TrendingUp, Info, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import {
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

type StarRating = 1 | 2 | 3 | 4 | 5;
type ThresholdKey = "twoStar" | "threeStar" | "fourStar" | "fiveStar";

type PerFromScoreRow = {
  fromScore: number;
  cohortSize: number;
  avgScoreChange: number | null;
};

type CutPointImpactRow = {
  fromYear: number;
  toYear: number;
  cohortSize: number;
  avgScoreChange: number | null;
  cutPointDelta: number;
  cutPointFrom: number;
  cutPointTo: number;
  distributionMeanFrom: number | null;
  distributionMeanTo: number | null;
  perFromScore: PerFromScoreRow[];
};

type LinearFit = {
  slope: number;
  intercept: number;
  r: number;
  rSquared: number;
  n: number;
};

type ProjectionConfidence = "reasonable" | "low" | "suppressed";
type ProjectionWarning = { code: string; message: string };
type ProjectionMethod = "blended" | "regression_only" | "forecast_only";

type CutPointImpactSummary = {
  thresholdKey: ThresholdKey;
  thresholdLabel: string;
  starLevel: StarRating;
  dataPoints: CutPointImpactRow[];
  fit: LinearFit | null;
  latestCutPoint: number | null;
  latestAvgScoreChange: number | null;
  projectedNextCutPoint: number | null;
  projectedDelta: number | null;
  projectionConfidence: ProjectionConfidence;
  projectionWarnings: ProjectionWarning[];
  projectionMethod: ProjectionMethod | null;
  regressionOnlyProjection: number | null;
  forecastCutPoints: { year: number; value: number }[];
};

type HistoricalCutPointYear = {
  year: number;
  thresholds: Record<ThresholdKey, number>;
};

type CutPointImpactResponse = {
  measure: string;
  displayName: string;
  perBand: CutPointImpactSummary[];
  historicalCutPoints: HistoricalCutPointYear[];
  transitionCount: number;
  projectionYear: number;
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

function fmtTick(v: number): string {
  return Number(v.toFixed(2)).toString();
}

function roundDown(v: number): number {
  return Math.floor(v * 10) / 10;
}

function roundUp(v: number): number {
  return Math.ceil(v * 10) / 10;
}

function fmtDelta(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v}`;
}

function fmtR(r: number | null | undefined): string {
  if (r == null) return "—";
  return r.toFixed(2);
}

function formatFromScoreLabel(s: number): string {
  const r = Math.round(s * 10) / 10;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(1);
}

function collectFromScoresForBand(band: CutPointImpactSummary): number[] {
  const set = new Set<number>();
  for (const dp of band.dataPoints) {
    for (const row of dp.perFromScore ?? []) {
      set.add(row.fromScore);
    }
  }
  return [...set].sort((a, b) => b - a);
}

function lookupPerFromScore(dp: CutPointImpactRow | undefined, score: number): PerFromScoreRow | undefined {
  return dp?.perFromScore?.find((r) => r.fromScore === score);
}

export function CutPointImpactAnalysis({ measure, displayName }: Props) {
  const [data, setData] = useState<CutPointImpactResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: "cut-point-impact", measure });
      const res = await fetch(`/api/analysis/band-movement?${params}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setIsLoading(false);
    }
  }, [measure]);

  useEffect(() => {
    if (measure) fetchData();
  }, [measure, fetchData]);

  if (isLoading) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading cut point impact analysis...</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-3 text-red-400"><AlertTriangle className="h-5 w-5" /><span className="font-medium">Failed to load.</span></div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data || data.perBand.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        No cut point impact data available for this measure.
      </div>
    );
  }

  const hasProjections = data.perBand.some((b) => b.projectedNextCutPoint !== null || b.projectionConfidence === "suppressed");

  return (
    <div className="space-y-6">
      <CaveatsBanner transitionCount={data.transitionCount} />

      {hasProjections && (
        <ProjectionCards perBand={data.perBand} displayName={displayName} projectionYear={data.projectionYear} />
      )}

      {data.historicalCutPoints.length > 1 && (
        <HistoricalTrendChart
          historicalCutPoints={data.historicalCutPoints}
          perBand={data.perBand}
          displayName={displayName}
          projectionYear={data.projectionYear}
        />
      )}

      <CorrelationTable perBand={data.perBand} />

      <ScatterPlots perBand={data.perBand} displayName={displayName} />
    </div>
  );
}

function CaveatsBanner({ transitionCount }: { transitionCount: number }) {
  const [showMethodology, setShowMethodology] = useState(false);

  return (
    <div className="space-y-0 rounded-2xl border border-amber-500/30 bg-amber-500/5">
      <div className="flex gap-3 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Directional analysis only</p>
          <p className="mt-1">
            Based on {transitionCount} year-over-year transition{transitionCount !== 1 ? "s" : ""}.
            With limited data points, correlations and projections are directional indicators,
            not statistically robust predictions. CMS sets cut points based on the national
            distribution and policy considerations beyond score movement alone.
          </p>
          <button
            onClick={() => setShowMethodology(!showMethodology)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            How is this calculated?
            {showMethodology ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {showMethodology && (
        <div className="border-t border-amber-500/20 px-4 pb-5 pt-4">
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground">What this analysis does</p>
              <p className="mt-1">
                This view examines the historical relationship between how contract scores
                move year-over-year and how CMS adjusts cut points. If contracts are
                improving on a measure, CMS tends to raise the bar — this analysis
                quantifies that pattern and uses it to project where cut points may head next.
              </p>
            </div>

            <div>
              <p className="font-semibold text-foreground">Per-band cohort analysis</p>
              <p className="mt-1">
                For each star threshold (2★ through 5★), we take the cohort of H+R contracts
                that held that star rating in the &ldquo;from&rdquo; year. We compute the
                average score change for those contracts into the next year, then pair it
                with how much the corresponding CMS cut point changed. This is done for each
                available transition (e.g. 2023→2024, 2024→2025, 2025→2026).
              </p>
            </div>

            <div>
              <p className="font-semibold text-foreground">Score Movement vs Cut Point Change table</p>
              <p className="mt-1">
                Each row is one star threshold. For each transition you see two values:
              </p>
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                <li><strong>Avg Δ Score</strong> — the weighted average score change across all
                  contracts in that star band (improved + held + declined), with the
                  cohort size in parentheses.</li>
                <li><strong>Δ Cut Pt</strong> — how many points the CMS cut point for
                  that threshold moved (green = decreased, red = increased).</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-foreground">Score-level detail (expand rows)</p>
              <p className="mt-1">
                Each star band can be expanded to show average score change for contracts
                grouped by their numeric score in the starting year (for example every
                observed value in the 4★ band). Only contracts with a score in both years
                are included; similar raw scores are rounded to one decimal for grouping.
              </p>
            </div>

            <div>
              <p className="font-semibold text-foreground">Slope and r (correlation)</p>
              <p className="mt-1">
                A simple linear regression is fit to the data points (avg score change → cut
                point delta). <strong>Slope</strong> tells you how much the cut point tends
                to move for each 1-point shift in the cohort average — a slope of 0.5 means
                &ldquo;for every +1 in avg score, the cut point moves +0.5.&rdquo;&ensp;
                <strong>r</strong> (Pearson correlation) measures how tightly these two
                variables track: values near ±1 indicate a strong linear relationship,
                near 0 indicates little relationship. With only {transitionCount} data
                point{transitionCount !== 1 ? "s" : ""}, treat these as directional.
              </p>
            </div>

            <div>
              <p className="font-semibold text-foreground">Scatter plots</p>
              <p className="mt-1">
                Each chart plots the same data visually — every dot is one year-over-year
                transition with avg score change on the X-axis and the corresponding cut
                point delta on the Y-axis. The dashed line is the linear trend. If the dots
                cluster tightly along the line, score movement is a strong signal for cut
                point movement.
              </p>
            </div>

            <div>
              <p className="font-semibold text-foreground">Projected cut points</p>
              <p className="mt-1">
                Projections apply the fitted slope + intercept to the most recent
                transition&apos;s avg score change, then add the resulting delta to the
                current cut point value. If workbook forecasts exist for 2027/2028,
                they are shown alongside for comparison.
              </p>
            </div>

            <div>
              <p className="font-semibold text-foreground">Historical cut point trend</p>
              <p className="mt-1">
                The line chart shows actual CMS cut points for this measure from 2016 through
                2026, loaded from the cut points workbook. This provides context for the
                longer-term trajectory of each threshold — whether cut points have been
                steadily rising, flat, or volatile — independent of the score-movement
                regression. Regression-based projections are shown as dashed extensions
                beyond the last actual year.
              </p>
            </div>

            <div>
              <p className="font-semibold text-foreground">Limitations</p>
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                <li>Only {transitionCount} transition{transitionCount !== 1 ? "s are" : " is"} available — too few for statistical significance.</li>
                <li>CMS considers policy, measure specification changes, and clustering
                  algorithms beyond raw score movement when setting cut points.</li>
                <li>Inverted measures (complaints, readmissions) have scores that move in the
                  opposite direction from &ldquo;better&rdquo; — the analysis uses raw deltas
                  which may look counterintuitive for those measures.</li>
                <li>Contracts that exited the market (&ldquo;dropped&rdquo;) are excluded
                  from the cohort since they have no next-year score.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectionCards({ perBand, displayName, projectionYear }: { perBand: CutPointImpactSummary[]; displayName: string; projectionYear: number }) {
  const showable = perBand.filter((b) => b.projectedNextCutPoint !== null || b.projectionConfidence === "suppressed");
  if (showable.length === 0) return null;

  const confidenceBorder: Record<ProjectionConfidence, string> = {
    reasonable: "border-border",
    low: "border-border",
    suppressed: "border-rose-500/30",
  };

  const confidenceLabel: Record<ProjectionConfidence, { text: string; color: string }> = {
    reasonable: { text: "", color: "" },
    low: { text: "", color: "" },
    suppressed: { text: "Suppressed", color: "text-rose-500" },
  };

  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold text-foreground">
        Projected {projectionYear} Cut Points
        <span className="ml-2 text-xs font-normal text-muted-foreground">{displayName}</span>
      </h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {showable.map((band) => {
          const forecast = band.forecastCutPoints[0];
          const isSuppressed = band.projectionConfidence === "suppressed";
          const badge = confidenceLabel[band.projectionConfidence];

          return (
            <div key={band.thresholdKey} className={`rounded-2xl border bg-muted/40 p-4 ${confidenceBorder[band.projectionConfidence]}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {band.thresholdLabel} Threshold — {projectionYear}
                </p>
                {badge.text && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${badge.color}`}>
                    {badge.text}
                  </span>
                )}
              </div>

              {isSuppressed ? (
                <p className="mt-2 text-lg text-muted-foreground line-through decoration-rose-500/50">
                  {band.latestCutPoint != null && band.projectedDelta != null
                    ? (band.latestCutPoint + band.projectedDelta).toFixed(2)
                    : "—"}
                </p>
              ) : (
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {band.projectedNextCutPoint?.toFixed(2)}
                </p>
              )}

              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>
                  Current ({projectionYear - 1}): {band.latestCutPoint?.toFixed(2)}
                  {!isSuppressed && band.projectedDelta != null && (
                    <span className="ml-1">(Δ {fmtDelta(band.projectedDelta)})</span>
                  )}
                </p>
                {!isSuppressed && band.projectionMethod === "blended" && forecast && (
                  <p className="text-[11px]">
                    Forecast: {forecast.value.toFixed(2)} · Regression: {band.regressionOnlyProjection?.toFixed(2)}
                  </p>
                )}
                {!isSuppressed && band.projectionMethod === "regression_only" && band.fit && (
                  <p>Based on avg score change of {fmtDelta(band.latestAvgScoreChange)} pts (r={fmtR(band.fit.r)})</p>
                )}
                {!isSuppressed && band.projectionMethod === "forecast_only" && forecast && (
                  <p>Based on workbook forecast (no regression adjustment)</p>
                )}
                {isSuppressed && forecast && (
                  <p>Workbook forecast ({forecast.year}): {forecast.value.toFixed(2)}</p>
                )}
                {band.projectionWarnings.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {band.projectionWarnings.map((w) => (
                      <p key={w.code} className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {w.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HistoricalTrendChart({
  historicalCutPoints,
  perBand,
  displayName,
  projectionYear,
}: {
  historicalCutPoints: HistoricalCutPointYear[];
  perBand: CutPointImpactSummary[];
  displayName: string;
  projectionYear: number;
}) {
  const THRESHOLD_META: { key: ThresholdKey; label: string; color: string }[] = [
    { key: "twoStar", label: "2★", color: STAR_COLORS["2"] },
    { key: "threeStar", label: "3★", color: STAR_COLORS["3"] },
    { key: "fourStar", label: "4★", color: STAR_COLORS["4"] },
    { key: "fiveStar", label: "5★", color: STAR_COLORS["5"] },
  ];

  type ChartRow = Record<string, number | undefined> & { year: number };
  const rows: ChartRow[] = historicalCutPoints.map((h) => ({
    year: h.year,
    twoStar: h.thresholds.twoStar,
    threeStar: h.thresholds.threeStar,
    fourStar: h.thresholds.fourStar,
    fiveStar: h.thresholds.fiveStar,
  }));

  const lastHistoricalYear = historicalCutPoints[historicalCutPoints.length - 1]?.year ?? projectionYear - 1;
  const lastHistorical = rows[rows.length - 1];

  const projections = perBand.filter((b) => b.projectedNextCutPoint !== null);
  const hasProjectionSegment = projections.length > 0;

  if (hasProjectionSegment && lastHistorical) {
    for (const b of projections) {
      lastHistorical[`${b.thresholdKey}Proj`] = lastHistorical[b.thresholdKey];
    }
    const projRow: ChartRow = { year: projectionYear };
    for (const b of projections) {
      projRow[`${b.thresholdKey}Proj`] = b.projectedNextCutPoint!;
    }
    rows.push(projRow);
  }

  rows.sort((a, b) => a.year - b.year);

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Historical Cut Point Trend</h3>
        <p className="text-xs text-muted-foreground">
          {displayName} — actual CMS cut points {historicalCutPoints[0]?.year}–{lastHistoricalYear}
          {projections.length > 0 && <>, with {projectionYear} projections (dashed)</>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-3">
        {THRESHOLD_META.map((t) => (
          <span key={t.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
            {t.label}
          </span>
        ))}
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground)"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickCount={rows.length}
              allowDecimals={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground)"
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{ value: "Cut Point", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "var(--color-muted-foreground)" }}
            />
            <Tooltip
              content={({ payload, label }) => {
                if (!payload?.length) return null;
                const yr = label as number;
                const isProjection = yr === projectionYear;
                return (
                  <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-md">
                    <p className="font-medium">{yr}{isProjection ? " (projected)" : ""}</p>
                    {[...THRESHOLD_META].reverse().map((t) => {
                      const actual = payload.find((p) => p.dataKey === t.key);
                      const proj = payload.find((p) => p.dataKey === `${t.key}Proj`);
                      const entry = actual?.value != null ? actual : proj;
                      if (!entry?.value) return null;
                      return (
                        <p key={t.key} style={{ color: t.color }}>
                          {t.label}: {Number(entry.value).toFixed(2)}
                          {proj?.value != null && actual?.value == null ? " (proj)" : ""}
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            {hasProjectionSegment && (
              <ReferenceLine
                x={lastHistoricalYear}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 4"
                strokeOpacity={0.4}
              />
            )}
            {THRESHOLD_META.map((t) => (
              <Line
                key={t.key}
                type="monotone"
                dataKey={t.key}
                stroke={t.color}
                strokeWidth={2}
                dot={{ r: 3, fill: t.color }}
                connectNulls
                activeDot={{ r: 5 }}
              />
            ))}
            {hasProjectionSegment && THRESHOLD_META.map((t) => (
              <Line
                key={`${t.key}Proj`}
                type="monotone"
                dataKey={`${t.key}Proj`}
                stroke={t.color}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: t.color, strokeDasharray: "none" }}
                connectNulls
                activeDot={{ r: 5 }}
                legendType="none"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function CorrelationTable({ perBand }: { perBand: CutPointImpactSummary[] }) {
  const [openBands, setOpenBands] = useState<Set<string>>(() => new Set());
  const tableRef = useRef<HTMLTableElement>(null);

  const toggleBand = (key: string) => {
    setOpenBands((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allTransitions = perBand.flatMap((b) => b.dataPoints);
  const transitionLabels = [...new Set(allTransitions.map((d) => `${d.fromYear}→${d.toYear}`))].sort();
  const noteColSpan = 1 + transitionLabels.length * 2 + 2;

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="mb-1 text-base font-semibold text-foreground">Score Movement vs Cut Point Change</h3>
          <p className="text-xs text-muted-foreground">
            Per-band cohort avg score change paired with the corresponding cut point delta.
            Use the chevron on a row to see average change by starting score within that band.
          </p>
        </div>
        <ExportCsvButton tableRef={tableRef} fileName="cut-point-impact-correlation" />
      </div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left" title="Star rating threshold (2★–5★)">Threshold</th>
              {transitionLabels.map((label) => (
                <th key={label} className="border-b border-muted-foreground/40 px-3 py-2 text-center" colSpan={2} title={`Score movement and cut point change for the ${label} transition`}>{label}</th>
              ))}
              <th className="px-3 py-2 text-right" title="Linear regression slope: predicted score change per 1-point cut point change. Negative slope means rising cut points correlate with declining scores.">Slope</th>
              <th className="px-3 py-2 text-right" title="Pearson correlation coefficient between score changes and cut point changes. Values near ±1 indicate strong linear relationship.">r</th>
            </tr>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-3 py-1" />
              {transitionLabels.map((label) => (
                <Fragment key={label}>
                  <th className="px-3 py-1 text-right font-normal" title="Average score change for contracts in this band (count in parentheses)">Avg Δ Score</th>
                  <th className="px-3 py-1 text-right font-normal" title="Change in CMS cut point for this threshold (positive = harder to achieve)">Δ Cut Pt</th>
                </Fragment>
              ))}
              <th className="px-3 py-1" />
              <th className="px-3 py-1" />
            </tr>
          </thead>
          <tbody>
            {[...perBand].reverse().map((band) => {
              const fromScores = collectFromScoresForBand(band);
              const hasScoreDetail = fromScores.length > 0;
              const isOpen = openBands.has(band.thresholdKey);

              return (
                <Fragment key={band.thresholdKey}>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {hasScoreDetail ? (
                          <button
                            type="button"
                            onClick={() => toggleBand(band.thresholdKey)}
                            className="inline-flex shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? `Hide score breakdown for ${band.thresholdLabel}` : `Show score breakdown for ${band.thresholdLabel}`}
                          >
                            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                          </button>
                        ) : (
                          <span className="inline-block w-6 shrink-0" aria-hidden />
                        )}
                        <span className="font-medium" style={{ color: STAR_COLORS[String(band.starLevel)] }}>
                          {band.thresholdLabel}
                        </span>
                      </div>
                    </td>
                    {transitionLabels.map((label) => {
                      const dp = band.dataPoints.find((d) => `${d.fromYear}→${d.toYear}` === label);
                      return (
                        <Fragment key={label}>
                          <td className="px-3 py-2 text-right">
                            {dp ? fmtDelta(dp.avgScoreChange) : "—"}
                            {dp?.cohortSize != null && <span className="ml-1 text-xs text-muted-foreground">({dp.cohortSize})</span>}
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold ${
                            dp ? (dp.cutPointDelta > 0 ? "text-rose-500" : dp.cutPointDelta < 0 ? "text-emerald-500" : "text-muted-foreground") : ""
                          }`}>
                            {dp ? fmtDelta(dp.cutPointDelta) : "—"}
                          </td>
                        </Fragment>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {band.fit ? band.fit.slope.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {band.fit ? fmtR(band.fit.r) : "—"}
                    </td>
                  </tr>
                  {isOpen && hasScoreDetail && (
                    <>
                      <tr className="border-b border-border/40 bg-muted/25">
                        <td colSpan={noteColSpan} className="px-3 py-2 text-xs text-muted-foreground">
                          Average score change by starting score (contracts in this band in the from-year). Δ Cut Pt matches the band row above for each period.
                        </td>
                      </tr>
                      {fromScores.map((score) => (
                        <tr key={score} className="border-b border-border/50 bg-muted/25">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-6 shrink-0" aria-hidden />
                              <span
                                className="font-mono text-sm tabular-nums"
                                style={{ color: STAR_COLORS[String(band.starLevel)] }}
                                title="Numeric measure score in the from-year"
                              >
                                {formatFromScoreLabel(score)}
                              </span>
                            </div>
                          </td>
                          {transitionLabels.map((label) => {
                            const dp = band.dataPoints.find((d) => `${d.fromYear}→${d.toYear}` === label);
                            const sub = lookupPerFromScore(dp, score);
                            return (
                              <Fragment key={label}>
                                <td className="px-3 py-2 text-right tabular-nums text-sm" title={`Avg score change (${label}) for contracts that started at this score`}>
                                  {sub ? (
                                    <>
                                      {fmtDelta(sub.avgScoreChange)}
                                      <span className="ml-1 text-xs text-muted-foreground">({sub.cohortSize})</span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td
                                  className={`px-3 py-2 text-right text-sm font-semibold tabular-nums ${
                                    dp
                                      ? dp.cutPointDelta > 0
                                        ? "text-rose-500"
                                        : dp.cutPointDelta < 0
                                          ? "text-emerald-500"
                                          : "text-muted-foreground"
                                      : ""
                                  }`}
                                  title="Same cut point change as the band summary row"
                                >
                                  {dp ? fmtDelta(dp.cutPointDelta) : "—"}
                                </td>
                              </Fragment>
                            );
                          })}
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">—</td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">—</td>
                        </tr>
                      ))}
                    </>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyDot() {
  return <circle r={0} />;
}

function ScatterPlots({ perBand, displayName }: { perBand: CutPointImpactSummary[]; displayName: string }) {
  const bandsWithData = perBand.filter((b) => b.dataPoints.length >= 2);
  if (bandsWithData.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-sky-400" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Score Change vs Cut Point Movement</h3>
          <p className="text-xs text-muted-foreground">{displayName} — each dot is one year-over-year transition</p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {[...bandsWithData].reverse().map((band) => {
          const points = band.dataPoints
            .filter((d) => d.avgScoreChange !== null)
            .map((d) => ({
              x: d.avgScoreChange!,
              y: d.cutPointDelta,
              label: `${d.fromYear}→${d.toYear}`,
            }));

          const allX = points.map((p) => p.x);
          const allY = points.map((p) => p.y);

          let trendLinePoints: { x: number; y: number }[] = [];
          if (band.fit) {
            const dataXMin = Math.min(...allX);
            const dataXMax = Math.max(...allX);
            const xPadTrend = Math.max((dataXMax - dataXMin) * 0.3, 0.5);
            const x1 = dataXMin - xPadTrend;
            const x2 = dataXMax + xPadTrend;
            trendLinePoints = [
              { x: x1, y: band.fit.slope * x1 + band.fit.intercept },
              { x: x2, y: band.fit.slope * x2 + band.fit.intercept },
            ];
          }

          const domainX = [...allX, ...trendLinePoints.map((p) => p.x)];
          const domainY = [...allY, ...trendLinePoints.map((p) => p.y)];
          const xMin = Math.min(...domainX);
          const xMax = Math.max(...domainX);
          const yMin = Math.min(...domainY);
          const yMax = Math.max(...domainY);
          const xPad = Math.max((xMax - xMin) * 0.1, 0.2);
          const yPad = Math.max((yMax - yMin) * 0.1, 0.2);

          return (
            <div key={band.thresholdKey}>
              <p className="mb-2 text-sm font-medium" style={{ color: STAR_COLORS[String(band.starLevel)] }}>
                {band.thresholdLabel} Threshold
                {band.fit && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    r={fmtR(band.fit.r)} · slope={band.fit.slope.toFixed(2)}
                  </span>
                )}
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name="Avg Score Δ"
                      domain={[roundDown(xMin - xPad), roundUp(xMax + xPad)]}
                      tickFormatter={fmtTick}
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                      label={{ value: "Avg Score Change", position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name="Cut Point Δ"
                      domain={[roundDown(yMin - yPad), roundUp(yMax + yPad)]}
                      tickFormatter={fmtTick}
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                      label={{ value: "Cut Point Δ", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const entry = payload.find((e) => (e.payload as { label?: string })?.label);
                        const p = entry?.payload as { x: number; y: number; label: string } | undefined;
                        if (!p) return null;
                        return (
                          <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-md">
                            <p className="font-medium">{p.label}</p>
                            <p>Avg Score Δ: {fmtDelta(p.x)}</p>
                            <p>Cut Point Δ: {fmtDelta(p.y)}</p>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={0} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.5} />
                    <ReferenceLine x={0} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.5} />
                    {trendLinePoints.length === 2 && (
                      <Scatter
                        data={trendLinePoints}
                        fill="none"
                        line={{ stroke: STAR_COLORS[String(band.starLevel)], strokeWidth: 1, strokeDasharray: "6 3" }}
                        shape={<EmptyDot />}
                        legendType="none"
                        isAnimationActive={false}
                      />
                    )}
                    <Scatter
                      data={points}
                      fill={STAR_COLORS[String(band.starLevel)]}
                      fillOpacity={0.8}
                      shape={(props: { cx?: number; cy?: number; payload?: { label?: string } }) => {
                        const { cx = 0, cy = 0, payload } = props;
                        return (
                          <g>
                            <circle cx={cx} cy={cy} r={6} fill={STAR_COLORS[String(band.starLevel)]} fillOpacity={0.8} />
                            {payload?.label && (
                              <text x={cx} y={cy - 10} textAnchor="middle" fontSize={10} fill="var(--color-foreground)">
                                {payload.label}
                              </text>
                            )}
                          </g>
                        );
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

