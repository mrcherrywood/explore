"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Sparkles } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
};

type ForecastResponse =
  | ForecastReadyResponse
  | ForecastUnavailableResponse
  | ForecastUnsupportedResponse;

type Props = {
  measure: string;
  displayName: string;
};

async function fetchForecast(
  measure: string,
  forecastYear: number | null,
  populationMode: ForecastPopulationMode
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

export function CutPointForecastAnalysis({ measure, displayName }: Props) {
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [populationMode, setPopulationMode] =
    useState<ForecastPopulationMode>("full_market");

  const loadForecast = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await fetchForecast(measure, selectedYear, populationMode);
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load forecast");
    } finally {
      setIsLoading(false);
    }
  }, [measure, populationMode, selectedYear]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  useEffect(() => {
    const years = data?.availableForecastYears ?? [];
    if (years.length === 0) return;
    if (selectedYear === null || !years.includes(selectedYear)) {
      setSelectedYear(years[0]);
    }
  }, [data, selectedYear]);

  const sortedThresholds = useMemo(() => {
    if (!data || data.status !== "ready") return [];
    const order = ["fiveStar", "fourStar", "threeStar", "twoStar"];
    return [...data.thresholds].sort(
      (left, right) => order.indexOf(left.key) - order.indexOf(right.key)
    );
  }, [data]);

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

  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        No forecast data available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Forecast Year</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(data.availableForecastYears ?? []).map((year) => (
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
          <div>
            <p className="text-xs font-medium text-muted-foreground">Population</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPopulationMode("full_market")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  populationMode === "full_market"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Full Market Overlay
              </button>
              <button
                type="button"
                onClick={() => setPopulationMode("client_only")}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  populationMode === "client_only"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                Client Only
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {displayName}
            {data.status === "ready" && data.baselineYear !== null && populationMode === "full_market"
              ? ` · overlaying projected client scores onto the ${data.baselineYear} market baseline`
              : ""}
          </p>
        </div>
      </section>

      {data.status === "unsupported" && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Forecast unavailable for this measure
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{data.reason}</p>
            </div>
          </div>
        </div>
      )}

      {data.status === "unavailable" && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
            <div>
              <h3 className="text-base font-semibold text-foreground">
                No approved forecast is ready yet
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{data.reason}</p>
            </div>
          </div>
        </div>
      )}

      {data.status === "ready" && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ForecastCard
              label="Projected Population"
              value={String(data.sampleSize)}
              helper={
                data.projectedContractCount && data.projectedContractCount > 0
                  ? `${data.projectedContractCount} approved client projections used`
                  : `${data.rawSampleSize} contracts before filtering`
              }
            />
            <ForecastCard
              label="Comparison Year"
              value={data.comparisonYear === null ? "—" : String(data.comparisonYear)}
              helper="Latest official cut points used for context"
            />
            <ForecastCard
              label="4★ Threshold"
              value={data.thresholds.find((threshold) => threshold.key === "fourStar")?.projected.toFixed(2) ?? "—"}
              helper="Anchored projected cut point"
              accent="text-emerald-500"
            />
            <ForecastCard
              label="Run Status"
              value={
                data.approvalScope === "measure"
                  ? "Measure Approved"
                  : data.runStatus === "approved"
                    ? "Run Approved"
                    : "Draft"
              }
              helper={
                data.approvedAt
                  ? `Approved ${new Date(data.approvedAt).toLocaleDateString()}`
                  : "Waiting for admin approval"
              }
              accent={data.approvalScope ? "text-sky-500" : "text-amber-500"}
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-sky-500" />
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Anchored projected thresholds
                </h3>
                <p className="text-xs text-muted-foreground">
                  Higher star thresholds are listed first. Raw simulation and movement cap are shown under each anchored value.
                </p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-[#c7d7e8]/70 hover:bg-[#c7d7e8]/70">
                  <TableHead>Threshold</TableHead>
                  <TableHead>Projected</TableHead>
                  <TableHead>Latest Official</TableHead>
                  <TableHead>Delta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedThresholds.map((threshold) => (
                  <TableRow key={threshold.key}>
                    <TableCell className="font-medium">{threshold.label}</TableCell>
                    <TableCell>
                      <ThresholdValue threshold={threshold} />
                    </TableCell>
                    <TableCell>
                      {threshold.comparisonActual === null
                        ? "—"
                        : threshold.comparisonActual.toFixed(2)}
                    </TableCell>
                    <TableCell className={deltaClass(threshold.deltaVsComparison)}>
                      {fmtDelta(threshold.deltaVsComparison)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground">Method notes</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {data.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          </section>
        </>
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
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${accent ?? "text-foreground"}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function ThresholdValue({ threshold }: { threshold: ForecastThreshold }) {
  return (
    <div className="space-y-0.5">
      <div className="font-semibold tabular-nums">{threshold.projected.toFixed(2)}</div>
      {threshold.rawSimulated !== null && (
        <div className="text-[11px] text-muted-foreground">
          raw {threshold.rawSimulated.toFixed(2)}
          {threshold.movementCap !== null ? ` · cap ${threshold.movementCap.toFixed(2)}` : ""}
          {threshold.movementWasCapped ? " · capped" : ""}
        </div>
      )}
    </div>
  );
}
