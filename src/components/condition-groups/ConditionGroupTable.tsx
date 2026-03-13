"use client";

import { useMemo, useState } from "react";

type MeasureDetail = {
  code: string;
  name: string;
  weight: number;
  yearData: Record<string, { avgStar: number | null; avgRate: number | null }>;
};

type GroupDetail = {
  groupId: string;
  groupLabel: string;
  groupColor: string;
  measures: MeasureDetail[];
  yearScores: Record<string, number | null>;
};

type ComparisonData = {
  contractCount: number;
  groupDetails: GroupDetail[];
};

type SortKey = {
  column: string;
  direction: "asc" | "desc";
};

type Props = {
  group: GroupDetail;
  years: number[];
  stateGroup: GroupDetail | undefined;
  stateComparison: ComparisonData | null;
  nationalGroup: GroupDetail | undefined;
  nationalComparison: ComparisonData | null;
};

function getSortValue(
  measure: MeasureDetail,
  column: string,
  stateGroup: GroupDetail | undefined,
  nationalGroup: GroupDetail | undefined
): number | string | null {
  if (column === "name") return measure.name.toLowerCase();
  if (column === "weight") return measure.weight;

  const [prefix, yearStr] = column.split(":");
  if (!yearStr) return null;

  if (prefix === "stars") return measure.yearData[yearStr]?.avgStar ?? null;
  if (prefix === "rate") return measure.yearData[yearStr]?.avgRate ?? null;

  const lookup = (group: GroupDetail | undefined) =>
    group?.measures.find(
      (m) => m.code === measure.code || m.name.toLowerCase() === measure.name.toLowerCase()
    );

  if (prefix === "state_stars") return lookup(stateGroup)?.yearData[yearStr]?.avgStar ?? null;
  if (prefix === "state_rate") return lookup(stateGroup)?.yearData[yearStr]?.avgRate ?? null;
  if (prefix === "natl_stars") return lookup(nationalGroup)?.yearData[yearStr]?.avgStar ?? null;
  if (prefix === "natl_rate") return lookup(nationalGroup)?.yearData[yearStr]?.avgRate ?? null;

  return null;
}

function compareValues(
  a: number | string | null,
  b: number | string | null,
  direction: "asc" | "desc"
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const cmp = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : (a as number) - (b as number);
  return direction === "asc" ? cmp : -cmp;
}

