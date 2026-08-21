"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Info,
  Users,
} from "lucide-react";

import { RosterAccuracyCurve } from "./RosterAccuracyCurve";

type ForecastPopulationMode = "full_market" | "client_only";

type ForecastThreshold = {
  key: "twoStar" | "threeStar" | "fourStar" | "fiveStar";
  label: string;
  projected: number;
  comparisonActual: number | null;
  deltaVsComparison: number | null;
  absDeltaVsComparison: number | null;
  rawSimulated: number | null;
  baselineSimulated: number | null;
  anchoredMovement: number | null;
  movementCap: number | null;
  movementWasCapped: boolean;
};

type HistoricalMovementAudit = {
  warningCount: number;
};

type ForecastReadyResponse = {
  status: "ready";
  measure: string;
  displayName: string;
  forecastYear: number;
  comparisonYear: number | null;
  inverted: boolean;
  sampleSize: number;
  rawSampleSize: number;
  resampleRuns: number;
  outliersRemoved: number;
  tukeyApplied: boolean;
  guardrailsApplied: boolean;
  guardrailCap: number | null;
  thresholds: ForecastThreshold[];
  historicalMovement: HistoricalMovementAudit | null;
  notes: string[];
  availableForecastYears: number[];
  populationMode: ForecastPopulationMode;
  runId: string | null;
  runStatus: "draft" | "approved" | null;
  approvalScope: "run" | "measure" | null;
  approvedAt: string | null;
  baselineYear: number | null;
  projectedContractCount: number | null;
  pp1OverlayCount: number | null;
  manualThresholds: ForecastThreshold[] | null;
  methodology: {
    method: "clustering" | "cahps-percentile";
    foldCount: number;
    seed: number;
    tukeyStartsIn: number;
    exclusions: string[];
  };
};

type ForecastUnavailableResponse = {
  status: "unavailable";
  measure: string;
  displayName: string;
  forecastYear: number;
  reason: string;
  availableForecastYears: number[];
  populationMode: ForecastPopulationMode;
  runId: string | null;
  runStatus: "draft" | "approved" | null;
  approvalScope: "run" | "measure" | null;
  approvedAt: string | null;
  baselineYear: number | null;
  projectedContractCount: number | null;
  pp1OverlayCount: number | null;
  manualThresholds: ForecastThreshold[] | null;
};

type ForecastUnsupportedResponse = {
  status: "unsupported";
  measure: string;
  displayName: string;
  reason: string;
  availableForecastYears: number[];
  populationMode: ForecastPopulationMode;
  runId: string | null;
  runStatus: "draft" | "approved" | null;
  approvalScope: "run" | "measure" | null;
  approvedAt: string | null;
  baselineYear: number | null;
  projectedContractCount: number | null;
  pp1OverlayCount: number | null;
  manualThresholds: ForecastThreshold[] | null;
};

type ForecastResponse =
  | ForecastReadyResponse
  | ForecastUnavailableResponse
  | ForecastUnsupportedResponse;

