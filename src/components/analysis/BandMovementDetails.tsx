"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type StarRating = 1 | 2 | 3 | 4 | 5;

type AllBandRow = {
  star: StarRating; cohortSize: number;
  improved: number; improvedPct: number; held: number; heldPct: number;
  declined: number; declinedPct: number;
  avgStarChange: number | null;
};

type CutPointYearData = { year: number; twoStar: number; threeStar: number; fourStar: number; fiveStar: number };
type CutPointComparison = {
  fromYear: CutPointYearData; toYear: CutPointYearData;
  delta: { twoStar: number; threeStar: number; fourStar: number; fiveStar: number };
  measureName: string; hlCode: string; domain: string | null; weight: number | null;
};

type ScoreStats = { year: number; mean: number | null; median: number | null; min: number | null; max: number | null; count: number };

type ContractMovementRow = {
  contractId: string; contractName: string; orgName: string; parentOrg: string;
  fromStar: StarRating; fromScore: number | null;
  toStar: StarRating; toScore: number | null; starChange: number;
  fractionalFrom: number | null; fractionalTo: number | null; fractionalChange: number | null;
};

type WithinBandDensity = {
  nearLowerThreshold: number; nearLowerPct: number;
  middle: number; middlePct: number;
  nearUpperThreshold: number; nearUpperPct: number;
  lowerThreshold: number | null; upperThreshold: number | null;
};

type BandMovementStatsPartial = {
  withinBandDensity?: WithinBandDensity | null;
  avgFractionalFrom?: number | null;
  avgFractionalTo?: number | null;
  avgFractionalChange?: number | null;
};

type SortKey = "contractName" | "orgName" | "fromScore" | "toScore" | "scoreChange" | "starChange" | "fractionalChange";

type Props = {
  allBands: AllBandRow[];
  cutPoints: CutPointComparison | null;
  scoreStats: { from: ScoreStats; to: ScoreStats } | null;
  contracts: ContractMovementRow[];
  fromYear: number;
  toYear: number;
  star: StarRating;
  movement?: BandMovementStatsPartial | null;
};