export function ConditionGroupTable({
  group,
  years,
  stateGroup,
  stateComparison,
  nationalGroup,
  nationalComparison,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [expanded, setExpanded] = useState(false);

  const toggleSort = (column: string) => {
    setSortKey((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };

  const sortedMeasures = useMemo(() => {
    if (!sortKey) return group.measures;
    return [...group.measures].sort((a, b) => {
      const aVal = getSortValue(a, sortKey.column, stateGroup, nationalGroup);
      const bVal = getSortValue(b, sortKey.column, stateGroup, nationalGroup);
      return compareValues(aVal, bVal, sortKey.direction);
    });
  }, [group.measures, sortKey, stateGroup, nationalGroup]);

  const colsPerYear = 2 + (stateComparison ? 2 : 0) + (nationalComparison ? 2 : 0);
  const mostRecentYear = years[years.length - 1];
  const visibleYears = expanded ? years : [mostRecentYear];
  const canExpand = years.length > 1;

  const thButton = "cursor-pointer select-none hover:text-foreground transition";

  return (
    <section className="rounded-3xl border border-border bg-card p-8">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: group.groupColor }} />
        <h3 className="text-lg font-semibold text-foreground">{group.groupLabel}</h3>
      </div>

      <div className="mb-6 flex items-center gap-4 flex-wrap">
        {visibleYears.map((y) => {
          const score = group.yearScores[y.toString()];
          const stateScore = stateGroup?.yearScores[y.toString()];
          const nationalScore = nationalGroup?.yearScores[y.toString()];
          return (
            <div
              key={y}
              className="flex flex-col items-center rounded-xl border border-border bg-muted px-5 py-3"
            >
              <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{y}</span>
              <span className="text-lg font-bold text-foreground">
                {score != null ? `★ ${score.toFixed(2)}` : "—"}
              </span>
              {stateComparison && stateScore != null && (
                <span className="mt-0.5 text-xs text-muted-foreground/70">
                  State avg: ★ {stateScore.toFixed(2)}
                </span>
              )}
              {nationalComparison && nationalScore != null && (
                <span className="mt-0.5 text-xs text-muted-foreground/70">
                  Natl avg: ★ {nationalScore.toFixed(2)}
                </span>
              )}
            </div>
          );
        })}
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            {expanded ? (
              <>
                <span>▸</span> Show {mostRecentYear} only
              </>
            ) : (
              <>
                <span>◂</span> Show all years ({years.length})
              </>
            )}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-3 py-2 font-medium text-muted-foreground">
                <button type="button" onClick={() => toggleSort("name")} className={thButton}>
                  Measure
                </button>
              </th>
              <th className="px-3 py-2 text-center font-medium text-muted-foreground">
                <button type="button" onClick={() => toggleSort("weight")} className={thButton}>
                  Weight
                </button>
              </th>
              {visibleYears.map((y) => (
                <th key={y} className="px-3 py-2 text-center font-medium text-muted-foreground" colSpan={colsPerYear}>
                  {y}
                </th>
              ))}
            </tr>
            <tr className="border-b border-border/50">
              <th />
              <th />
              {visibleYears.map((y) => (
                <th key={y} colSpan={colsPerYear} className="px-1 pb-1">
                  <div className="flex text-[0.6rem] text-muted-foreground">
                    <button type="button" onClick={() => toggleSort(`stars:${y}`)} className={`flex-1 text-center ${thButton}`}>
                      Stars
                    </button>
                    <button type="button" onClick={() => toggleSort(`rate:${y}`)} className={`flex-1 text-center ${thButton}`}>
                      Rate %
                    </button>
                    {stateComparison && (
                      <>
                        <button type="button" onClick={() => toggleSort(`state_stars:${y}`)} className={`flex-1 text-center ${thButton}`}>
                          State Stars
                        </button>
                        <button type="button" onClick={() => toggleSort(`state_rate:${y}`)} className={`flex-1 text-center ${thButton}`}>
                          State Rate
                        </button>
                      </>
                    )}
                    {nationalComparison && (
                      <>
                        <button type="button" onClick={() => toggleSort(`natl_stars:${y}`)} className={`flex-1 text-center ${thButton}`}>
                          Natl Stars
                        </button>
                        <button type="button" onClick={() => toggleSort(`natl_rate:${y}`)} className={`flex-1 text-center ${thButton}`}>
                          Natl Rate
                        </button>
                      </>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedMeasures.map((measure) => {
              const findMatch = (group: GroupDetail | undefined) =>
                group?.measures.find(
                  (m) => m.code === measure.code || m.name.toLowerCase() === measure.name.toLowerCase()
                );
              const stateMeasure = findMatch(stateGroup);
              const nationalMeasure = findMatch(nationalGroup);
              return (
                <tr
                  key={`${measure.code}-${measure.name}`}
                  className="border-b border-border/30 transition hover:bg-accent/50"
                >
                  <td className="max-w-xs truncate px-3 py-2.5 text-foreground" title={measure.name}>
                    <span className="mr-2 text-xs font-mono text-muted-foreground">{measure.code}</span>
                    {measure.name}
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">{measure.weight}</td>
                  {visibleYears.map((y) => {
                    const yd = measure.yearData[y.toString()];
                    const syd = stateMeasure?.yearData[y.toString()];
                    const nyd = nationalMeasure?.yearData[y.toString()];
                    return (
                      <td key={y} colSpan={colsPerYear} className="px-1 py-2.5">
                        <div className="flex">
                          <span className="flex-1 text-center text-foreground">
                            {yd?.avgStar != null ? yd.avgStar.toFixed(1) : "—"}
                          </span>
                          <span className="flex-1 text-center text-muted-foreground">
                            {yd?.avgRate != null ? `${yd.avgRate.toFixed(1)}%` : "—"}
                          </span>
                          {stateComparison && (
                            <>
                              <span className="flex-1 text-center text-muted-foreground/50">
                                {syd?.avgStar != null ? syd.avgStar.toFixed(1) : "—"}
                              </span>
                              <span className="flex-1 text-center text-muted-foreground/50">
                                {syd?.avgRate != null ? `${syd.avgRate.toFixed(1)}%` : "—"}
                              </span>
                            </>
                          )}
                          {nationalComparison && (
                            <>
                              <span className="flex-1 text-center text-muted-foreground/50">
                                {nyd?.avgStar != null ? nyd.avgStar.toFixed(1) : "—"}
                              </span>
                              <span className="flex-1 text-center text-muted-foreground/50">
                                {nyd?.avgRate != null ? `${nyd.avgRate.toFixed(1)}%` : "—"}
                              </span>
                            </>
                          )}
                        </div>
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
  );
}