type Props = {
  measure: string;
  displayName: string;
  /** Hide when already shown by the parent (e.g. CMS Backtest embed). */
  showRosterAccuracyCurve?: boolean;
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

async function fetchForecast(
  measure: string,
  forecastYear: number | null,
  populationMode: ForecastPopulationMode,
): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    view: "methodology-forecast",
    measure,
    populationMode,
  });
  if (forecastYear !== null) params.set("forecastYear", String(forecastYear));

  const response = await fetch(`/api/analysis/band-movement?${params}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && payload?.status !== "unsupported") {
    throw new Error(payload?.error ?? "Failed to load forecast");
  }
  return payload;
}

function fmtDelta(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function deltaClass(value: number | null) {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-rose-500";
  if (value < 0) return "text-emerald-500";
  return "text-muted-foreground";
}

export function CutPointForecastAnalysis({
  measure,
  displayName,
  showRosterAccuracyCurve = true,
}: Props) {
  const [fullMarket, setFullMarket] = useState<ForecastResponse | null>(null);
  const [clientOnly, setClientOnly] = useState<ForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showMethodNotes, setShowMethodNotes] = useState(false);

  const loadForecast = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [fullMarketPayload, clientOnlyPayload] = await Promise.all([
        fetchForecast(measure, selectedYear, "full_market"),
        fetchForecast(measure, selectedYear, "client_only"),
      ]);
      setFullMarket(fullMarketPayload);
      setClientOnly(clientOnlyPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load forecast");
    } finally {
      setIsLoading(false);
    }
  }, [measure, selectedYear]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  useEffect(() => {
    const years = fullMarket?.availableForecastYears ?? [];
    if (years.length === 0) return;
    if (selectedYear === null || !years.includes(selectedYear)) {
      setSelectedYear(years[0]);
    }
  }, [fullMarket, selectedYear]);

  const fullMarketReady =
    fullMarket?.status === "ready" ? fullMarket : null;
  const clientOnlyReady =
    clientOnly?.status === "ready" ? clientOnly : null;
  const primary = fullMarket ?? clientOnly;
  const manualThresholds =
    (fullMarketReady ?? clientOnlyReady)?.manualThresholds ??
    (fullMarket?.status !== "ready" ? fullMarket?.manualThresholds : null) ??
    (clientOnly?.status !== "ready" ? clientOnly?.manualThresholds : null) ??
    null;

  const thresholdRows = useMemo(() => {
    const source = fullMarketReady ?? clientOnlyReady;
    if (!source && !manualThresholds?.length) return [];
    const order = ["fiveStar", "fourStar", "threeStar", "twoStar"];
    const keys = source
      ? [...source.thresholds]
          .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
          .map((threshold) => threshold.key)
      : [...(manualThresholds ?? [])]
          .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
          .map((threshold) => threshold.key);
    return keys.map((key) => {
      const full = fullMarketReady?.thresholds.find((item) => item.key === key);
      const client = clientOnlyReady?.thresholds.find((item) => item.key === key);
      const manual = manualThresholds?.find((item) => item.key === key) ?? null;
      return {
        key,
        label:
          full?.label ??
          client?.label ??
          manual?.label ??
          key,
        comparisonActual:
          full?.comparisonActual ??
          client?.comparisonActual ??
          manual?.comparisonActual ??
          null,
        fullMarket: full ?? null,
        clientOnly: client ?? null,
        manual,
      };
    });
  }, [clientOnlyReady, fullMarketReady, manualThresholds]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Loading projected cut points...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-3 text-red-400">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Failed to load.</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!primary) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        No forecast data available.
      </div>
    );
  }

  const unavailable =
    fullMarket?.status === "unavailable"
      ? fullMarket
      : clientOnly?.status === "unavailable"
        ? clientOnly
        : null;
  const unsupported =
    fullMarket?.status === "unsupported"
      ? fullMarket
      : clientOnly?.status === "unsupported"
        ? clientOnly
        : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Forecast Year
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(primary.availableForecastYears ?? []).map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setSelectedYear(year)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    selectedYear === year
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
            {displayName}
            {fullMarketReady?.baselineYear !== null &&
            fullMarketReady?.baselineYear !== undefined
              ? ` · overlaying projected client scores onto the ${fullMarketReady.baselineYear} market baseline`
              : ""}
          </p>
        </div>
      </section>

      {unsupported && !fullMarketReady && !clientOnlyReady && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Forecast unavailable for this measure
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {unsupported.reason}
              </p>
            </div>
          </div>
        </div>
      )}

      {unavailable && !fullMarketReady && !clientOnlyReady && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--fep-accent)]" />
            <div>
              <h3 className="text-base font-semibold text-foreground">
                No approved forecast is ready yet
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {unavailable.reason}
              </p>
            </div>
          </div>
        </div>
      )}

      {(fullMarketReady || clientOnlyReady || manualThresholds) && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ForecastCard
              label="Full Market"
              value={String(fullMarketReady?.sampleSize ?? "—")}
              helper={
                fullMarketReady?.projectedContractCount &&
                fullMarketReady.projectedContractCount > 0
                  ? fullMarketReady.pp1OverlayCount &&
                    fullMarketReady.pp1OverlayCount > 0
                    ? `${fullMarketReady.projectedContractCount} client projections + ${fullMarketReady.pp1OverlayCount} Plan Preview fills`
                    : `${fullMarketReady.projectedContractCount} approved client projections overlaid`
                  : "Projected population size"
              }
            />
            <ForecastCard
              label="Client Only"
              value={String(clientOnlyReady?.sampleSize ?? "—")}
              helper={
                clientOnlyReady?.pp1OverlayCount &&
                clientOnlyReady.pp1OverlayCount > 0
                  ? `PP1 + projections (${clientOnlyReady.pp1OverlayCount} Plan Preview fills)`
                  : "PP1 + projections"
              }
              accent="text-[var(--fep-accent)]"
            />
            <ForecastCard
              label="Manual"
              value={
                manualThresholds && manualThresholds.length > 0
                  ? String(manualThresholds.length)
                  : "—"
              }
              helper="Workbook forecast (official)"
            />
            <ForecastCard
              label="Comparison Year"
              value={
                (fullMarketReady ?? clientOnlyReady)?.comparisonYear === null
                  ? "—"
                  : String(
                      (fullMarketReady ?? clientOnlyReady)?.comparisonYear,
                    )
              }
              helper="Latest official cut points used as Actual"
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <FlaskConical className="h-5 w-5 text-[var(--fep-accent)]" />
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Actual vs Simulated Cut Points
                </h3>
                <p className="text-xs text-muted-foreground">
                  {fullMarketReady?.displayName ??
                    clientOnlyReady?.displayName ??
                    displayName}{" "}
                  ·{" "}
                  {fullMarketReady?.forecastYear ??
                    clientOnlyReady?.forecastYear}
                </p>
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
                    <th className="px-3 py-2 text-right text-[var(--fep-accent)]">
                      Client Only
                    </th>
                    <th className="px-3 py-2 text-right text-[var(--fep-accent)]">
                      Delta
                    </th>
                    <th className="px-3 py-2 text-right">Manual</th>
                    <th className="px-3 py-2 text-right">Delta</th>
                    <th className="px-3 py-2 text-right">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {thresholdRows.map((row) => {
                    const starColor = STAR_COLORS[THRESHOLD_STAR[row.key]];
                    const fullProjected = row.fullMarket?.projected ?? null;
                    const clientProjected = row.clientOnly?.projected ?? null;
                    const manualProjected = row.manual?.projected ?? null;
                    const diff =
                      fullProjected !== null && clientProjected !== null
                        ? clientProjected - fullProjected
                        : null;
                    return (
                      <tr
                        key={row.key}
                        className="border-b border-border/50"
                      >
                        <td
                          className="px-3 py-3 font-medium"
                          style={{ color: starColor }}
                        >
                          {row.label}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {row.comparisonActual !== null
                            ? row.comparisonActual.toFixed(2)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {fullProjected !== null
                            ? fullProjected.toFixed(2)
                            : "—"}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-semibold tabular-nums ${deltaClass(row.fullMarket?.deltaVsComparison ?? null)}`}
                        >
                          {fmtDelta(row.fullMarket?.deltaVsComparison ?? null)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium text-[var(--fep-accent)]">
                          {clientProjected !== null
                            ? clientProjected.toFixed(2)
                            : "—"}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-semibold tabular-nums ${deltaClass(row.clientOnly?.deltaVsComparison ?? null)}`}
                        >
                          {fmtDelta(
                            row.clientOnly?.deltaVsComparison ?? null,
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-medium">
                          {manualProjected !== null
                            ? manualProjected.toFixed(2)
                            : "—"}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-semibold tabular-nums ${deltaClass(row.manual?.deltaVsComparison ?? null)}`}
                        >
                          {fmtDelta(row.manual?.deltaVsComparison ?? null)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-semibold tabular-nums ${
                            diff !== null && diff > 0
                              ? "text-rose-400"
                              : diff !== null && diff < 0
                                ? "text-emerald-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {fmtDelta(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              <Users className="mr-1 inline h-3.5 w-3.5 text-[var(--fep-accent)]" />
              Client Only: {clientOnlyReady?.sampleSize ?? "—"} contracts (PP1 +
              projections)
              {fullMarketReady
                ? ` · Full Market: ${fullMarketReady.sampleSize}`
                : ""}
              . Manual = workbook forecast (official applied source).
              &quot;Actual&quot; = latest official cut points
              {(fullMarketReady ?? clientOnlyReady)?.comparisonYear != null
                ? ` (${(fullMarketReady ?? clientOnlyReady)?.comparisonYear})`
                : ""}
              . &quot;Diff&quot; = client projected minus full market
              projected.
            </p>
          </section>

          {(fullMarketReady?.notes.length || clientOnlyReady?.notes.length) && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <button
                type="button"
                onClick={() => setShowMethodNotes((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <h3 className="text-base font-semibold text-foreground">
                  Method notes
                </h3>
                {showMethodNotes ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {showMethodNotes && (
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {fullMarketReady?.notes.map((note) => (
                    <li key={`full-${note}`}>• Full Market: {note}</li>
                  ))}
                  {clientOnlyReady?.notes.map((note) => (
                    <li key={`client-${note}`}>• Client Only: {note}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {showRosterAccuracyCurve && (
        <RosterAccuracyCurve
          measure={measure}
          displayName={
            primary.status === "ready" || primary.status === "unsupported"
              ? primary.displayName
              : displayName
          }
          clientRosterSize={
            clientOnlyReady?.sampleSize ??
            fullMarketReady?.projectedContractCount ??
            null
          }
        />
      )}
    </div>
  );
}

function ForecastCard({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 text-3xl font-semibold ${accent ?? "text-foreground"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
