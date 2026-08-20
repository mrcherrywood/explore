import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import { bookVsCmsStarShareCsv } from "@/lib/star-distribution/export";
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

function rowTone(delta: number): string {
  if (delta > 1) return "text-emerald-700";
  if (delta < -1) return "text-[var(--fep-negative)]";
  return "";
}

function meanTone(delta: number): string {
  if (delta > 0.05) return "text-emerald-700";
  if (delta < -0.05) return "text-[var(--fep-negative)]";
  return "";
}

function bookVsCms(book: StarShare, cms: StarShare, starIndex: number) {
  const delta = book.pct[starIndex] - cms.pct[starIndex];
  return {
    text: `${fmtPct(book.pct[starIndex])} / ${fmtPct(cms.pct[starIndex])}`,
    className: rowTone(delta),
  };
}

function sourceLabel(org: BookRosterOrg): string {
  if (org.contractCount === 0) return "—";
  if (org.both === org.contractCount) return "Forecast + PP1";
  if (org.forecast === org.contractCount && org.pp1 === 0) return "Forecast";
  if (org.pp1 === org.contractCount && org.forecast === 0) return "PP1";
  return `${org.forecast} forecast · ${org.pp1} PP1`;
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
          Book / CMS percent of rated H+R contracts at each star.
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
              {STAR_INDEX.map((starIndex) => {
                const cell = bookVsCms(year.book, year.cms, starIndex);
                return (
                  <td key={starIndex} className={cell.className}>
                    {cell.text}
                  </td>
                );
              })}
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
    <section className="overflow-x-auto rounded-2xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            Book vs CMS at every star
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Share of rated contracts at each whole-star threshold. {caption}.
            Click a measure for the year-by-year view.
          </p>
        </div>
        <ExportCsvButton
          fileName={`book-vs-cms-star-share_${roster}_${period}`}
          getData={() => bookVsCmsStarShareCsv(rows)}
        />
      </div>
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
              {STAR_INDEX.map((starIndex) => {
                const cell = bookVsCms(slice.book, slice.cms, starIndex);
                return (
                  <td key={starIndex} className={cell.className}>
                    {cell.text}
                  </td>
                );
              })}
              <td className={meanTone(slice.meanDelta)}>
                {slice.book.mean.toFixed(2)} / {slice.cms.mean.toFixed(2)}
              </td>
              <td>{slice.book.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
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