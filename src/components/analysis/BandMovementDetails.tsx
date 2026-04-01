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
};

type SortKey = "contractName" | "orgName" | "fromScore" | "toScore" | "starChange";

type Props = {
  allBands: AllBandRow[];
  cutPoints: CutPointComparison | null;
  scoreStats: { from: ScoreStats; to: ScoreStats } | null;
  contracts: ContractMovementRow[];
  fromYear: number;
  toYear: number;
  star: StarRating;
};

export function BandMovementDetails({ allBands, cutPoints, scoreStats, contracts, fromYear, toYear, star }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("starChange");
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "contractName" || key === "orgName"); }
  };

  const sorted = [...contracts].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
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
                  <th className="px-3 py-2 text-left">Band</th>
                  <th className="px-3 py-2 text-right">Cohort</th>
                  <th className="px-3 py-2 text-right text-emerald-500">Improved</th>
                  <th className="px-3 py-2 text-right text-sky-500">Held</th>
                  <th className="px-3 py-2 text-right text-rose-500">Declined</th>
                  <th className="px-3 py-2 text-right">Avg Change</th>
                </tr>
              </thead>
              <tbody>
                {allBands.filter((b) => b.cohortSize > 0).map((b) => (
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
                  <th className="px-3 py-2 text-left">Threshold</th>
                  <th className="px-3 py-2 text-right">{cutPoints.fromYear.year}</th>
                  <th className="px-3 py-2 text-right">{cutPoints.toYear.year}</th>
                  <th className="px-3 py-2 text-right">Delta</th>
                </tr>
              </thead>
              <tbody>
                {(["twoStar", "threeStar", "fourStar", "fiveStar"] as const).map((key) => {
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
                  <th className="px-3 py-2 text-left">Stat</th>
                  <th className="px-3 py-2 text-right">{scoreStats.from.year}</th>
                  <th className="px-3 py-2 text-right">{scoreStats.to.year}</th>
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
                  <th className="px-3 py-2 text-left">ID</th>
                  <ThSortable label="Contract" active={sortKey === "contractName"} asc={sortAsc} onClick={() => toggleSort("contractName")} />
                  <ThSortable label="Organization" active={sortKey === "orgName"} asc={sortAsc} onClick={() => toggleSort("orgName")} />
                  <ThSortable label={`${fromYear} Score`} active={sortKey === "fromScore"} asc={sortAsc} onClick={() => toggleSort("fromScore")} align="right" />
                  <th className="px-3 py-2 text-right">{fromYear} Star</th>
                  <ThSortable label={`${toYear} Score`} active={sortKey === "toScore"} asc={sortAsc} onClick={() => toggleSort("toScore")} align="right" />
                  <th className="px-3 py-2 text-right">{toYear} Star</th>
                  <ThSortable label="Change" active={sortKey === "starChange"} asc={sortAsc} onClick={() => toggleSort("starChange")} align="right" />
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
                    <td className={`px-3 py-2 text-right font-semibold ${c.starChange > 0 ? "text-emerald-500" : c.starChange < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                      {`${c.starChange > 0 ? "+" : ""}${c.starChange}`}
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

function ThSortable({ label, active, asc, onClick, align = "left" }: { label: string; active: boolean; asc: boolean; onClick: () => void; align?: "left" | "right" }) {
  return (
    <th className={`px-3 py-2 cursor-pointer select-none hover:text-foreground ${align === "right" ? "text-right" : "text-left"}`} onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </span>
    </th>
  );
}
