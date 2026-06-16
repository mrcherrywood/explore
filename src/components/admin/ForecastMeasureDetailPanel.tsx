"use client";

import { useMemo } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ForecastProjectionDetailRecord } from "@/lib/cutpoint-forecast/types";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Close"] as const;
const YEAR_COLORS = ["#14b8a6", "#f97316", "#eab308", "#3b82f6", "#8b5cf6", "#ef4444"];

type Props = {
  detail: ForecastProjectionDetailRecord;
  contractMetadata: {
    contractName: string;
    parentOrg: string;
  } | null;
  manualTargetScore: number | null;
  onClose: () => void;
};

function formatMonthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? `M${month}`;
}

function formatOptional(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export function ForecastMeasureDetailPanel({ detail, contractMetadata, manualTargetScore, onClose }: Props) {
  const { projection, history } = detail;
  const contractContext = [
    contractMetadata?.contractName,
    contractMetadata?.parentOrg ? `Parent Org: ${contractMetadata.parentOrg}` : null,
  ].filter(Boolean).join(" · ");

  const contextScores = useMemo(() => {
    const forecastYear = projection.forecastYear;
    const currentMonth = projection.lastObservedMonth;
    const currentRate = projection.lastObservedScore;

    const priorYearPoints = history
      .filter((p) => p.year === forecastYear - 1 && p.rate !== null)
      .sort((a, b) => a.normalizedMonth - b.normalizedMonth);

    const priorSameMonth =
      currentMonth !== null
        ? priorYearPoints.find((p) => p.normalizedMonth === currentMonth)?.rate ?? null
        : null;

    const priorYearFinal = priorYearPoints.at(-1)?.rate ?? null;

    return {
      currentRate,
      currentMonth,
      priorSameMonthRate: priorSameMonth,
      priorYearFinal,
      priorYear: forecastYear - 1,
    };
  }, [history, projection.forecastYear, projection.lastObservedMonth, projection.lastObservedScore]);

  const chart = useMemo(() => {
    const years = [...new Set(history.map((point) => point.year))].sort((a, b) => a - b);
    const targetMonth =
      history.some((point) => point.normalizedMonth === 13) || projection.lastObservedMonth === 13 ? 13 : 12;

    const rows = Array.from({ length: targetMonth }, (_, index) => ({
      normalizedMonth: index + 1,
      label: formatMonthLabel(index + 1),
    })) as Array<Record<string, number | string | null>>;

    for (const year of years) {
      for (const row of rows) {
        row[`year_${year}`] = null;
      }
    }

    for (const point of history) {
      const row = rows[point.normalizedMonth - 1];
      if (!row) continue;
      row[`year_${point.year}`] = point.rate;
    }

    for (const row of rows) {
      row.projectedGlidepath = null;
      row.manualTarget = null;
    }

    if (projection.lastObservedMonth !== null && projection.lastObservedScore !== null) {
      const observedIndex = projection.lastObservedMonth - 1;
      if (rows[observedIndex]) rows[observedIndex].projectedGlidepath = projection.lastObservedScore;
      if (rows[targetMonth - 1]) rows[targetMonth - 1].projectedGlidepath = projection.modelScore;

      if (manualTargetScore !== null) {
        if (rows[observedIndex]) rows[observedIndex].manualTarget = projection.lastObservedScore;
        if (rows[targetMonth - 1]) rows[targetMonth - 1].manualTarget = manualTargetScore;
      }
    } else {
      if (rows[targetMonth - 1]) rows[targetMonth - 1].projectedGlidepath = projection.modelScore;
      if (manualTargetScore !== null && rows[targetMonth - 1]) {
        rows[targetMonth - 1].manualTarget = manualTargetScore;
      }
    }

    const numericValues = rows.flatMap((row) =>
      Object.values(row).filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    );
    const minValue = numericValues.length ? Math.max(0, Math.floor((Math.min(...numericValues) - 5) / 5) * 5) : 0;
    const maxValue = numericValues.length ? Math.min(100, Math.ceil((Math.max(...numericValues) + 5) / 5) * 5) : 100;

    return {
      rows,
      years,
      minValue,
      maxValue,
      targetMonth,
    };
  }, [history, manualTargetScore, projection.lastObservedMonth, projection.lastObservedScore, projection.modelScore]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{projection.contractId}</CardTitle>
            <CardDescription>{projection.measureDisplayName}</CardDescription>
            {contractContext && (
              <div className="mt-1 text-sm text-muted-foreground">{contractContext}</div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close detail panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
          <ScoreBox
            label={`Current Rate (${contextScores.currentMonth ? formatMonthLabel(contextScores.currentMonth) : "—"} ${projection.forecastYear})`}
            value={formatOptional(contextScores.currentRate)}
          />
          <ScoreBox
            label={`Prior Year Same Month (${contextScores.currentMonth ? formatMonthLabel(contextScores.currentMonth) : "—"} ${contextScores.priorYear})`}
            value={formatOptional(contextScores.priorSameMonthRate)}
          />
          <ScoreBox
            label={`Prior Year Final (${contextScores.priorYear})`}
            value={formatOptional(contextScores.priorYearFinal)}
          />
          <ScoreBox
            label={`Projected Year-End (${projection.forecastYear})`}
            value={formatOptional(manualTargetScore ?? projection.finalScore)}
            accent
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-[28rem] rounded-lg border border-border/70 bg-background/70 p-3">
          {history.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No monthly history is available for this contract and measure.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart.rows} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis domain={[chart.minValue, chart.maxValue]} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) => {
                    const normalizedValue = Array.isArray(value) ? value[0] : value;
                    const seriesName = String(name);
                    if (normalizedValue === null || normalizedValue === undefined || normalizedValue === "") {
                      return ["—", seriesName];
                    }
                    const label = /^\d{4}$/.test(seriesName)
                      ? `${seriesName} Rate`
                      : seriesName === "projectedGlidepath"
                        ? "Projected Glidepath Rate"
                        : seriesName === "manualTarget"
                          ? "Manual Projection Rate"
                        : "Manual Target";
                    return [Number(normalizedValue).toFixed(2), label];
                  }}
                />
                <Legend />
                <ReferenceLine x={formatMonthLabel(chart.targetMonth)} stroke="var(--color-border)" />
                {chart.years.map((year, index) => (
                  <Bar
                    key={year}
                    dataKey={`year_${year}`}
                    name={`${year}`}
                    fill={YEAR_COLORS[index % YEAR_COLORS.length]}
                    radius={[2, 2, 0, 0]}
                    barSize={Math.max(8, 24 - (chart.years.length - 1) * 2)}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="projectedGlidepath"
                  name="projectedGlidepath"
                  stroke="#111827"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ r: 3 }}
                  connectNulls
                />
                {manualTargetScore !== null && (
                  <Line
                    type="monotone"
                    dataKey="manualTarget"
                    name="manualTarget"
                    stroke="#dc2626"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={{ r: 3 }}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetaRow label="Last Observed" value={projection.lastObservedYear && projection.lastObservedMonth
            ? `${projection.lastObservedYear}-${String(projection.lastObservedMonth).padStart(2, "0")} · ${formatOptional(projection.lastObservedScore)}`
            : "—"} />
          <MetaRow label="Confidence" value={`${projection.confidenceLabel} (${projection.confidence.toFixed(2)})`} />
          <MetaRow label="Supporting Points" value={String(projection.supportingPoints)} />
          <MetaRow label="Trend Slope" value={formatOptional(projection.trendSlope)} />
          <MetaRow label="Seasonality Delta" value={formatOptional(projection.seasonalityDelta)} />
          <MetaRow label="Measure Code / HL" value={`${projection.measureCode ?? "—"} / ${projection.hlCode ?? "—"}`} />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Model Notes</h3>
          {projection.notes.length === 0 ? (
            <div className="text-sm text-muted-foreground">No model notes are available for this row.</div>
          ) : (
            <ul className="space-y-2 text-sm text-muted-foreground">
              {projection.notes.map((note, index) => (
                <li key={`${projection.id}-note-${index}`} className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${accent ? "border-sky-500/40 bg-sky-500/5" : "border-border/70 bg-muted/20"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${accent ? "text-sky-600" : ""}`}>{value}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
