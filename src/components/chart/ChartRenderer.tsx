"use client";

import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export type ChartSeries = { key: string; name?: string };

export type ChartSpec = {
  title?: string;
  type: "line" | "bar" | "area" | "pie";
  xKey: string;
  series: ChartSeries[];
  data: Record<string, string | number | null>[];
};

function isChartSpec(value: unknown): value is ChartSpec {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChartSpec>;
  return (
    typeof candidate.xKey === "string" &&
    Array.isArray(candidate.series) &&
    Array.isArray(candidate.data)
  );
}

function coerceSeries(series: unknown): ChartSeries[] | null {
  if (!Array.isArray(series)) return null;
  const result: ChartSeries[] = [];
  for (const entry of series) {
    if (typeof entry === "string") {
      result.push({ key: entry });
      continue;
    }
    if (entry && typeof entry === "object") {
      const { key, name } = entry as { key?: unknown; name?: unknown };
      if (typeof key === "string") {
        result.push({ key, name: typeof name === "string" ? name : undefined });
        continue;
      }
    }
    return null;
  }
  return result;
}

function normalizeChartSpec(spec: unknown): ChartSpec | null {
  if (!isChartSpec(spec)) return null;

  const series = coerceSeries(spec.series);
  if (!series || series.length === 0) return null;

  const data = spec.data.map((datum) => {
    const normalized: Record<string, string | number | null> = { ...datum };
    for (const { key } of series) {
      const raw = datum[key];
      if (raw === null || raw === undefined) {
        normalized[key] = null;
      } else if (typeof raw === "number") {
        normalized[key] = raw;
      } else if (typeof raw === "string") {
        const numeric = Number(raw.replace(/[^0-9.\-]/g, ""));
        normalized[key] = Number.isFinite(numeric) ? numeric : raw;
      }
    }
    return normalized;
  });

  return {
    title: spec.title,
    type: spec.type,
    xKey: spec.xKey,
    series,
    data,
  } satisfies ChartSpec;
}

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const normalized = normalizeChartSpec(spec);
  if (!normalized) return null;

  const colors = [
    "#38bdf8",
    "#818cf8",
    "#f472b6",
    "#facc15",
    "#34d399",
    "#f97316",
  ];

  const containerHeight = normalized.type === "pie" ? 320 : 280;

  let chart: React.ReactElement | null = null;
  if (normalized.type === "line") {
    chart = (
      <LineChart data={normalized.data}>
        <XAxis dataKey={normalized.xKey} stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "rgba(15,23,42,0.9)", borderRadius: 12, border: "1px solid rgba(148,163,184,0.3)", color: "#e2e8f0" }} labelStyle={{ color: "#cbd5f5" }} />
        <Legend wrapperStyle={{ color: "#cbd5f5" }} />
        {normalized.series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name || s.key}
            stroke={colors[i % colors.length]}
            dot={false}
          />
        ))}
      </LineChart>
    );
  } else if (normalized.type === "bar") {
    chart = (
      <BarChart data={normalized.data}>
        <XAxis dataKey={normalized.xKey} stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "rgba(15,23,42,0.9)", borderRadius: 12, border: "1px solid rgba(148,163,184,0.3)", color: "#e2e8f0" }} labelStyle={{ color: "#cbd5f5" }} />
        <Legend wrapperStyle={{ color: "#cbd5f5" }} />
        {normalized.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name || s.key} fill={colors[i % colors.length]} />
        ))}
      </BarChart>
    );
  } else if (normalized.type === "area") {
    chart = (
      <AreaChart data={normalized.data}>
        <XAxis dataKey={normalized.xKey} stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: "rgba(15,23,42,0.9)", borderRadius: 12, border: "1px solid rgba(148,163,184,0.3)", color: "#e2e8f0" }} labelStyle={{ color: "#cbd5f5" }} />
        <Legend wrapperStyle={{ color: "#cbd5f5" }} />
        {normalized.series.map((s, i) => (
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.name || s.key}
            fill={colors[i % colors.length]}
            stroke={colors[i % colors.length]}
          />
        ))}
      </AreaChart>
    );
  } else if (normalized.type === "pie") {
    chart = (
      <PieChart>
        <Tooltip contentStyle={{ background: "rgba(15,23,42,0.9)", borderRadius: 12, border: "1px solid rgba(148,163,184,0.3)", color: "#e2e8f0" }} labelStyle={{ color: "#cbd5f5" }} />
        <Legend wrapperStyle={{ color: "#cbd5f5" }} />
        <Pie data={normalized.data} dataKey={normalized.series[0]?.key} nameKey={normalized.xKey} outerRadius={110}>
          {normalized.data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
      </PieChart>
    );
  }

  if (!chart) {
    return null;
  }

  return (
    <div className="w-full overflow-hidden rounded-3xl border border-white/12 bg-slate-900/40 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.45)]">
      {normalized.title ? (
        <div className="mb-3 text-sm font-medium tracking-wide text-slate-100/90">{normalized.title}</div>
      ) : null}
      <ResponsiveContainer width="100%" height={containerHeight}>
        {chart}
      </ResponsiveContainer>
    </div>
  );
}

// Utility: try to extract a chart spec from a fenced code block in markdown
export function parseChartSpecFromMarkdown(md: string): ChartSpec | null {
  const fence = /```(chart|json)[\r\n]+([\s\S]*?)```/m;
  const m = md.match(fence);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[2]);
    return normalizeChartSpec(obj);
  } catch {}
  return null;
}
