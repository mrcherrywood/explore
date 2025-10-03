"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, TriangleAlert, X } from "lucide-react";
import { ChartRenderer, ChartSpec } from "@/components/chart/ChartRenderer";

const slugifyLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

const shortenLabel = (value: string, maxLength = 28) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

type Selection = {
  comparisonType: "contract" | "organization";
  contractId: string;
  parentOrganization: string;
  years: number[];
};

type YoYComparisonResponse = {
  comparisonType?: "contract" | "organization";
  contractId?: string;
  parentOrganization?: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  years: number[];
  overallChart: ChartSpec | null;
  domainCharts: ChartSpec[];
  measureCharts: ChartSpec[];
};

export function YoYComparisonResults({ selection }: { selection: Selection }) {
  const [data, setData] = useState<YoYComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchComparison() {
      setIsLoading(true);
      setError(null);
      setData(null);
      try {
        const response = await fetch("/api/yoy/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selection),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to build year over year comparison");
        }

        const payload: YoYComparisonResponse = await response.json();
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to build year over year comparison");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchComparison();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  type SectionAnchor = {
    id: string;
    label: string;
  };

  const sectionAnchors = useMemo<SectionAnchor[]>(() => {
    if (!data) return [];

    const anchors: SectionAnchor[] = [{ id: "summary-overview", label: "Summary" }];

    if (data.overallChart) {
      anchors.push({ id: "overall-trend", label: data.overallChart.title || "Overall Trend" });
    }

    data.domainCharts?.forEach((chart, index) => {
      const label = chart.title || `Domain ${index + 1}`;
      anchors.push({ id: `domain-${index + 1}-${slugifyLabel(label)}`, label });
    });

    data.measureCharts?.forEach((chart, index) => {
      const label = chart.title || `Measure ${index + 1}`;
      anchors.push({ id: `measure-${index + 1}-${slugifyLabel(label)}`, label });
    });

    return anchors;
  }, [data]);

  useEffect(() => {
    if (!sectionAnchors.length) return;

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
          .sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top)
          )[0];

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

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center text-sm text-muted-foreground">
            Building year over year analysis for {selection.comparisonType === "contract" ? selection.contractId : selection.parentOrganization} across {selection.years.length} years
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-500/30 bg-red-500/5 p-8">
        <div className="flex flex-col items-center gap-3 py-14 text-red-200">
          <TriangleAlert className="h-8 w-8" />
          <div className="text-center text-sm font-medium">{error}</div>
        </div>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const headingLabel =
    selection.comparisonType === "organization"
      ? data.organizationMarketingName || selection.parentOrganization
      : data.contractName || data.organizationMarketingName || selection.contractId;
  const yearRange = `${Math.min(...data.years)} - ${Math.max(...data.years)}`;

  return (
    <>
      <section className="flex flex-col gap-6">
        <div
          id="summary-overview"
          className="rounded-3xl border border-border bg-card p-8"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                {selection.comparisonType === "contract" ? "Selected Contract" : "Selected Organization"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">{headingLabel}</h2>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {selection.comparisonType === "contract" ? (
                  <span className="rounded-full border border-border px-3 py-1">Contract {selection.contractId}</span>
                ) : (
                  <span className="rounded-full border border-border px-3 py-1">Organization</span>
                )}
                <span className="rounded-full border border-border px-3 py-1">{data.years.length} years</span>
                <span className="rounded-full border border-border px-3 py-1">{yearRange}</span>
              </div>
            </div>

            {sectionAnchors.length > 1 && (
              <div className="flex items-start justify-end">
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
        </div>

        {data.overallChart && (
          <div id="overall-trend" className="rounded-3xl border border-border bg-card p-8">
            <h3 className="mb-6 text-lg font-semibold text-foreground">
              {selection.comparisonType === "organization"
                ? "Average Overall Star Rating Trend"
                : "Overall Star Rating Trend"}
            </h3>
            <ChartRenderer spec={data.overallChart} />
          </div>
        )}

        {data.domainCharts && data.domainCharts.length > 0 && (
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-8 py-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full bg-primary"></div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">Domain Star Rating Trends</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selection.comparisonType === "organization"
                      ? "Average weighted star ratings by domain across all contracts over time"
                      : "Weighted average star ratings by domain over time"}
                  </p>
                </div>
              </div>
            </div>
            {data.domainCharts.map((chart: ChartSpec, index: number) => {
              const label = chart.title || `Domain ${index + 1}`;
              const id = `domain-${index + 1}-${slugifyLabel(label)}`;
              return (
                <div
                  key={`${chart.title ?? "domain"}-${index}`}
                  id={id}
                  className="rounded-3xl border border-border bg-card p-8"
                >
                  {chart.title && (
                    <h3 className="mb-6 text-lg font-semibold text-foreground">{chart.title}</h3>
                  )}
                  <ChartRenderer spec={chart} />
                </div>
              );
            })}
          </div>
        )}

        {data.measureCharts.length > 0 && (
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-8 py-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full bg-primary"></div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">Individual Measure Performance Trends</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selection.comparisonType === "organization"
                      ? "Average rate percentages and star ratings for individual measures across all contracts over time"
                      : "Rate percentages and star ratings for individual measures over time"}
                  </p>
                </div>
              </div>
            </div>
            {data.measureCharts.map((chart: ChartSpec, index: number) => {
              const label = chart.title || `Measure ${index + 1}`;
              const id = `measure-${index + 1}-${slugifyLabel(label)}`;
              return (
                <div
                  key={`${chart.title ?? "measure"}-${index}`}
                  id={id}
                  className="rounded-3xl border border-border bg-card p-8"
                >
                  {chart.title && (
                    <h3 className="mb-6 text-lg font-semibold text-foreground">{chart.title}</h3>
                  )}
                  <ChartRenderer spec={chart} />
                </div>
              );
            })}
          </div>
        )}
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
