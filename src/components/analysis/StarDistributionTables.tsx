"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import { bookVsCmsStarShareCsv } from "@/lib/star-distribution/export";
import { fepDeltaClass, starShareBetter } from "@/lib/star-distribution/stats";
import type {
  BookRosterOrg,
  ComparisonSlice,
  MeasureDistribution,
  PeriodKey,
  RosterMode,
  StarShare,
} from "@/lib/star-distribution/types";

const STAR_HEADERS = ["5★", "4★", "3★", "2★", "1★"] as const;
const STAR_INDEX = [4, 3, 2, 1, 0] as const;

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function BookCmsPair({
  book,
  cms,
  better,
}: {
  book: string;
  cms: string;
  better: number;
}) {
  return (
    <>
      <span className={fepDeltaClass(better)}>{book}</span>
      {` / ${cms}`}
    </>
  );
}

function starSharePair(book: StarShare, cms: StarShare, starIndex: number) {
  const delta = book.pct[starIndex] - cms.pct[starIndex];
  return (
    <BookCmsPair
      book={fmtPct(book.pct[starIndex])}
      cms={fmtPct(cms.pct[starIndex])}
      better={starShareBetter(starIndex, delta)}
    />
  );
}

function sourceLabel(org: BookRosterOrg): string {
  if (org.contractCount === 0) return "—";
  if (org.both === org.contractCount) return "Forecast + PP1";
  if (org.forecast === org.contractCount && org.pp1 === 0) return "Forecast";
  if (org.pp1 === org.contractCount && org.forecast === 0) return "PP1";
  return `${org.forecast} forecast · ${org.pp1} PP1`;
}

export function ShareStat({
  label,
  value,
  helper,
  positive,
}: {
  label: string;
  value: string;
  helper: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 text-xl font-semibold ${
          positive === undefined
            ? "text-foreground"
            : positive
              ? "fep-delta-pos"
              : "fep-delta-neg"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

export function StarShareChart({
  title,
  caption,
  data,
}: {
  title: string;
  caption: string;
  data: Array<{ name: string; CMS: number; "Our book": number }>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis
              unit="%"
              tick={{ fontSize: 12 }}
              domain={[0, "auto"]}
              allowDecimals={false}
            />
            <Tooltip formatter={(value) => `${Number(value ?? 0).toFixed(1)}%`} />
            <Legend />
            <Bar dataKey="CMS" fill="#8a958d" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Our book" fill="#1a3673" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function SelectedMeasureYearTable({
  measure,
}: {
  measure: MeasureDistribution;
}) {
  return (
    <section className="overflow-x-auto rounded-2xl border border-border bg-card">
      <div className="px-5 pt-4">
        <h3 className="text-base font-semibold text-foreground">
          {measure.name} — star share by year
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Book / CMS percent of rated H+R contracts at each star. Green is a
          better mix (more 4★/5★ or fewer 1★/2★).
        </p>
      </div>
      <table className="fep-table mt-2">
        <thead>
          <tr>
            <th className="l">Year</th>
            {STAR_HEADERS.map((label) => (
              <th key={label}>{label} book / CMS</th>
            ))}
            <th>n book</th>
            <th>n CMS</th>
          </tr>
        </thead>
        <tbody>
          {measure.years.map((year) => (
            <tr key={year.year}>
              <td className="l">{year.year}</td>
              {STAR_INDEX.map((starIndex) => (
                <td key={starIndex}>
                  {starSharePair(year.book, year.cms, starIndex)}
                </td>
              ))}
              <td>{year.book.n}</td>
              <td>{year.cms.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function AllMeasuresStarShareTable({
  rows,
  caption,
  roster,
  period,
  onSelect,
  selectedName,
}: {
  rows: Array<{ measure: MeasureDistribution; slice: ComparisonSlice }>;
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
            Book vs CMS at every star
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Share of rated contracts at each whole-star threshold. {caption}.
            Green is a better mix for our book (more 4★/5★ or fewer 1★/2★).
            Click a measure for the year-by-year view.
          </p>
        </div>
        <ExportCsvButton
          fileName={`book-vs-cms-star-share_${roster}_${period}`}
          getData={() => bookVsCmsStarShareCsv(rows)}
        />
      </div>
      <div className="overflow-x-auto">
      <table className="fep-table mt-2">
        <thead>
          <tr>
            <th className="l">Measure</th>
            {STAR_HEADERS.map((label) => (
              <th key={label}>{label} book / CMS</th>
            ))}
            <th>Mean book / CMS</th>
            <th>n book</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ measure, slice }) => (
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
                </button>
              </td>
              {STAR_INDEX.map((starIndex) => (
                <td key={starIndex}>
                  {starSharePair(slice.book, slice.cms, starIndex)}
                </td>
              ))}
              <td>
                <BookCmsPair
                  book={slice.book.mean.toFixed(2)}
                  cms={slice.cms.mean.toFixed(2)}
                  better={slice.meanDelta}
                />
              </td>
              <td>{slice.book.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

export function BookRosterOrgsTable({ orgs }: { orgs: BookRosterOrg[] }) {
  if (orgs.length === 0) return null;
  const contractCount = orgs.reduce((sum, org) => sum + org.contractCount, 0);
  return (
    <section className="overflow-x-auto rounded-2xl border border-border bg-card">
      <div className="px-5 pt-4">
        <h3 className="text-base font-semibold text-foreground">
          Parent organizations in the book
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {orgs.length} parent organizations · {contractCount} H+R contracts
          from the current roster. Source is whether the contract appears in
          forecast files, Plan Preview uploads, or both. Contracts with no
          published Star Ratings (for example National PACE) are grouped as
          "Not in published Star Ratings" unless a parent org is on the upload
          or in the contract file.
        </p>
      </div>
      <table className="fep-table mt-2">
        <thead>
          <tr>
            <th className="l">Parent organization</th>
            <th className="l">Contracts</th>
            <th>n</th>
            <th className="l">Source</th>
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => (
            <tr key={org.name}>
              <td className="l">{org.name}</td>
              <td className="l !whitespace-normal">
                {org.contracts.join(", ")}
              </td>
              <td>{org.contractCount}</td>
              <td className="l">{sourceLabel(org)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}