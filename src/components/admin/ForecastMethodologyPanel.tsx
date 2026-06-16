"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, FlaskConical, HelpCircle, Info, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClusteringMethodologySteps } from "@/components/analysis/BacktestMethodologyPanels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PopulationMode = "full_market" | "client_only";

type MeasureOption = { normalized: string; displayName: string };

type ForecastThreshold = {
  key: "twoStar" | "threeStar" | "fourStar" | "fiveStar";
  label: string;
  projected: number;
  comparisonActual: number | null;
  deltaVsComparison: number | null;
  rawSimulated: number | null;
  baselineSimulated: number | null;
  anchoredMovement: number | null;
  movementCap: number | null;
  movementWasCapped: boolean;
};

type HistoricalMovementCheck = {
  key: "twoStar" | "threeStar" | "fourStar" | "fiveStar";
  label: string;
  projectedDelta: number | null;
  recentDeltas: number[];
  recentMinDelta: number | null;
  recentMaxDelta: number | null;
  recentP90AbsDelta: number | null;
  recentMaxAbsDelta: number | null;
  isOutsideRecentRange: boolean;
  isAboveRecentP90: boolean;
  message: string | null;
};

type HistoricalMovementAudit = {
  comparisonYear: number | null;
  historicalYears: number[];
  checks: HistoricalMovementCheck[];
  warningCount: number;
};

type ClientInformedInference = {
  scenario: "client_informed";
  baselineYear: number;
  baselineContractCount: number;
  matchedContractCount: number;
  appendedContractCount: number;
  observedClientMeanDelta: number | null;
  historicalMarketMeanDelta: number | null;
  clientBaselineMean: number | null;
  marketBaselineMean: number | null;
  representativenessScore: number;
  sampleCredibility: number;
  shrinkageWeight: number;
  nonClientDeltaCap: number;
  appliedNonClientDelta: number;
  notes: string[];
};

type ReadyFields = {
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
  populationMode: PopulationMode;
  baselineYear: number | null;
  projectedContractCount: number;
  methodology: {
    method: "clustering" | "cahps-percentile";
    foldCount: number;
    seed: number;
    tukeyStartsIn: number;
    exclusions: string[];
  };
};

type ClientInformedScenario = ReadyFields & {
  status: "ready";
  populationMode: PopulationMode;
  baselineYear: number | null;
  projectedContractCount: number;
  inference: ClientInformedInference;
};

type ReadyResponse = ReadyFields & {
  status: "ready";
  populationMode: PopulationMode;
  baselineYear: number | null;
  projectedContractCount: number;
  clientInformedScenario: ClientInformedScenario | null;
};

type UnavailableResponse = {
  status: "unavailable";
  measure: string;
  displayName: string;
  forecastYear: number;
  reason: string;
  populationMode: PopulationMode;
  baselineYear: number | null;
};

type UnsupportedResponse = {
  status: "unsupported";
  measure: string;
  displayName: string;
  reason: string;
  populationMode: PopulationMode;
  baselineYear: number | null;
};

type MethodologyResponse = ReadyResponse | UnavailableResponse | UnsupportedResponse;

type Props = {
  runId: string;
  forecastYear: number;
};

