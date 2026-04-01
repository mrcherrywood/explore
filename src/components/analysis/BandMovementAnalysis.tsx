"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpDown, ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, LineChart, Line, Legend } from "recharts";
import { BandMovementDetails } from "./BandMovementDetails";
import { BandMovementHistorical } from "./BandMovementHistorical";

type StarRating = 1 | 2 | 3 | 4 | 5;

type MovementBucket = { toStar: StarRating; count: number; pct: number };
type ScoreChangeGroup = { count: number; avgScoreChange: number | null; medianScoreChange: number | null };

type BandMovementStats = {
  cohortSize: number;
  improved: number; improvedPct: number;
  held: number; heldPct: number;
  declined: number; declinedPct: number;
  buckets: MovementBucket[];
  improvedScores: ScoreChangeGroup;
  heldScores: ScoreChangeGroup;
  declinedScores: ScoreChangeGroup;
};

type ScoreStats = { year: number; mean: number | null; median: number | null; min: number | null; max: number | null; count: number };
type CutPointYearData = { year: number; twoStar: number; threeStar: number; fourStar: number; fiveStar: number };
type CutPointComparison = {
  fromYear: CutPointYearData; toYear: CutPointYearData;
  delta: { twoStar: number; threeStar: number; fourStar: number; fiveStar: number };
  measureName: string; hlCode: string; domain: string | null; weight: number | null;
};

type AllBandRow = {
  star: StarRating; cohortSize: number;
  improved: number; improvedPct: number; held: number; heldPct: number;
  declined: number; declinedPct: number;
  avgStarChange: number | null;
};

type ContractMovementRow = {
  contractId: string; contractName: string; orgName: string; parentOrg: string;
  fromStar: StarRating; fromScore: number | null;
  toStar: StarRating; toScore: number | null; starChange: number;
};

type UnifiedMeasure = { normalizedName: string; displayName: string; codesByYear: Record<number, string>; keysByYear: Record<number, string> };

export type BandMovementResponse = {
  status: "ready" | "options";
  measures: UnifiedMeasure[];
  transitions: number[];
  selectedMeasure: string | null; selectedStar: StarRating | null;
  fromYear: number | null; toYear: number | null;
  movement: BandMovementStats | null;
  scoreStats: { from: ScoreStats; to: ScoreStats } | null;
  cutPoints: CutPointComparison | null;
  contracts: ContractMovementRow[];
  allBands: AllBandRow[];
};

export type HistoricalTransition = {
  fromYear: number; toYear: number;
  movement: BandMovementStats;
  cutPoints: CutPointComparison | null;
  scoreStats: { from: ScoreStats; to: ScoreStats } | null;
};

export type HistoricalBandMovementResponse = {
  status: "ready";
  measures: UnifiedMeasure[];
  transitions: number[];
  selectedMeasure: string;
  selectedStar: StarRating;
  history: HistoricalTransition[];
};

type YearSelection = number | "all";

const STAR_COLORS: Record<string, string> = {
  "1": "#ef4444", "2": "#f97316", "3": "#eab308", "4": "#22c55e", "5": "#3b82f6",
};
const STAR_LABELS: Record<string, string> = {
  "1": "1★", "2": "2★", "3": "3★", "4": "4★", "5": "5★",
};

