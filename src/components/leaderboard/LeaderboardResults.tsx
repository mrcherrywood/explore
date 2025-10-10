"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Trophy, TrendingDown, TrendingUp, X } from "lucide-react";
import Link from "next/link";
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

const slugifyLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

const shortenLabel = (value: string, maxLength = 32) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

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
          {entries.map((entry) => {
            const content = (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground">
                      {entry.rank}
                    </span>
                    <div className="flex flex-col">
                      <p className="text-sm font-semibold text-foreground">{entry.entityLabel}</p>
                      {entry.totalEnrollment && (
                        <p className="text-[0.65rem] text-muted-foreground">{entry.totalEnrollment.toLocaleString()} enrolled</p>
                      )}
                      {entry.parentOrganization && (
                        <p className="text-[0.65rem] text-muted-foreground">Parent Org {entry.parentOrganization}</p>
                      )}
                      {entry.isBlueCrossBlueShield && (
                        <p className="text-[0.65rem] text-primary">Blue Cross Blue Shield</p>
                      )}
                      {entry.contractId && entry.dominantState && (
                        <p className="text-[0.65rem] text-muted-foreground">
                          Dominant {entry.dominantState} • {(entry.dominantShare ?? 0) > 0 ? `${((entry.dominantShare ?? 0) * 100).toFixed(1)}%` : "<40%"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end text-sm">
                    <span className="font-semibold text-foreground">
                      {formatValue(entry, metricType)}
                      {entry.reportYear ? (
                        <span className="ml-2 text-[0.65rem] font-normal text-muted-foreground">({entry.reportYear})</span>
                      ) : null}
                    </span>
                    <span className="text-[0.65rem] text-muted-foreground">
                      Prev {formatPrior(entry, metricType)}
                      {entry.priorYear ? ` (${entry.priorYear})` : ""}
                    </span>
                  </div>
                </div>
                {entry.delta !== null && entry.delta !== undefined && (
                  <div className="flex items-center justify-between text-xs">
                    <span>
                      {entry.metadata?.contractCount ? `${entry.metadata.contractCount} contracts` : ""}
                      {entry.metadata?.blueContractCount
                        ? `${entry.metadata?.contractCount ? " • " : ""}${entry.metadata.blueContractCount} Blue`
                        : ""}
                    </span>
                    <span className={entry.delta > 0 ? "text-green-400" : entry.delta < 0 ? "text-red-400" : "text-muted-foreground"}>
                      {formatDelta(entry, metricType)}
                    </span>
                  </div>
                )}
              </>
            );

            const baseClasses = "flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/50 p-3";
            const linkClasses = entry.contractId ? "transition-all hover:border-primary/40 hover:bg-muted/70 hover:shadow-sm" : "";

            return (
              <li key={`${title}-${entry.entityId}`}>
                {entry.contractId ? (
                  <Link
                    href={`/summary?contractId=${entry.contractId}${entry.reportYear ? `&year=${entry.reportYear}` : ""}`}
                    className={`${baseClasses} ${linkClasses}`}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className={baseClasses}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function LeaderboardResults({ data }: { data: LeaderboardResponse }) {
  const summaryChips = useMemo(() => {
    const chips: string[] = [];
    if (data.mode === "contract") {
      const contractFilters = data.filters as import("@/lib/leaderboard/types").ContractLeaderboardFilters;
      chips.push(
        contractFilters.stateOption === "all"
          ? "All Contracts"
          : `State ${(contractFilters.state && (US_STATE_NAMES[String(contractFilters.state)] ?? contractFilters.state)) || "Unknown"}`
      );
      chips.push(
        contractFilters.planTypeGroup === "ALL"
          ? "All Plan Types"
          : contractFilters.planTypeGroup === "SNP"
          ? "SNP Plans"
          : "Non-SNP Plans"
      );
      chips.push(contractFilters.contractSeries === "H_ONLY" ? "H-Series Contracts" : "S-Series Contracts");
      chips.push(`Enrollment ${contractFilters.enrollmentLevel}`);
      chips.push(`Top ${contractFilters.topLimit ?? 10}`);
      if (contractFilters.blueOnly) {
        chips.push("Blue Cross Blue Shield Only");
      }
    } else {
      const orgFilters = data.filters as import("@/lib/leaderboard/types").OrganizationLeaderboardFilters;
      const bucketLabels: Record<string, string> = {
        all: "All Parent Orgs",
        lt5: "< 5 Contracts",
        "5to10": "5 - 10 Contracts",
        "10to20": "11 - 20 Contracts",
        "20plus": "21+ Contracts",
      };
      chips.push(bucketLabels[orgFilters.bucket] ?? "Parent Orgs");
      chips.push(`Top ${orgFilters.topLimit ?? 10}`);
      if (orgFilters.blueOnly) {
        chips.push("Blue Cross Blue Shield Only");
      }
    }
    if (data.dataYear) {
      chips.push(`Data ${data.dataYear}`);
    }
    if (data.priorYear) {
      chips.push(`Prior ${data.priorYear}`);
    }
    return chips;
  }, [data]);

  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const sectionAnchors = useMemo(() => {
    const anchors: { id: string; label: string }[] = [{ id: "leaderboard-summary", label: "Summary" }];

    data.sections.forEach((section, index) => {
      const title = section.title || `Section ${index + 1}`;
      anchors.push({ id: `leaderboard-section-${index + 1}-${slugifyLabel(title)}`, label: title });
    });

    return anchors;
  }, [data.sections]);

  useEffect(() => {
    if (sectionAnchors.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]) {
          setActiveSectionId(visible[0].target.id);
          return;
        }

        const nearest = entries
          .slice()
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))[0];

        if (nearest) {
          setActiveSectionId(nearest.target.id);
        }
      },
      {
        rootMargin: "-45% 0px -45% 0px",
        threshold: [0.1, 0.5, 0.75],
      }
    );

    sectionAnchors.forEach((anchor) => {
      const element = document.getElementById(anchor.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sectionAnchors]);

  useEffect(() => {
    if (sectionAnchors.length > 0) {
      setActiveSectionId((prev) => prev ?? sectionAnchors[0].id);
    }
  }, [sectionAnchors]);

  useEffect(() => {
    if (!isDrawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  const handleAnchorJump = (anchorId: string) => {
    const element = document.getElementById(anchorId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setActiveSectionId(anchorId);
    setIsDrawerOpen(false);
  };

  if (!data.sections || data.sections.length === 0) {
    return (
      <section className="rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground">
        No leaderboard data available for the selected filters.
      </section>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-6">
        <div id="leaderboard-summary" className="rounded-3xl border border-border bg-card p-8">
          <div className="flex flex-wrap gap-3">
            {summaryChips.map((chip) => (
              <span key={chip} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                {chip}
              </span>
            ))}
          </div>

          {sectionAnchors.length > 1 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-primary/10 px-4 py-2 text-xs font-medium text-primary shadow-sm transition hover:border-primary/70 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Jump to section
              </button>
            </div>
          )}
        </div>

        {data.sections.map((section, index) => (
          <div
            key={section.key}
            id={`leaderboard-section-${index + 1}-${slugifyLabel(section.title || `section-${index + 1}`)}`}
            className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-8"
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-foreground">{section.title}</h3>
              <p className="text-xs text-muted-foreground">
                Ranking based on {section.metricType === "rate" ? "rate percentage" : "star rating"} across the selected cohort
                {section.direction === "lower" ? " (lower is better)" : ""}.
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

      {sectionAnchors.length > 1 && isDrawerOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Quick jump</p>
                <h3 className="text-lg font-semibold text-foreground">Navigate to a section</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-full border border-border bg-card p-2 text-muted-foreground transition hover:text-foreground"
                aria-label="Close navigation drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-2">
              {sectionAnchors.map((anchor) => {
                const isActive = activeSectionId === anchor.id;
                return (
                  <button
                    key={anchor.id}
                    type="button"
                    onClick={() => handleAnchorJump(anchor.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-2 text-sm transition ${
                      isActive
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-foreground hover:border-border/70"
                    }`}
                    title={anchor.label}
                  >
                    <span className="max-w-xs truncate text-left md:max-w-sm">{shortenLabel(anchor.label, 48)}</span>
                    {isActive && <Check className="ml-3 h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
