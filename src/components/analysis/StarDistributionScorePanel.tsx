"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import { bookVsCmsScoreCsv } from "@/lib/star-distribution/export";
import {
  fepDeltaClass,
  formatScore,
  formatScoreDelta,
  scoreDeltaBetter,
} from "@/lib/star-distribution/stats";
import type {
  MeasureDistribution,
  PeriodKey,
  RosterMode,
  ScoreShare,
  ScoreSlice,
} from "@/lib/star-distribution/types";
import { BookCmsPair } from "./StarDistributionTables";

function fmtMean(share: ScoreShare): string {
  return share.n === 0 ? "—" : formatScore(share.mean);
}

export function SelectedMeasureScoreChart({
  measure,
  caption,
}: {
  measure: MeasureDistribution;
  caption: string;
}) {
  const data = measure.years.map((year) => ({
    name: String(year.year),
    CMS: year.score.cms.n > 0 ? year.score.cms.mean : null,
    "Our book": year.score.book.n > 0 ? year.score.book.mean : null,
  }));

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground">
        {measure.name} — average score
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Published measure scores · {caption}
        {measure.inverted ? " · Lower scores are better" : ""}
      </p>
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} domain={[0, "auto"]} />
            <Tooltip
              formatter={(value) =>
                value == null ? "—" : formatScore(Number(value))
              }
            />
            <Legend />
            <Bar dataKey="CMS" fill="#8a958d" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="CMS"
                position="top"
                formatter={(value) =>
                  typeof value === "number" ? formatScore(value) : ""
                }
                fill="var(--color-foreground)"
                fontSize={11}
                fontWeight={600}
              />
            </Bar>
            <Bar dataKey="Our book" fill="#1a3673" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="Our book"
                position="top"
                formatter={(value) =>
                  typeof value === "number" ? formatScore(value) : ""
                }
                fill="var(--color-foreground)"
                fontSize={11}
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function SelectedMeasureScoreYearTable({
  measure,
}: {
  measure: MeasureDistribution;
}) {
  return (
    <section className="overflow-x-auto rounded-2xl border border-border bg-card">
      <div className="px-5 pt-4">
        <h3 className="text-base font-semibold text-foreground">
          {measure.name} — average score by year
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Mean published score for rated H+R contracts.
          {measure.inverted ? " Lower scores are better." : ""}
        </p>
      </div>
      <table className="fep-table mt-2">
        <thead>
          <tr>
            <th className="l">Year</th>
            <th>Score book</th>
            <th>Score CMS</th>
            <th>Δ</th>
            <th>n book</th>
            <th>n CMS</th>
          </tr>
        </thead>
        <tbody>
          {measure.years.map((year) => (
            <tr key={year.year}>
              <td className="l">{year.year}</td>
              <td className={fepDeltaClass(scoreDeltaBetter(year.score.meanDelta, measure.inverted))}>
                {fmtMean(year.score.book)}
              </td>
              <td>{fmtMean(year.score.cms)}</td>
              <td className={fepDeltaClass(scoreDeltaBetter(year.score.meanDelta, measure.inverted))}>
                {year.score.book.n === 0 || year.score.cms.n === 0
                  ? "—"
                  : formatScoreDelta(year.score.meanDelta)}
              </td>
              <td>{year.score.book.n}</td>
              <td>{year.score.cms.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function AllMeasuresScoreTable({
  rows,
  caption,
  roster,
  period,
  onSelect,
  selectedName,
}: {
  rows: Array<{ measure: MeasureDistribution; score: ScoreSlice }>;
  caption: string;
  roster: RosterMode;
  period: PeriodKey;
  onSelect: (normalizedName: string) => void;
  selectedName: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">
            Average measure score, book vs CMS
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Mean published score on each measure&apos;s own scale. {caption}.
            Green/red uses each measure&apos;s direction (lower is better for
            inverted measures). Click a measure for the year-by-year view.
          </p>
        </div>
        <ExportCsvButton
          fileName={`book-vs-cms-scores_${roster}_${period}`}
          getData={() => bookVsCmsScoreCsv(rows)}
        />
      </div>
      <div className="overflow-x-auto">
      <table className="fep-table mt-2">
        <thead>
          <tr>
            <th className="l">Measure</th>
            <th>Score book / CMS</th>
            <th>Δ</th>
            <th>n book</th>
            <th>n CMS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ measure, score }) => (
            <tr
              key={measure.normalizedName}
              className={
                selectedName === measure.normalizedName
                  ? "bg-[var(--fep-band-bg)]/40"
                  : undefined
              }
            >
              <td className="l">
                <button
                  type="button"
                  onClick={() => onSelect(measure.normalizedName)}
                  className="text-left font-medium text-[var(--fep-accent)] hover:underline"
                >
                  {measure.name}
                  {measure.inverted ? (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (lower better)
                    </span>
                  ) : null}
                </button>
              </td>
              <td>
                <BookCmsPair
                  book={fmtMean(score.book)}
                  cms={fmtMean(score.cms)}
                  better={
                    score.book.n === 0 || score.cms.n === 0
                      ? 0
                      : scoreDeltaBetter(score.meanDelta, measure.inverted)
                  }
                />
              </td>
              <td
                className={fepDeltaClass(
                  scoreDeltaBetter(score.meanDelta, measure.inverted)
                )}
              >
                {score.book.n === 0 || score.cms.n === 0
                  ? "—"
                  : formatScoreDelta(score.meanDelta)}
              </td>
              <td>{score.book.n}</td>
              <td>{score.cms.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
