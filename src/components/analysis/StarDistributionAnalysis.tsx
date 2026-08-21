"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import {
  formatScore,
  formatScoreDelta,
  periodCaption,
  scoreSliceForPeriod,
  sliceForPeriod,
} from "@/lib/star-distribution/stats";
import type {
  MetricMode,
  PeriodKey,
  RosterMode,
  StarDistributionResponse,
} from "@/lib/star-distribution/types";
import {
  AllMeasuresStarShareTable,
  BookRosterOrgsTable,
  SelectedMeasureYearTable,
  ShareStat,
  StarShareChart,
} from "./StarDistributionTables";
import {
  AllMeasuresScoreTable,
  SelectedMeasureScoreChart,
  SelectedMeasureScoreYearTable,
} from "./StarDistributionScorePanel";

const STAR_CATS = ["5★", "4★", "3★", "2★", "1★"] as const;
const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "last3W", label: "Last 3 yrs weighted" },
  { key: "last3", label: "Last 3 yrs raw" },
  { key: "all", label: "All years 2023–2026" },
  { key: "2026", label: "2026" },
  { key: "2025", label: "2025" },
  { key: "2024", label: "2024" },
  { key: "2023", label: "2023" },
];
const ROSTERS: Array<{ key: RosterMode; label: string }> = [
  { key: "combined", label: "Forecast + PP1" },
  { key: "forecast", label: "Forecast only" },
  { key: "pp1", label: "PP1 only" },
];
const METRICS: Array<{ key: MetricMode; label: string }> = [
  { key: "stars", label: "Star share" },
  { key: "scores", label: "Average score" },
];

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function fmtPp(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} pp`;
}

function defaultMeasure(data: StarDistributionResponse): string {
  return (
    data.measures.find((measure) => measure.name === "Breast Cancer Screening")
      ?.normalizedName ??
    data.measures[0]?.normalizedName ??
    ""
  );
}

function PillGroup<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Array<{ key: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              value === item.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StarDistributionAnalysis() {
  const [roster, setRoster] = useState<RosterMode>("combined");
  const [period, setPeriod] = useState<PeriodKey>("last3W");
  const [metric, setMetric] = useState<MetricMode>("stars");
  const [measureName, setMeasureName] = useState("breast cancer screening partc");
  const [data, setData] = useState<StarDistributionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/analysis/star-distribution?roster=${roster}`,
          { signal: controller.signal }
        );
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.details || payload.error || "Failed to load");
        }
        setData(payload as StarDistributionResponse);
        setMeasureName((current) => {
          const next = payload as StarDistributionResponse;
          if (next.measures.some((measure) => measure.normalizedName === current)) {
            return current;
          }
          return defaultMeasure(next);
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setIsLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [roster]);

  const selected = data?.measures.find((m) => m.normalizedName === measureName) ?? null;
  const slice = data ? sliceForPeriod(data, period, selected) : null;
  const scoreSlice = selected ? scoreSliceForPeriod(selected, period) : null;
  const caption = periodCaption(period, metric);

  const chartData = useMemo(() => {
    if (!slice) return [];
    return STAR_CATS.map((label, index) => {
      const starIndex = 4 - index;
      return {
        name: label,
        CMS: slice.cms.pct[starIndex],
        "Our book": slice.book.pct[starIndex],
      };
    });
  }, [slice]);

  const measureRows = useMemo(() => {
    if (!data) return [];
    return data.measures
      .map((measure) => ({
        measure,
        slice: sliceForPeriod(data, period, measure),
        score: scoreSliceForPeriod(measure, period),
      }))
      .filter((row) =>
        metric === "scores"
          ? row.score.book.n > 0 || row.score.cms.n > 0
          : row.slice.book.n > 0 || row.slice.cms.n > 0
      );
  }, [data, period, metric]);

  const scoreBetter =
    selected && scoreSlice
      ? selected.inverted
        ? scoreSlice.meanDelta <= 0
        : scoreSlice.meanDelta >= 0
      : true;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card p-4">
        <PillGroup label="Book roster" items={ROSTERS} value={roster} onChange={setRoster} />
        <PillGroup label="Window" items={PERIODS} value={period} onChange={setPeriod} />
        <PillGroup label="Show" items={METRICS} value={metric} onChange={setMetric} />
        <div className="min-w-[240px] flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Measure
          </label>
          <select
            value={measureName}
            onChange={(event) => setMeasureName(event.target.value)}
            className="fep-select w-full"
          >
            <option value="">All measures pooled</option>
            {(data?.measures ?? []).map((measure) => (
              <option key={measure.normalizedName} value={measure.normalizedName}>
                {measure.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {data ? (
        <p className="text-xs text-muted-foreground">
          Book is unique H+R contracts from forecast projections and Plan Preview
          uploads ({data.inventory.combined} combined
          {data.inventory.forecast ? ` · ${data.inventory.forecast} forecast` : ""}
          {data.inventory.pp1 ? ` · ${data.inventory.pp1} PP1` : ""}
          {data.inventory.both ? ` · ${data.inventory.both} in both` : ""}). Quality
          Improvement measures are excluded. {caption}.
        </p>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
          Loading book vs CMS…
        </div>
      ) : null}
      {error ? (
        <div className="fep-banner-error">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <p className="font-medium">Failed to load.</p>
          </div>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      {!isLoading && !error && data && slice ? (
        <>
          {metric === "stars" ? (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ShareStat
                  label="4-star: our book vs CMS"
                  value={`${fmtPct(slice.book.pct[3])} vs ${fmtPct(slice.cms.pct[3])}`}
                  helper={fmtPp(slice.fourStarDelta)}
                  positive={slice.fourStarDelta >= 0}
                />
                <ShareStat
                  label="5-star: our book vs CMS"
                  value={`${fmtPct(slice.book.pct[4])} vs ${fmtPct(slice.cms.pct[4])}`}
                  helper={fmtPp(slice.book.pct[4] - slice.cms.pct[4])}
                  positive={slice.book.pct[4] - slice.cms.pct[4] >= 0}
                />
                <ShareStat
                  label="4-star+: our book vs CMS"
                  value={`${fmtPct(slice.book.fourPlus)} vs ${fmtPct(slice.cms.fourPlus)}`}
                  helper={fmtPp(slice.fourPlusDelta)}
                  positive={slice.fourPlusDelta >= 0}
                />
                <ShareStat
                  label="Rated contracts: book / CMS"
                  value={`${slice.book.n.toLocaleString()} / ${slice.cms.n.toLocaleString()}`}
                  helper={selected ? selected.name : "All measures pooled"}
                />
              </section>

              <StarShareChart
                title={
                  selected
                    ? `${selected.name} — share of contracts`
                    : "Measure-star share, our book vs CMS"
                }
                caption={`Source: published measure stars · ${caption}`}
                data={chartData}
              />

              {selected ? <SelectedMeasureYearTable measure={selected} /> : null}
              {measureRows.length > 0 ? (
                <AllMeasuresStarShareTable
                  rows={measureRows}
                  caption={caption}
                  roster={roster}
                  period={period}
                  selectedName={selected?.normalizedName ?? null}
                  onSelect={setMeasureName}
                />
              ) : null}
            </>
          ) : (
            <>
              {selected && scoreSlice ? (
                <>
                  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <ShareStat
                      label="Average score: our book vs CMS"
                      value={`${
                        scoreSlice.book.n === 0 ? "—" : formatScore(scoreSlice.book.mean)
                      } vs ${
                        scoreSlice.cms.n === 0 ? "—" : formatScore(scoreSlice.cms.mean)
                      }`}
                      helper={selected.inverted ? "Lower scores are better" : selected.name}
                      positive={
                        scoreSlice.book.n === 0 || scoreSlice.cms.n === 0
                          ? undefined
                          : scoreBetter
                      }
                    />
                    <ShareStat
                      label="Difference (book − CMS)"
                      value={
                        scoreSlice.book.n === 0 || scoreSlice.cms.n === 0
                          ? "—"
                          : formatScoreDelta(scoreSlice.meanDelta)
                      }
                      helper={selected.inverted ? "Negative is better" : "Positive is better"}
                      positive={
                        scoreSlice.book.n === 0 || scoreSlice.cms.n === 0
                          ? undefined
                          : scoreBetter
                      }
                    />
                    <ShareStat
                      label="Rated contracts: book / CMS"
                      value={`${scoreSlice.book.n.toLocaleString()} / ${scoreSlice.cms.n.toLocaleString()}`}
                      helper={caption}
                    />
                  </section>
                  <SelectedMeasureScoreChart measure={selected} caption={caption} />
                  <SelectedMeasureScoreYearTable measure={selected} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Average scores are not pooled across measures because each measure
                  uses its own scale. Select a measure, or use the table below.
                </p>
              )}
              {measureRows.length > 0 ? (
                <AllMeasuresScoreTable
                  rows={measureRows}
                  caption={caption}
                  roster={roster}
                  period={period}
                  selectedName={selected?.normalizedName ?? null}
                  onSelect={setMeasureName}
                />
              ) : null}
            </>
          )}

          <BookRosterOrgsTable orgs={data.orgs} />
        </>
      ) : null}
    </div>
  );
}