export function BandMovementAnalysis() {
  const [singleData, setSingleData] = useState<BandMovementResponse | null>(null);
  const [historicalData, setHistoricalData] = useState<HistoricalBandMovementResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [measure, setMeasure] = useState<string>("");
  const [star, setStar] = useState<StarRating>(3);
  const [fromYear, setFromYear] = useState<YearSelection>(2025);

  const fetchData = useCallback(async (m?: string, s?: StarRating, y?: YearSelection) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const effectiveM = m ?? measure;
      const effectiveS = s ?? star;
      const effectiveY = y ?? fromYear;
      if (effectiveM) params.set("measure", effectiveM);
      if (effectiveS) params.set("star", String(effectiveS));
      params.set("fromYear", String(effectiveY));
      const res = await fetch(`/api/analysis/band-movement?${params}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      const payload = await res.json();
      if (!effectiveM && payload.measures?.length > 0) {
        const firstMeasure = payload.measures[0].normalizedName;
        setMeasure(firstMeasure);
        fetchData(firstMeasure, effectiveS, effectiveY);
        return;
      }
      if (effectiveY === "all") {
        setHistoricalData(payload as HistoricalBandMovementResponse);
        setSingleData(null);
      } else {
        setSingleData(payload as BandMovementResponse);
        setHistoricalData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setIsLoading(false);
    }
  }, [measure, star, fromYear]);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMeasureChange = (m: string) => { setMeasure(m); fetchData(m, star, fromYear); };
  const handleStarChange = (s: StarRating) => { setStar(s); fetchData(measure, s, fromYear); };
  const handleYearChange = (y: YearSelection) => { setFromYear(y); fetchData(measure, star, y); };

  const measures = singleData?.measures ?? historicalData?.measures ?? [];
  const transitions = singleData?.transitions ?? historicalData?.transitions ?? [2023, 2024, 2025];
  const displayMeasure = measures.find((m) => m.normalizedName === measure)?.displayName ?? measure;

  const bucketData = singleData?.movement?.buckets.filter((b) => b.count > 0).map((b) => ({
    name: STAR_LABELS[String(b.toStar)] ?? String(b.toStar),
    count: b.count,
    pct: b.pct,
    fill: STAR_COLORS[String(b.toStar)] ?? "#94a3b8",
  })) ?? [];

  const isHistorical = fromYear === "all";

  return (
    <div className="space-y-6">
      {/* Controls */}
      <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Measure</label>
          <div className="relative">
            <select value={measure} onChange={(e) => handleMeasureChange(e.target.value)}
              className="w-full appearance-none rounded-xl border border-border bg-background px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40">
              {measures.map((m) => (
                <option key={m.normalizedName} value={m.normalizedName}>{m.displayName}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Star Band</label>
          <div className="flex gap-1">
            {([1, 2, 3, 4, 5] as StarRating[]).map((s) => (
              <button key={s} onClick={() => handleStarChange(s)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${s === star ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {s}{"★"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Transition</label>
          <div className="flex gap-1">
            <button onClick={() => handleYearChange("all")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${isHistorical ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              All Years
            </button>
            {transitions.map((y) => (
              <button key={y} onClick={() => handleYearChange(y)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${!isHistorical && y === fromYear ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                {y}→{y + 1}
              </button>
            ))}
          </div>
        </div>
      </section>

      {isLoading && <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading analysis...</div>}
      {error && (
        <div className="rounded-2xl border border-border bg-card p-8">
          <div className="flex items-center gap-3 text-red-400"><AlertTriangle className="h-5 w-5" /><p className="font-medium">Failed to load.</p></div>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      )}

      {/* Single-year view */}
      {!isLoading && !error && !isHistorical && singleData?.status === "ready" && singleData.movement && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Cohort Size" value={String(singleData.movement.cohortSize)} helper={`Contracts with ${star}★ in ${fromYear} that also reported in ${(fromYear as number) + 1}`} />
            <SummaryCard label="Declined" value={`${singleData.movement.declinedPct}%`}
              helper={`${singleData.movement.declined} contracts` + (singleData.movement.declinedScores.avgScoreChange !== null ? ` · avg ${singleData.movement.declinedScores.avgScoreChange} pts` : "")}
              accent="text-rose-500" />
            <SummaryCard label="Held" value={`${singleData.movement.heldPct}%`}
              helper={`${singleData.movement.held} contracts` + (singleData.movement.heldScores.avgScoreChange !== null ? ` · avg ${singleData.movement.heldScores.avgScoreChange > 0 ? "+" : ""}${singleData.movement.heldScores.avgScoreChange} pts` : "")}
              accent="text-sky-500" />
            <SummaryCard label="Improved" value={`${singleData.movement.improvedPct}%`}
              helper={`${singleData.movement.improved} contracts` + (singleData.movement.improvedScores.avgScoreChange !== null ? ` · avg +${singleData.movement.improvedScores.avgScoreChange} pts` : "")}
              accent="text-emerald-500" />
          </section>

          {bucketData.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-3">
                <ArrowUpDown className="h-5 w-5 text-sky-400" />
                <div>
                  <h3 className="text-base font-semibold text-foreground">Where did {star}{"★"} contracts end up in {(fromYear as number) + 1}?</h3>
                  <p className="text-xs text-muted-foreground">{displayMeasure} · {singleData.movement.cohortSize} contracts</p>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bucketData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip formatter={(v: number) => [v, "Contracts"]}
                      contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", fontSize: "13px" }} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {bucketData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <BandMovementDetails
            allBands={singleData.allBands}
            cutPoints={singleData.cutPoints}
            scoreStats={singleData.scoreStats}
            contracts={singleData.contracts}
            fromYear={fromYear as number}
            toYear={(fromYear as number) + 1}
            star={star}
          />
        </>
      )}

      {/* Historical view */}
      {!isLoading && !error && isHistorical && historicalData?.status === "ready" && historicalData.history.length > 0 && (
        <BandMovementHistorical history={historicalData.history} star={star} displayMeasure={displayMeasure} />
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
