"use client";

import { useMemo } from "react";
import { Trophy, TrendingDown, TrendingUp } from "lucide-react";
import type { LeaderboardEntry, LeaderboardResponse, LeaderboardSection } from "@/lib/leaderboard/types";
import { US_STATE_NAMES } from "@/lib/leaderboard/states";

function formatDelta(entry: LeaderboardEntry, metricType: LeaderboardSection["metricType"]): string {
  if (entry.delta === null || entry.delta === undefined) {
    return "";
  }
  const sign = entry.delta > 0 ? "+" : "";
  const value = metricType === "rate" ? `${entry.delta.toFixed(1)}%` : entry.delta.toFixed(1);
  return `${sign}${value}`;
}

function formatValue(entry: LeaderboardEntry, metricType: LeaderboardSection["metricType"]): string {
  if (entry.value === null || entry.value === undefined) {
    return "—";
  }
  return metricType === "rate" ? `${entry.value.toFixed(1)}%` : entry.value.toFixed(1);
}

function formatPrior(entry: LeaderboardEntry, metricType: LeaderboardSection["metricType"]): string {
  if (entry.priorValue === null || entry.priorValue === undefined) {
    return "—";
  }
  return metricType === "rate" ? `${entry.priorValue.toFixed(1)}%` : entry.priorValue.toFixed(1);
}

function LeaderboardList({
  title,
  icon: Icon,
  entries,
  metricType,
}: {
  title: string;
  icon: typeof Trophy;
  entries: LeaderboardEntry[];
  metricType: LeaderboardSection["metricType"];
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/60">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Insufficient data.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={`${title}-${entry.entityId}`} className="flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground">
                    {entry.rank}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{entry.entityLabel}</p>
                    {entry.parentOrganization && (
                      <p className="text-[0.65rem] text-muted-foreground">Parent Org {entry.parentOrganization}</p>
                    )}
                    {entry.contractId && entry.contractId !== entry.entityId && (
                      <p className="text-[0.65rem] text-muted-foreground">Contract {entry.contractId}</p>
                    )}
                    {entry.dominantState && (
                      <p className="text-[0.65rem] text-muted-foreground">
                        Dominant State {US_STATE_NAMES[entry.dominantState] ?? entry.dominantState}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end text-sm">
                  <span className="font-semibold text-foreground">{formatValue(entry, metricType)}</span>
                  <span className="text-[0.65rem] text-muted-foreground">Prev {formatPrior(entry, metricType)}</span>
                </div>
              </div>
              {entry.delta !== null && entry.delta !== undefined && (
                <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground">
                  <span>
                    {entry.dominantShare !== null && entry.dominantShare !== undefined
                      ? `Dominant share ${(entry.dominantShare * 100).toFixed(1)}%`
                      : entry.metadata?.contractCount
                      ? `${entry.metadata.contractCount} contracts`
                      : ""}
                  </span>
                  <span className={entry.delta > 0 ? "text-green-400" : entry.delta < 0 ? "text-red-400" : "text-muted-foreground"}>
                    {formatDelta(entry, metricType)}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function LeaderboardResults({ data }: { data: LeaderboardResponse }) {
  const summaryChips = useMemo(() => {
    const chips: string[] = [];
    if (data.mode === "contract") {
      chips.push(
        data.filters.stateOption === "all"
          ? "All Contracts"
          : `State ${(data.filters.state && (US_STATE_NAMES[String(data.filters.state)] ?? data.filters.state)) || "Unknown"}`
      );
      chips.push(
        data.filters.planTypeGroup === "ALL"
          ? "All Plan Types"
          : data.filters.planTypeGroup === "SNP"
          ? "SNP Plans"
          : "Non-SNP Plans"
      );
      chips.push(`Enrollment ${data.filters.enrollmentLevel}`);
      chips.push(`Top ${data.filters.topLimit ?? 10}`);
    } else {
      const bucketLabels: Record<string, string> = {
        all: "All Parent Orgs",
        lt5: "< 5 Contracts",
        "5to10": "5 - 10 Contracts",
        "10to20": "11 - 20 Contracts",
        "20plus": "21+ Contracts",
      };
      chips.push(bucketLabels[data.filters.bucket] ?? "Parent Orgs");
      chips.push(`Top ${data.filters.topLimit ?? 10}`);
    }
    if (data.dataYear) {
      chips.push(`Data ${data.dataYear}`);
    }
    if (data.priorYear) {
      chips.push(`Prior ${data.priorYear}`);
    }
    return chips;
  }, [data]);

  if (!data.sections || data.sections.length === 0) {
    return (
      <section className="rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground">
        No leaderboard data available for the selected filters.
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-wrap gap-3">
          {summaryChips.map((chip) => (
            <span key={chip} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {chip}
            </span>
          ))}
        </div>
      </div>

      {data.sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-8">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-foreground">{section.title}</h3>
            <p className="text-xs text-muted-foreground">
              Ranking based on {section.metricType === "rate" ? "rate percentage" : "star rating"} across the selected cohort.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <LeaderboardList title="Top Performers" icon={Trophy} entries={section.topPerformers} metricType={section.metricType} />
            <LeaderboardList title="Biggest Movers" icon={TrendingUp} entries={section.biggestMovers} metricType={section.metricType} />
            <LeaderboardList title="Biggest Decliners" icon={TrendingDown} entries={section.biggestDecliners} metricType={section.metricType} />
          </div>
        </div>
      ))}
    </section>
  );
}
