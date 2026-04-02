"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import type { HistoricalTransition } from "./BandMovementAnalysis";

type StarRating = 1 | 2 | 3 | 4 | 5;

type Props = {
  history: HistoricalTransition[];
  star: StarRating;
  displayMeasure: string;
};

function fmtDelta(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v}`;
}

export function BandMovementHistorical({ history, star, displayMeasure }: Props) {
  const trendData = history.map((t) => ({
    label: `${t.fromYear}→${t.toYear}`,
    improved: t.movement.improvedPct,
    held: t.movement.heldPct,
    declined: t.movement.declinedPct,
    cohort: t.movement.cohortSize,
  }));

  const cutPointKeys = ["fiveStar", "fourStar", "threeStar", "twoStar"] as const;
  const cutPointLabels: Record<string, string> = { twoStar: "2★", threeStar: "3★", fourStar: "4★", fiveStar: "5★" };
  const hasCutPoints = history.some((t) => t.cutPoints !== null);

  return (
    <>
      {/* Trend summary cards */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-foreground">
          {star}★ Band Movement Across Years
          <span className="ml-2 text-xs font-normal text-muted-foreground">{displayMeasure}</span>
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          {history.map((t) => (
            <div key={t.fromYear} className="rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t.fromYear} → {t.toYear}</p>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-sm font-medium text-muted-foreground">{t.movement.cohortSize} contracts</span>
              </div>
              <div className="mt-2 flex gap-4 text-sm">
                <span className="text-emerald-500 font-semibold">{t.movement.improvedPct}% ↑</span>
                <span className="text-sky-500 font-semibold">{t.movement.heldPct}% →</span>
                <span className="text-rose-500 font-semibold">{t.movement.declinedPct}% ↓</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Trend chart */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-sky-400" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Movement Trend</h3>
            <p className="text-xs text-muted-foreground">How {star}★ contracts moved year over year</p>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--color-muted-foreground)" unit="%" />
              <Tooltip
                formatter={(v: number, name: string) => [`${v}%`, name.charAt(0).toUpperCase() + name.slice(1)]}
                contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "12px", fontSize: "13px" }}
              />
              <Legend />
              <Bar dataKey="declined" name="Declined" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="held" name="Held" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="improved" name="Improved" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Cut point trend table */}
      {hasCutPoints && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-1 text-base font-semibold text-foreground">Cut Point Trend</h3>
          <p className="mb-4 text-xs text-muted-foreground">How cut points evolved across transitions</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left" title="Star rating level (2★–5★)">Threshold</th>
                  {history.map((t) => (
                    <th key={t.fromYear} className="px-3 py-2 text-right" colSpan={2} title={`Cut point values and change for the ${t.fromYear} to ${t.toYear} transition`}>
                      {t.fromYear}→{t.toYear}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-3 py-1" />
                  {history.map((t) => (
                    <React.Fragment key={t.fromYear}>
                      <th className="px-3 py-1 text-right font-normal" title={`Cut point score in ${t.toYear}`}>Value</th>
                      <th className="px-3 py-1 text-right font-normal" title="Year-over-year change in cut point (positive = harder, negative = easier)">Δ</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cutPointKeys.map((key) => (
                  <tr key={key} className="border-b border-border/50">
                    <td className="px-3 py-2 font-medium">{cutPointLabels[key]}</td>
                    {history.map((t) => {
                      if (!t.cutPoints) {
                        return (
                          <React.Fragment key={t.fromYear}>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                          </React.Fragment>
                        );
                      }
                      const delta = t.cutPoints.delta[key];
                      return (
                        <React.Fragment key={t.fromYear}>
                          <td className="px-3 py-2 text-right">{t.cutPoints.toYear[key]}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${delta > 0 ? "text-rose-500" : delta < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                            {fmtDelta(delta)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Score change trend table */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-1 text-base font-semibold text-foreground">Score Change Trend</h3>
        <p className="mb-4 text-xs text-muted-foreground">Average score change (pts) for contracts that improved, held, or declined</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left" title="Movement category: improved (moved up), held (stayed), or declined (moved down)">Category</th>
                {history.map((t) => (
                  <th key={t.fromYear} className="px-3 py-2 text-right" title={`Average score change (points) and count for the ${t.fromYear} to ${t.toYear} transition`}>{t.fromYear}→{t.toYear}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["improved", "held", "declined"] as const).map((cat) => {
                const label = cat.charAt(0).toUpperCase() + cat.slice(1);
                const colorClass = cat === "improved" ? "text-emerald-500" : cat === "declined" ? "text-rose-500" : "text-sky-500";
                const scoreKey = `${cat}Scores` as const;
                return (
                  <tr key={cat} className="border-b border-border/50">
                    <td className={`px-3 py-2 font-medium ${colorClass}`}>{label}</td>
                    {history.map((t) => {
                      const group = t.movement[scoreKey];
                      return (
                        <td key={t.fromYear} className="px-3 py-2 text-right">
                          {group.avgScoreChange !== null ? (
                            <span>
                              {fmtDelta(group.avgScoreChange)} pts
                              <span className="ml-1 text-xs text-muted-foreground">({group.count})</span>
                            </span>
                          ) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
