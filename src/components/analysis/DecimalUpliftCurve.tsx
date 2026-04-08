"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Hash } from "lucide-react";
import {
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";

type UpliftPoint = {
  pctDecimal: number;
  decimalCount: number;
  avgMae: number;
  minMae: number;
  maxMae: number;
  trials: number;
};

type ReadyResponse = {
  status: "ready";
  measure: string;
  displayName: string;
  method: "clustering" | "cahps-percentile";
  clientRosterAvgSize: number;
  baselineMae: number;
  fullDecimalMae: number;
  uplift: number;
  curve: UpliftPoint[];
  years: number[];
};

type Props = {
  measure: string;
  displayName: string;
};

export function DecimalUpliftCurve({ measure, displayName }: Props) {
  const [data, setData] = useState<ReadyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: "decimal-uplift-curve", measure });
      const res = await fetch(`/api/analysis/band-movement?${params}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        if (payload?.status === "unsupported") return;
        throw new Error(payload?.error || "Failed to load");
      }
      if (payload?.status === "ready") setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [measure]);

  useEffect(() => {
    if (measure) fetchData();
  }, [measure, fetchData]);

  if (isLoading) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Running decimal precision simulation...</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-3 text-red-400"><AlertTriangle className="h-5 w-5" /><span className="font-medium">Failed to load.</span></div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const upliftPositive = data.uplift > 0;
  const upliftLabel = upliftPositive
    ? `${data.uplift.toFixed(2)} pts better`
    : data.uplift < 0
      ? `${Math.abs(data.uplift).toFixed(2)} pts worse`
      : "no change";

  const chartData = data.curve.map((p) => ({
    pctDecimal: p.pctDecimal,
    avgMae: p.avgMae,
    minMae: p.minMae,
    maxMae: p.maxMae,
  }));

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-2 flex items-center gap-3">
        <Hash className="h-5 w-5 text-amber-400" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Decimal Precision Uplift Simulation</h3>
          <p className="text-xs text-muted-foreground">
            {displayName} · {data.clientRosterAvgSize} client contracts · {data.years.join("–")} avg
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MiniStat
          label="All Integer (Baseline)"
          value={data.baselineMae.toFixed(2)}
          sub="CMS-rounded scores only"
          accent="text-muted-foreground"
        />
        <MiniStat
          label="All Decimal (Simulated)"
          value={data.fullDecimalMae.toFixed(2)}
          sub="Every contract with decimal precision"
          accent="text-amber-500"
        />
        <MiniStat
          label="Net Effect"
          value={upliftLabel}
          sub={upliftPositive ? "Decimal precision helps" : data.uplift < 0 ? "Ties stabilize clustering at this N" : "Neutral"}
          accent={upliftPositive ? "text-emerald-500" : data.uplift < 0 ? "text-rose-400" : "text-muted-foreground"}
        />
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
            <XAxis
              dataKey="pctDecimal"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={(v: number) => `${v}%`}
              label={{ value: "% of Roster with Decimal Scores", position: "insideBottom", offset: -2, fontSize: 11, fill: "var(--color-muted-foreground)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              label={{ value: "Mean Abs Error", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "var(--color-muted-foreground)" }}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<UpliftTooltip rosterSize={data.clientRosterAvgSize} />} />
            <ReferenceLine
              y={data.baselineMae}
              stroke="var(--color-muted-foreground)"
              strokeDasharray="6 3"
              strokeWidth={1}
            />
            <Area dataKey="maxMae" fill="#f59e0b" fillOpacity={0.08} stroke="none" isAnimationActive={false} />
            <Area dataKey="minMae" fill="var(--color-card)" fillOpacity={1} stroke="none" isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="avgMae"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 3, fill: "#f59e0b" }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-muted-foreground" />
          Integer Baseline ({data.baselineMae.toFixed(2)})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          Avg MAE with Simulated Decimals
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-amber-500/10" />
          Min–Max Range
        </span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Simulates decimal precision by adding Uniform(−0.5, +0.5) noise to integer scores, breaking
        the artificial ties created by CMS rounding. Each step runs {data.curve[0]?.trials ?? 0} trials.
        {!upliftPositive && data.uplift < 0 && (
          <> At this roster size ({data.clientRosterAvgSize} contracts), integer ties actually stabilize
          the clustering — the benefit of decimal precision grows with larger populations where tie-breaking
          reveals more of the underlying continuous distribution.</>
        )}
      </p>
    </section>
  );
}

function UpliftTooltip({ active, payload, rosterSize }: {
  active?: boolean;
  payload?: Array<{ payload: { pctDecimal: number; avgMae: number; minMae: number; maxMae: number } }>;
  rosterSize: number;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const decimalCount = Math.round(rosterSize * d.pctDecimal / 100);

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{d.pctDecimal}% Decimal</p>
      <p className="text-muted-foreground">{decimalCount} of {rosterSize} contracts</p>
      <p className="mt-1 text-foreground">Avg MAE: <span className="font-semibold">{d.avgMae.toFixed(2)}</span></p>
      <p className="text-muted-foreground">Range: {d.minMae.toFixed(2)} – {d.maxMae.toFixed(2)}</p>
    </div>
  );
}

function MiniStat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
