"use client";

import React, { useRef } from "react";
import { Download } from "lucide-react";
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
  LabelList,
} from "recharts";

export type ChartSeries = { key: string; name?: string };

type ChartDatum = Record<string, string | number | null> & { __color?: string };

export type ChartSpec = {
  title?: string;
  type: "line" | "bar" | "area" | "pie";
  xKey: string;
  series: ChartSeries[];
  data: ChartDatum[];
  highlightKey?: string;
  highlightValue?: string | number;
  yAxisDomain?: [number, number];
  yAxisTicks?: number[];
  showLabels?: boolean;
  labelKey?: string;
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
    const normalized: ChartDatum = { ...datum };
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

  const highlightKey = typeof spec.highlightKey === "string" ? spec.highlightKey : undefined;
  const highlightValue =
    typeof spec.highlightValue === "string" || typeof spec.highlightValue === "number"
      ? spec.highlightValue
      : undefined;
  const yAxisDomain = Array.isArray(spec.yAxisDomain) && 
    spec.yAxisDomain.length === 2 && 
    typeof spec.yAxisDomain[0] === "number" && 
    typeof spec.yAxisDomain[1] === "number"
      ? spec.yAxisDomain as [number, number]
      : undefined;
  const yAxisTicks = Array.isArray(spec.yAxisTicks) && 
    spec.yAxisTicks.every((t) => typeof t === "number")
      ? spec.yAxisTicks as number[]
      : undefined;

  return {
    title: spec.title,
    type: spec.type,
    xKey: spec.xKey,
    series,
    data,
    highlightKey,
    highlightValue,
    yAxisDomain,
    yAxisTicks,
    showLabels: spec.showLabels,
    labelKey: typeof spec.labelKey === "string" ? spec.labelKey : undefined,
  } satisfies ChartSpec;
}

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
  const normalized = normalizeChartSpec(spec);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  
  if (!normalized) return null;

  const colors = [
    "#38bdf8",
    "#818cf8",
    "#f472b6",
    "#facc15",
    "#34d399",
    "#f97316",
  ];

  const handleExportPNG = async () => {
    if (!chartContainerRef.current) return;
    
    console.log('Starting PNG export...');
    
    try {
      // Use dom-to-image-more which handles modern CSS better
      // @ts-expect-error - no types available for this package
      const domtoimage = await import("dom-to-image-more");
      
      // Temporarily hide the export button
      const button = chartContainerRef.current.querySelector('.export-button') as HTMLElement;
      const originalDisplay = button?.style.display;
      if (button) {
        button.style.display = 'none';
      }
      
      // Generate PNG blob
      const blob = await domtoimage.toBlob(chartContainerRef.current, {
        bgcolor: '#f8fafc',
        quality: 1,
        width: chartContainerRef.current.offsetWidth * 2,
        height: chartContainerRef.current.offsetHeight * 2,
        style: {
          transform: 'scale(2)',
          transformOrigin: 'top left',
          width: `${chartContainerRef.current.offsetWidth}px`,
          height: `${chartContainerRef.current.offsetHeight}px`,
        },
      });
      
      // Restore button
      if (button && originalDisplay !== undefined) {
        button.style.display = originalDisplay;
      }
      
      console.log('Blob created, downloading...');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileName = normalized.title 
        ? `${normalized.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`
        : 'chart.png';
      link.download = fileName;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      console.log('Download triggered');
      
    } catch (error) {
      console.log('Export error:', error);
      alert('Failed to export chart. Please try again.');
    }
  };

  const containerHeight = normalized.type === "pie" ? 320 : 360;

  let chart: React.ReactElement | null = null;
  if (normalized.type === "line") {
    chart = (
      <LineChart data={normalized.data}>
        <XAxis dataKey={normalized.xKey} stroke="#64748b" tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} />
        <YAxis stroke="#64748b" tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} domain={normalized.yAxisDomain} ticks={normalized.yAxisTicks} />
        <Tooltip 
          contentStyle={{ background: "rgba(255,255,255,0.98)", borderRadius: 12, border: "1px solid rgba(148,163,184,0.3)", color: "#1e293b", padding: 12 }} 
          labelStyle={{ color: "#1e293b", fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          itemStyle={{ color: "#475569", fontSize: 13 }}
          cursor={false}
        />
        <Legend wrapperStyle={{ color: "#475569" }} />
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
      <BarChart data={normalized.data} margin={{ top: 30, right: 5, left: 5, bottom: 5 }}>
        <XAxis dataKey={normalized.xKey} stroke="#64748b" tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={80} />
        <YAxis stroke="#64748b" tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} domain={normalized.yAxisDomain} ticks={normalized.yAxisTicks} />
        <Tooltip 
          contentStyle={{ background: "rgba(255,255,255,0.98)", borderRadius: 12, border: "1px solid rgba(148,163,184,0.3)", color: "#1e293b", padding: 12 }} 
          labelStyle={{ color: "#1e293b", fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          itemStyle={{ color: "#475569", fontSize: 13 }}
          cursor={false}
        />
        {normalized.series.map((s, i) => {
          const baseColor = colors[i % colors.length];
          return (
            <Bar key={s.key} dataKey={s.key} name={s.name || s.key} isAnimationActive={false} cursor="default">
              {normalized.data.map((entry, index) => {
                const highlightMatches =
                  typeof normalized.highlightKey === "string" &&
                  normalized.highlightValue !== undefined &&
                  entry[normalized.highlightKey] === normalized.highlightValue;
                const entryColor =
                  entry.__color ||
                  (highlightMatches ? "#ef4444" : baseColor);
                return <Cell key={`${s.key}-${index}`} fill={entryColor} style={{ pointerEvents: 'none' }} />;
              })}
              {normalized.showLabels && (
                <LabelList 
                  dataKey={normalized.labelKey || s.key} 
                  position="top"
                  style={{ fill: "#facc15", fontSize: 14, fontWeight: 700 }}
                  formatter={(value: unknown) => {
                    const numValue = typeof value === "number" ? value : null;
                    if (numValue == null) return "";
                    if (normalized.labelKey && normalized.labelKey !== s.key) {
                      // If we have a separate label key (e.g., stars), format it with star symbol
                      return `★ ${numValue.toFixed(1)}`;
                    }
                    // Otherwise show the bar value
                    return numValue.toFixed(1);
                  }}
                />
              )}
            </Bar>
          );
        })}
      </BarChart>
    );
  } else if (normalized.type === "area") {
    chart = (
      <AreaChart data={normalized.data}>
        <XAxis dataKey={normalized.xKey} stroke="#64748b" tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} />
        <YAxis stroke="#64748b" tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} domain={normalized.yAxisDomain} ticks={normalized.yAxisTicks} />
        <Tooltip 
          contentStyle={{ background: "rgba(255,255,255,0.98)", borderRadius: 12, border: "1px solid rgba(148,163,184,0.3)", color: "#1e293b", padding: 12 }} 
          labelStyle={{ color: "#1e293b", fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          itemStyle={{ color: "#475569", fontSize: 13 }}
          cursor={false}
        />
        <Legend wrapperStyle={{ color: "#475569" }} />
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
        <Tooltip 
          contentStyle={{ background: "rgba(255,255,255,0.98)", borderRadius: 12, border: "1px solid rgba(148,163,184,0.3)", color: "#1e293b", padding: 12 }} 
          labelStyle={{ color: "#1e293b", fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          itemStyle={{ color: "#475569", fontSize: 13 }}
          cursor={false}
        />
        <Legend wrapperStyle={{ color: "#475569" }} />
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

  // Custom legend for bar charts with highlighting
  const hasHighlight = normalized.type === "bar" && normalized.highlightKey && normalized.highlightValue !== undefined;
  const customLegend = hasHighlight ? (
    <div className="mb-4 flex items-center justify-center gap-6 text-sm">
      <div className="flex items-center gap-2">
        <div 
          className="h-3 w-3 rounded" 
          style={{ backgroundColor: "#ef4444", background: "#ef4444", border: "1px solid #ef4444" }} 
        />
        <span style={{ color: "#475569" }}>Selected Contract</span>
      </div>
      <div className="flex items-center gap-2">
        <div 
          className="h-3 w-3 rounded" 
          style={{ backgroundColor: "#38bdf8", background: "#38bdf8", border: "1px solid #38bdf8" }} 
        />
        <span style={{ color: "#475569" }}>Peer Contracts</span>
      </div>
    </div>
  ) : null;

  return (
    <div ref={chartContainerRef} className="relative w-full overflow-visible rounded-3xl border border-border/30 bg-slate-50/50 dark:bg-slate-900/40 p-5 shadow-sm">
      <button
        onClick={handleExportPNG}
        className="export-button absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        title="Export as PNG"
      >
        <Download className="h-3.5 w-3.5" />
        <span>PNG</span>
      </button>
      {customLegend}
      <ResponsiveContainer width="100%" height={containerHeight}>
        {chart}
      </ResponsiveContainer>
      {normalized.title && (
        <div className="absolute bottom-2 left-3 text-[10px] text-slate-400/60 dark:text-slate-500/60 font-medium">
          {normalized.title}
        </div>
      )}
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
