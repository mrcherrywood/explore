"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, TrendingUp, Users } from "lucide-react";
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

type CurvePoint = {
  rosterSize: number;
  avgMae: number;
  minMae: number;
  maxMae: number;
  trials: number;
  isClientRoster: boolean;
  isFullMarket: boolean;
};

type ReadyResponse = {
  status: "ready";
  measure: string;
  displayName: string;
  method: "clustering" | "cahps-percentile";
  clientRosterSize: number;
  fullMarketAvgSize: number;
  curve: CurvePoint[];
  years: number[];
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

export function RosterAccuracyCurve({ measure, displayName }: Props) {
  const [data, setData] = useState<ResponsePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: "roster-accuracy-curve", measure });
      const res = await fetch(`/api/analysis/band-movement?${params}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (!res.ok && payload?.status !== "unsupported") {
        throw new Error(payload?.error || "Failed to load");
      }
      setData(payload);
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
    return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Running roster accuracy simulation...</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <div className="flex items-center gap-3 text-red-400"><AlertTriangle className="h-5 w-5" /><span className="font-medium">Failed to load.</span></div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data || data.status === "unsupported") return null;

  const clientPoint = data.curve.find((p) => p.isClientRoster);
  const marketPoint = data.curve.find((p) => p.isFullMarket);
  const improvementPotential = clientPoint && marketPoint
    ? (clientPoint.avgMae - marketPoint.avgMae).toFixed(2)
    : null;

  const chartData = data.curve.map((p) => ({
    rosterSize: p.rosterSize,
    avgMae: p.avgMae,
    minMae: p.minMae,
    maxMae: p.maxMae,
  }));

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-2 flex items-center gap-3">
        <TrendingUp className="h-5 w-5 text-violet-400" />
        <div>
          <h3 className="text-base font-semibold text-foreground">Roster Size vs Accuracy</h3>
          <p className="text-xs text-muted-foreground">
            {displayName} · {data.years.join("–")} avg · {data.curve[0]?.trials ?? 0} trials per size
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MiniStat
          label="Your Roster"
          value={`${data.clientRosterSize} contracts`}
          sub={clientPoint ? `MAE: ${clientPoint.avgMae.toFixed(2)}` : "—"}
          accent="text-violet-500"
        />
        <MiniStat
          label="Full Market"
          value={`${data.fullMarketAvgSize} contracts`}
          sub={marketPoint ? `MAE: ${marketPoint.avgMae.toFixed(2)}` : "—"}
          accent="text-sky-500"
        />
        <MiniStat
          label="Remaining Gap"
          value={improvementPotential ? `${improvementPotential} pts` : "—"}
          sub="MAE reduction at full market size"
          accent="text-emerald-500"
        />
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
            <XAxis
              dataKey="rosterSize"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              label={{ value: "Roster Size (contracts)", position: "insideBottom", offset: -2, fontSize: 11, fill: "var(--color-muted-foreground)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              label={{ value: "Mean Abs Error", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "var(--color-muted-foreground)" }}
              domain={[0, "auto"]}
            />
            <Tooltip content={<CurveTooltip clientSize={data.clientRosterSize} marketSize={data.fullMarketAvgSize} />} />
            <Area
              dataKey="maxMae"
              fill="var(--color-primary)"
              fillOpacity={0.08}
              stroke="none"
              isAnimationActive={false}
            />
            <Area
              dataKey="minMae"
              fill="var(--color-card)"
              fillOpacity={1}
              stroke="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="avgMae"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload?: { rosterSize: number } }) => (
                <CurveDot key={payload?.rosterSize} cx={cx} cy={cy} payload={payload} clientSize={data.clientRosterSize} marketSize={data.fullMarketAvgSize} />
              )}
              activeDot={{ r: 5 }}
            />
            <ReferenceLine
              x={data.clientRosterSize}
              stroke="#8b5cf6"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
            <ReferenceLine
              x={data.fullMarketAvgSize}
              stroke="#0ea5e9"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" />
          Your Client Roster ({data.clientRosterSize})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />
          Full Market ({data.fullMarketAvgSize})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-primary/10" />
          Min–Max Range
        </span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        <Users className="mr-1 inline h-3.5 w-3.5" />
        Each point runs {data.curve[0]?.trials ?? 0} random subsamples of that size from the full market,
        backtests each against official CMS cut points across {data.years.length} years, and averages the MAE.
        The shaded band shows the best and worst trial at each size.
      </p>
    </section>
  );
}

type DotProps = {
  cx?: number;
  cy?: number;
  payload?: { rosterSize: number };
  clientSize: number;
  marketSize: number;
};

function CurveDot({ cx, cy, payload, clientSize, marketSize }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;

  if (payload.rosterSize === clientSize) {
    return <circle cx={cx} cy={cy} r={6} fill="#8b5cf6" stroke="#fff" strokeWidth={2} />;
  }
  if (payload.rosterSize === marketSize) {
    return <circle cx={cx} cy={cy} r={6} fill="#0ea5e9" stroke="#fff" strokeWidth={2} />;
  }
  return <circle cx={cx} cy={cy} r={2.5} fill="var(--color-primary)" />;
}

function CurveTooltip({ active, payload, clientSize, marketSize }: {
  active?: boolean;
  payload?: Array<{ payload: { rosterSize: number; avgMae: number; minMae: number; maxMae: number } }>;
  clientSize: number;
  marketSize: number;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const label = d.rosterSize === clientSize
    ? "Your Client Roster"
    : d.rosterSize === marketSize
      ? "Full Market"
      : `${d.rosterSize} Contracts`;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground">N = {d.rosterSize}</p>
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