export function BandMovementDetails({ allBands, cutPoints, scoreStats, contracts, fromYear, toYear, star, movement }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("starChange");
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "contractName" || key === "orgName"); }
  };

  const getSortValue = (row: ContractMovementRow, key: SortKey): string | number | null => {
    if (key === "scoreChange") {
      return row.fromScore != null && row.toScore != null ? row.toScore - row.fromScore : null;
    }
    if (key === "fractionalChange") return row.fractionalChange;
    return row[key];
  };

  const sorted = [...contracts].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    if (av === null && bv === null) return 0;
    if (av === null) return 1; if (bv === null) return -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortAsc ? cmp : -cmp;
  });

  const visible = showAll ? sorted : sorted.slice(0, 25);
  const SortIcon = sortAsc ? ChevronUp : ChevronDown;

  return (
    <>
      {/* All-bands overview */}
      {allBands.some((b) => b.cohortSize > 0) && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-1 text-base font-semibold text-foreground">All Star Bands &middot; {fromYear} &rarr; {toYear}</h3>
          <p className="mb-4 text-xs text-muted-foreground">How every star band moved for the same measure and year transition</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left" title="Star rating band (1–5★)">Band</th>
                  <th className="px-3 py-2 text-right" title="Number of contracts in this band in the base year that also reported in the next year">Cohort</th>
                  <th className="px-3 py-2 text-right text-emerald-500" title="Percentage of cohort that moved to a higher star band">Improved</th>
                  <th className="px-3 py-2 text-right text-sky-500" title="Percentage of cohort that stayed in the same star band">Held</th>
                  <th className="px-3 py-2 text-right text-rose-500" title="Percentage of cohort that dropped to a lower star band">Declined</th>
                  <th className="px-3 py-2 text-right" title="Mean star-band change for this cohort (positive = net improvement)">Avg Change</th>
                </tr>
              </thead>
              <tbody>
                {[...allBands].filter((b) => b.cohortSize > 0).reverse().map((b) => (
                  <tr key={b.star} className={`border-b border-border/50 ${b.star === star ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{b.star}{"★"}</td>
                    <td className="px-3 py-2 text-right">{b.cohortSize}</td>
                    <td className="px-3 py-2 text-right text-emerald-500">{b.improvedPct}%</td>
                    <td className="px-3 py-2 text-right text-sky-500">{b.heldPct}%</td>
                    <td className="px-3 py-2 text-right text-rose-500">{b.declinedPct}%</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {b.avgStarChange !== null ? `${b.avgStarChange > 0 ? "+" : ""}${b.avgStarChange}` : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Cut points + score stats side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {cutPoints && (
          <section className="rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-1 text-base font-semibold text-foreground">Cut Point Movement</h3>
            <p className="mb-4 text-xs text-muted-foreground">{cutPoints.measureName} ({cutPoints.hlCode}){cutPoints.domain ? ` \u00B7 ${cutPoints.domain}` : ""}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left" title="Star rating level (2★–5★)">Threshold</th>
                  <th className="px-3 py-2 text-right" title={`CMS cut point score required for this star level in ${cutPoints.fromYear.year}`}>{cutPoints.fromYear.year}</th>
                  <th className="px-3 py-2 text-right" title={`CMS cut point score required for this star level in ${cutPoints.toYear.year}`}>{cutPoints.toYear.year}</th>
                  <th className="px-3 py-2 text-right" title="Year-over-year change in cut point (positive = harder to achieve, negative = easier)">Delta</th>
                </tr>
              </thead>
              <tbody>
                {(["fiveStar", "fourStar", "threeStar", "twoStar"] as const).map((key) => {
                  const labels = { twoStar: "2★", threeStar: "3★", fourStar: "4★", fiveStar: "5★" };
                  const delta = cutPoints.delta[key];
                  return (
                    <tr key={key} className="border-b border-border/50">
                      <td className="px-3 py-2 font-medium">{labels[key]}</td>
                      <td className="px-3 py-2 text-right">{cutPoints.fromYear[key]}</td>
                      <td className="px-3 py-2 text-right">{cutPoints.toYear[key]}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${delta > 0 ? "text-rose-500" : delta < 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                        {delta > 0 ? "+" : ""}{delta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {scoreStats && (
          <section className="rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-1 text-base font-semibold text-foreground">Cohort Score Statistics</h3>
            <p className="mb-4 text-xs text-muted-foreground">Raw performance scores for contracts in the {star}{"★"} band</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left" title="Descriptive statistic (mean, median, min, max, count)">Stat</th>
                  <th className="px-3 py-2 text-right" title={`Score statistic for contracts in this band in ${scoreStats.from.year}`}>{scoreStats.from.year}</th>
                  <th className="px-3 py-2 text-right" title={`Score statistic for contracts in this band in ${scoreStats.to.year}`}>{scoreStats.to.year}</th>
                </tr>
              </thead>
              <tbody>
                {(["mean", "median", "min", "max"] as const).map((stat) => (
                  <tr key={stat} className="border-b border-border/50">
                    <td className="px-3 py-2 font-medium capitalize">{stat}</td>
                    <td className="px-3 py-2 text-right">{scoreStats.from[stat] ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-right">{scoreStats.to[stat] ?? "\u2014"}</td>
                  </tr>
                ))}
                <tr className="border-b border-border/50">
                  <td className="px-3 py-2 font-medium">Contracts w/ score</td>
                  <td className="px-3 py-2 text-right">{scoreStats.from.count}</td>
                  <td className="px-3 py-2 text-right">{scoreStats.to.count}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* Within-band density + fractional position */}
      {(movement?.withinBandDensity || movement?.avgFractionalFrom != null) && (
        <>
        <div className="grid gap-6 lg:grid-cols-2">
          {movement.withinBandDensity && movement.withinBandDensity.lowerThreshold != null && movement.withinBandDensity.upperThreshold != null && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-1 text-base font-semibold text-foreground">Within-Band Score Density</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                How {star}{"★"} contracts distribute between thresholds ({movement.withinBandDensity.lowerThreshold}&ndash;{movement.withinBandDensity.upperThreshold})
              </p>
              <div className="space-y-3">
                <DensityBar label="Near lower threshold" count={movement.withinBandDensity.nearLowerThreshold} pct={movement.withinBandDensity.nearLowerPct} color="bg-rose-500/70" />
                <DensityBar label="Middle of band" count={movement.withinBandDensity.middle} pct={movement.withinBandDensity.middlePct} color="bg-sky-500/70" />
                <DensityBar label="Near upper threshold" count={movement.withinBandDensity.nearUpperThreshold} pct={movement.withinBandDensity.nearUpperPct} color="bg-emerald-500/70" />
              </div>
            </section>
          )}

          {movement.avgFractionalFrom != null && (
            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-1 text-base font-semibold text-foreground">Fractional Band Position</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Continuous position within star bands (e.g. 3.7 = 70% through the 3★ band)
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 text-left">Metric</th>
                    <th className="px-3 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-2 font-medium">Avg position ({fromYear})</td>
                    <td className="px-3 py-2 text-right font-semibold">{movement.avgFractionalFrom?.toFixed(2) ?? "\u2014"}</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-2 font-medium">Avg position ({toYear})</td>
                    <td className="px-3 py-2 text-right font-semibold">{movement.avgFractionalTo?.toFixed(2) ?? "\u2014"}</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="px-3 py-2 font-medium">Avg fractional change</td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      movement.avgFractionalChange != null
                        ? movement.avgFractionalChange > 0 ? "text-emerald-500" : movement.avgFractionalChange < 0 ? "text-rose-500" : "text-muted-foreground"
                        : "text-muted-foreground"
                    }`}>
                      {movement.avgFractionalChange != null ? `${movement.avgFractionalChange > 0 ? "+" : ""}${movement.avgFractionalChange.toFixed(2)}` : "\u2014"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Methodology: </span>
          <strong>Within-Band Density</strong> divides the score range between the lower and upper CMS cut points for a star band into three
          equal zones (near-lower, middle, near-upper) and counts how many contracts fall in each, revealing whether a cohort clusters near
          a threshold or sits safely in the middle.{" "}
          <strong>Fractional Band Position</strong> converts integer star ratings into continuous values by interpolating each contract&apos;s
          score between its band&apos;s lower and upper cut points (e.g., 3.7★ means 70% through the 3★ band). This compensates for
          CMS integer rounding and enables tracking of sub-star drift that whole-number ratings hide.
        </div>
        </>
      )}

      {/* Contract detail table */}
      {contracts.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Contract Details</h3>
              <p className="text-xs text-muted-foreground">{contracts.length} contracts in the {star}{"★"} band</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left" title="CMS contract ID (H or R prefix)">ID</th>
                  <ThSortable label="Contract" active={sortKey === "contractName"} asc={sortAsc} onClick={() => toggleSort("contractName")} tooltip="Contract name as reported by CMS" />
                  <ThSortable label="Organization" active={sortKey === "orgName"} asc={sortAsc} onClick={() => toggleSort("orgName")} tooltip="Parent organization operating the contract" />
                  <ThSortable label={`${fromYear} Score`} active={sortKey === "fromScore"} asc={sortAsc} onClick={() => toggleSort("fromScore")} align="right" tooltip={`Overall CMS Star Rating score in ${fromYear} (integer, CMS-rounded)`} />
                  <th className="px-3 py-2 text-right" title={`Overall star rating in ${fromYear} (1–5)`}>{fromYear} Star</th>
                  <ThSortable label={`${toYear} Score`} active={sortKey === "toScore"} asc={sortAsc} onClick={() => toggleSort("toScore")} align="right" tooltip={`Overall CMS Star Rating score in ${toYear} (integer, CMS-rounded)`} />
                  <th className="px-3 py-2 text-right" title={`Overall star rating in ${toYear} (1–5)`}>{toYear} Star</th>
                  <ThSortable label="Δ Score" active={sortKey === "scoreChange"} asc={sortAsc} onClick={() => toggleSort("scoreChange")} align="right" tooltip={`Change in overall score from ${fromYear} to ${toYear} (integer points)`} />
                  <ThSortable label="Δ Star" active={sortKey === "starChange"} asc={sortAsc} onClick={() => toggleSort("starChange")} align="right" tooltip={`Change in star rating from ${fromYear} to ${toYear}`} />
                  <ThSortable label="Δ Frac" active={sortKey === "fractionalChange"} asc={sortAsc} onClick={() => toggleSort("fractionalChange")} align="right" tooltip="Change in fractional band position — a continuous measure of movement within and across star bands that compensates for CMS integer rounding" />
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.contractId} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{c.contractId}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{c.contractName}</td>
                    <td className="px-3 py-2 max-w-[180px] truncate">{c.orgName}</td>
                    <td className="px-3 py-2 text-right">{c.fromScore ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{c.fromStar}{"★"}</td>
                    <td className="px-3 py-2 text-right">{c.toScore ?? "\u2014"}</td>
                    <td className="px-3 py-2 text-right font-semibold">{c.toStar}★</td>
                    {(() => {
                      const scoreChange = c.fromScore != null && c.toScore != null ? c.toScore - c.fromScore : null;
                      return (
                        <td className={`px-3 py-2 text-right font-semibold ${
                          scoreChange != null ? (scoreChange > 0 ? "text-emerald-500" : scoreChange < 0 ? "text-rose-500" : "text-muted-foreground") : "text-muted-foreground"
                        }`}>
                          {scoreChange != null ? `${scoreChange > 0 ? "+" : ""}${scoreChange}` : "\u2014"}
                        </td>
                      );
                    })()}
                    <td className={`px-3 py-2 text-right font-semibold ${c.starChange > 0 ? "text-emerald-500" : c.starChange < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                      {`${c.starChange > 0 ? "+" : ""}${c.starChange}`}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-medium ${
                      c.fractionalChange != null ? (c.fractionalChange > 0 ? "text-emerald-500" : c.fractionalChange < 0 ? "text-rose-500" : "text-muted-foreground") : "text-muted-foreground"
                    }`}>
                      {c.fractionalChange != null ? `${c.fractionalChange > 0 ? "+" : ""}${c.fractionalChange.toFixed(2)}` : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contracts.length > 25 && (
            <button onClick={() => setShowAll(!showAll)}
              className="mt-3 text-sm font-medium text-primary hover:underline">
              {showAll ? "Show fewer" : `Show all ${contracts.length} contracts`}
            </button>
          )}
        </section>
      )}
    </>
  );
}

function ThSortable({ label, active, asc, onClick, align = "left", tooltip }: { label: string; active: boolean; asc: boolean; onClick: () => void; align?: "left" | "right"; tooltip?: string }) {
  return (
    <th className={`px-3 py-2 cursor-pointer select-none hover:text-foreground ${align === "right" ? "text-right" : "text-left"}`} onClick={onClick} title={tooltip}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </span>
    </th>
  );
}

function DensityBar({ label, count, pct, color }: { label: string; count: number; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}