function fmtDelta(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function fmtPct(value: number | null) {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

function deltaClass(value: number | null) {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-rose-500";
  if (value < 0) return "text-emerald-500";
  return "text-muted-foreground";
}

function movementStatusClass(warningCount: number) {
  if (warningCount === 0) return "border-emerald-500/20 bg-emerald-500/5";
  return "border-amber-500/20 bg-amber-500/5";
}

function summarizeMovement(population: string, audit: HistoricalMovementAudit | null | undefined) {
  if (!audit || audit.checks.length === 0) return null;

  const projectedDeltas = audit.checks
    .map((check) => check.projectedDelta)
    .filter((value): value is number => value !== null);
  const largestMove =
    projectedDeltas.length === 0
      ? null
      : projectedDeltas.reduce((largest, value) =>
          Math.abs(value) > Math.abs(largest) ? value : largest
        );
  const recentMins = audit.checks
    .map((check) => check.recentMinDelta)
    .filter((value): value is number => value !== null);
  const recentMaxes = audit.checks
    .map((check) => check.recentMaxDelta)
    .filter((value): value is number => value !== null);
  const recentRange =
    recentMins.length > 0 && recentMaxes.length > 0
      ? `${fmtDelta(Math.min(...recentMins))} to ${fmtDelta(Math.max(...recentMaxes))}`
      : "Not enough history";

  return {
    population,
    totalCount: audit.checks.length,
    warningCount: audit.warningCount,
    largestMove,
    recentRange,
  };
}

async function fetchMethodology(input: {
  runId: string;
  measure: string;
  populationMode: PopulationMode;
}): Promise<MethodologyResponse> {
  const params = new URLSearchParams({
    runId: input.runId,
    measure: input.measure,
    populationMode: input.populationMode,
  });
  const res = await fetch(`/api/admin/forecast/methodology?${params}`, { cache: "no-store" });
  const payload = await res.json();
  if (!res.ok && payload.status !== "unsupported") {
    throw new Error(payload.error ?? "Failed to load methodology");
  }
  return payload;
}

export function ForecastMethodologyPanel({ runId, forecastYear }: Props) {
  const [measures, setMeasures] = useState<MeasureOption[]>([]);
  const [selectedMeasure, setSelectedMeasure] = useState("");
  const [data, setData] = useState<Record<PopulationMode, MethodologyResponse | null>>({
    full_market: null,
    client_only: null,
  });
  const [loading, setLoading] = useState(false);
  const [measuresLoading, setMeasuresLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMethodology, setShowMethodology] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMeasuresLoading(true);
    fetch(`/api/admin/forecast/methodology?runId=${runId}&measure=__list__`, { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        if (cancelled) return;
        const list: MeasureOption[] = payload.measures ?? [];
        setMeasures(list);
        if (list.length > 0 && !selectedMeasure) {
          setSelectedMeasure(list[0].normalized);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load measures");
      })
      .finally(() => {
        if (!cancelled) setMeasuresLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const loadMethodology = useCallback(async () => {
    if (!selectedMeasure) return;
    setLoading(true);
    setError(null);
    try {
      const [fullMarket, clientOnly] = await Promise.all([
        fetchMethodology({
          runId,
          measure: selectedMeasure,
          populationMode: "full_market",
        }),
        fetchMethodology({
          runId,
          measure: selectedMeasure,
          populationMode: "client_only",
        }),
      ]);
      setData({
        full_market: fullMarket,
        client_only: clientOnly,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load methodology");
    } finally {
      setLoading(false);
    }
  }, [runId, selectedMeasure]);

  useEffect(() => {
    loadMethodology();
  }, [loadMethodology]);

  const fullMarketReady = data.full_market?.status === "ready" ? data.full_market : null;
  const clientOnlyReady = data.client_only?.status === "ready" ? data.client_only : null;
  const clientInformedReady =
    fullMarketReady?.clientInformedScenario?.status === "ready"
      ? fullMarketReady.clientInformedScenario
      : null;

  const thresholdRows = useMemo(() => {
    const fullMarket = fullMarketReady;
    const clientInformed = clientInformedReady;
    const clientOnly = clientOnlyReady;
    const source = fullMarket ?? clientOnly;
    if (!source) return [];
    const order = ["fiveStar", "fourStar", "threeStar", "twoStar"];
    return [...source.thresholds]
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      .map((threshold) => {
        const fullMarketThreshold = fullMarket?.thresholds.find((item) => item.key === threshold.key) ?? null;
        const clientInformedThreshold = clientInformed?.thresholds.find((item) => item.key === threshold.key) ?? null;
        const clientOnlyThreshold = clientOnly?.thresholds.find((item) => item.key === threshold.key) ?? null;
        return {
          key: threshold.key,
          label: threshold.label,
          comparisonActual: fullMarketThreshold?.comparisonActual ?? clientOnlyThreshold?.comparisonActual ?? null,
          fullMarket: fullMarketThreshold,
          clientInformed: clientInformedThreshold,
          clientOnly: clientOnlyThreshold,
        };
      });
  }, [clientInformedReady, clientOnlyReady, fullMarketReady]);

  const methodologyData = fullMarketReady ?? clientOnlyReady;
  const unavailableData =
    data.full_market?.status === "unavailable"
      ? data.full_market
      : data.client_only?.status === "unavailable"
        ? data.client_only
        : null;
  const unsupportedData =
    data.full_market?.status === "unsupported"
      ? data.full_market
      : data.client_only?.status === "unsupported"
        ? data.client_only
        : null;
  const methodNotes = [
    ...(fullMarketReady?.notes.map((note) => `Full Market Overlay: ${note}`) ?? []),
    ...(clientInformedReady?.inference.notes.map((note) => `Client-Informed: ${note}`) ?? []),
    ...(clientOnlyReady?.notes.map((note) => `Client Only: ${note}`) ?? []),
  ];
  const movementSummaries = [
    summarizeMovement("Anchored Full Market", fullMarketReady?.historicalMovement),
    summarizeMovement("Client-Informed", clientInformedReady?.historicalMovement),
    summarizeMovement("Client Only", clientOnlyReady?.historicalMovement),
  ].filter((summary): summary is NonNullable<typeof summary> => summary !== null);

  const selectedDisplayName = measures.find((m) => m.normalized === selectedMeasure)?.displayName ?? selectedMeasure;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projected Cut Points</CardTitle>
        <p className="text-sm text-muted-foreground">
          Run the CMS clustering methodology on projected year-end scores to simulate {forecastYear} cut points.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[280px] flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Measure</label>
            <select
              value={selectedMeasure}
              onChange={(e) => {
                setSelectedMeasure(e.target.value);
                setData({ full_market: null, client_only: null });
              }}
              disabled={measuresLoading}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {measuresLoading && <option value="">Loading measures...</option>}
              {measures.map((m) => (
                <option key={m.normalized} value={m.normalized}>{m.displayName}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running methodology simulation...
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !fullMarketReady && !clientOnlyReady && unsupportedData && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium text-foreground">Not supported for this measure</p>
              <p className="mt-1 text-sm text-muted-foreground">{unsupportedData.reason}</p>
            </div>
          </div>
        )}

        {!loading && !fullMarketReady && !clientOnlyReady && unavailableData && (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
            <div>
              <p className="font-medium text-foreground">Insufficient data</p>
              <p className="mt-1 text-sm text-muted-foreground">{unavailableData.reason}</p>
            </div>
          </div>
        )}

        {!loading && (fullMarketReady || clientOnlyReady) && (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {fullMarketReady && (
                <MetricCard
                  label="Anchored Full Market"
                  value={String(fullMarketReady.sampleSize)}
                  helper={`${fullMarketReady.projectedContractCount} client + ${fullMarketReady.rawSampleSize - fullMarketReady.projectedContractCount} market baseline`}
                />
              )}
              {clientInformedReady && (
                <MetricCard
                  label="Client-Informed"
                  value={fmtDelta(clientInformedReady.inference.appliedNonClientDelta)}
                  helper={`${clientInformedReady.inference.matchedContractCount} matched contracts · ${fmtPct(clientInformedReady.inference.shrinkageWeight)} signal weight`}
                  accent="text-sky-500"
                />
              )}
              {clientOnlyReady && (
                <MetricCard
                  label="Client Only"
                  value={String(clientOnlyReady.sampleSize)}
                  helper={`${clientOnlyReady.projectedContractCount} client contracts`}
                />
              )}
              <MetricCard
                label="Comparison Year"
                value={String(fullMarketReady?.comparisonYear ?? clientOnlyReady?.comparisonYear ?? "—")}
                helper="Latest official cut points"
              />
              <MetricCard
                label="Movement Cap"
                value={(fullMarketReady ?? clientOnlyReady)?.guardrailsApplied ? "Applied" : "Not Applied"}
                helper={
                  (fullMarketReady ?? clientOnlyReady)?.guardrailCap === null
                    ? "No prior official benchmark"
                    : `Max cap ${(fullMarketReady ?? clientOnlyReady)?.guardrailCap} points`
                }
                accent="text-emerald-500"
              />
            </div>

            {methodologyData && (
              <ForecastMethodologyExplainer
                data={methodologyData}
                displayName={selectedDisplayName}
                show={showMethodology}
                onToggle={() => setShowMethodology((current) => !current)}
              />
            )}

            {movementSummaries.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-6">
                <div className="flex gap-3">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
                  <div className="flex-1 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Historical Plausibility</p>
                    <p className="mt-1 text-pretty">
                      This is a confidence read, not a warning log. It summarizes whether each scenario is asking
                      cut points to move outside this measure&apos;s recent official history.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {movementSummaries.map((summary) => (
                        <div
                          key={summary.population}
                          className={`rounded-xl border p-3 ${movementStatusClass(summary.warningCount)}`}
                        >
                          <p className="font-medium text-foreground">{summary.population}</p>
                          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                            {summary.warningCount}/{summary.totalCount}
                          </p>
                          <p className="text-xs text-muted-foreground">thresholds outside recent history</p>
                          <div className="mt-3 space-y-1 text-xs">
                            <p>
                              <span className="text-muted-foreground">Largest move: </span>
                              <span className="font-medium tabular-nums text-foreground">
                                {fmtDelta(summary.largestMove)}
                              </span>
                            </p>
                            <p>
                              <span className="text-muted-foreground">Recent range: </span>
                              <span className="font-medium tabular-nums text-foreground">
                                {summary.recentRange}
                              </span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {clientInformedReady && (
              <section className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-6">
                <h3 className="text-base font-semibold text-foreground">
                  Client-Informed Forecast Signal
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This scenario uses actual/projected movement from matched client contracts, shrinks it toward recent
                  market movement based on sample size and representativeness, then applies the constrained movement
                  only to non-client market baseline contracts.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryPill
                    label="Observed Client Move"
                    value={fmtDelta(clientInformedReady.inference.observedClientMeanDelta)}
                    helper={`${clientInformedReady.inference.matchedContractCount} matched baseline contracts`}
                  />
                  <SummaryPill
                    label="Historical Market Move"
                    value={fmtDelta(clientInformedReady.inference.historicalMarketMeanDelta)}
                    helper="Recent recency-weighted mean score movement"
                  />
                  <SummaryPill
                    label="Representativeness"
                    value={fmtPct(clientInformedReady.inference.representativenessScore)}
                    helper={`Client baseline ${clientInformedReady.inference.clientBaselineMean ?? "—"} vs market ${clientInformedReady.inference.marketBaselineMean ?? "—"}`}
                  />
                  <SummaryPill
                    label="Applied Non-Client Move"
                    value={fmtDelta(clientInformedReady.inference.appliedNonClientDelta)}
                    helper={`Signal weight ${fmtPct(clientInformedReady.inference.shrinkageWeight)} · cap ${clientInformedReady.inference.nonClientDeltaCap}`}
                  />
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <FlaskConical className="h-5 w-5 text-sky-400" />
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Anchored Projected vs Latest Official Cut Points
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedDisplayName} · {forecastYear}
                    {fullMarketReady?.baselineYear !== null && fullMarketReady?.baselineYear !== undefined
                      ? ` · full market overlay uses ${fullMarketReady.baselineYear} market baseline`
                      : ""}
                  </p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="bg-[#c7d7e8]/70 hover:bg-[#c7d7e8]/70">
                    <TableHead>Threshold</TableHead>
                    <TableHead className="text-right">Anchored Full</TableHead>
                    <TableHead className="text-right">Anchored Delta</TableHead>
                    <TableHead className="text-right">Client-Informed</TableHead>
                    <TableHead className="text-right">Informed Delta</TableHead>
                    <TableHead className="text-right">Client Only</TableHead>
                    <TableHead className="text-right">Client Delta</TableHead>
                    <TableHead className="text-right">Latest Official</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {thresholdRows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        <ThresholdValue threshold={row.fullMarket} />
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${deltaClass(row.fullMarket?.deltaVsComparison ?? null)}`}>
                        {fmtDelta(row.fullMarket?.deltaVsComparison ?? null)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        <ThresholdValue threshold={row.clientInformed} />
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${deltaClass(row.clientInformed?.deltaVsComparison ?? null)}`}>
                        {fmtDelta(row.clientInformed?.deltaVsComparison ?? null)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        <ThresholdValue threshold={row.clientOnly} />
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${deltaClass(row.clientOnly?.deltaVsComparison ?? null)}`}>
                        {fmtDelta(row.clientOnly?.deltaVsComparison ?? null)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.comparisonActual !== null ? row.comparisonActual.toFixed(2) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            {methodNotes.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-6">
                <h3 className="text-base font-semibold text-foreground">Method Notes</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {methodNotes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, helper, accent }: {
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

function SummaryPill({ label, value, helper }: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/80 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function ThresholdValue({ threshold }: { threshold: ForecastThreshold | null }) {
  if (!threshold) return <>—</>;
  return (
    <div className="space-y-0.5">
      <div>{threshold.projected.toFixed(2)}</div>
      {threshold.rawSimulated !== null && (
        <div className="text-[11px] font-normal text-muted-foreground">
          raw {threshold.rawSimulated.toFixed(2)}
          {threshold.movementCap !== null ? ` · cap ${threshold.movementCap.toFixed(2)}` : ""}
          {threshold.movementWasCapped ? " · capped" : ""}
        </div>
      )}
    </div>
  );
}

function ForecastMethodologyExplainer({
  data,
  displayName,
  show,
  onToggle,
}: {
  data: ReadyResponse;
  displayName: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-0 rounded-2xl border border-amber-500/30 bg-amber-500/5">
      <div className="flex gap-3 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Forecast methodology preview</p>
          <p className="mt-1">
            This view applies the same CMS-style non-CAHPS cut-point approximation used in the
            methodology backtest to projected scores for {displayName}: Tukey outlier handling,
            {` ${data.methodology.foldCount}`}-fold mean resampling, Ward-style clustering,
            threshold averaging, monotonic ordering, and guardrails when a prior official cut point is available.
            Historical cut-point movement is used as a plausibility check on the output.
          </p>
          <button
            type="button"
            onClick={onToggle}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            How are these cut points derived?
            {show ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {show && (
        <div className="border-t border-amber-500/20 px-4 pb-5 pt-4 text-sm text-muted-foreground">
          <ClusteringMethodologySteps
            data={{
              inverted: data.inverted,
              methodology: data.methodology,
            }}
          />
          <div className="mt-4 rounded-xl border border-border/70 bg-background/70 p-3">
            <p className="mb-1.5 font-medium text-foreground">Full Market Overlay</p>
            <ul className="space-y-1 pl-4 list-disc">
              <li>The full-market forecast starts from the latest published market score population for the selected measure.</li>
              <li>Approved projected client scores replace matching baseline scores for the same contract ID.</li>
              <li>Projected client contracts that are not present in the baseline are appended to the population.</li>
              <li>Market contracts without a projected client score remain in the population as the baseline market context.</li>
              <li>Recent official cut-point movement is used to flag unusual projected threshold changes; it does not shift non-client market scores.</li>
            </ul>
          </div>
          <div className="mt-4 rounded-xl border border-border/70 bg-background/70 p-3">
            <p className="mb-1.5 font-medium text-foreground">Client-Informed Scenario</p>
            <ul className="space-y-1 pl-4 list-disc">
              <li>Matched client contracts estimate observed year-over-year movement for the selected measure.</li>
              <li>The client signal is shrunk toward recent market movement using sample credibility and representativeness.</li>
              <li>The inferred non-client movement is capped before scores are adjusted.</li>
              <li>The adjusted population still runs through the same cut-point methodology and guardrails, and warnings flag threshold movement outside recent history.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
