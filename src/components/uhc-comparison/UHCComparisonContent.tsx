"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Loader2, Minus, TrendingUp, TriangleAlert, X } from "lucide-react";

type StarDistribution = {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
  total: number;
};

type ScoreStats = {
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
  scores: number[];
};

type ScoresByStarRating = {
  "1": ScoreStats;
  "2": ScoreStats;
  "3": ScoreStats;
  "4": ScoreStats;
  "5": ScoreStats;
};

type MeasureComparison = {
  measureCode: string;
  measureName: string;
  domain: string | null;
  year: number;
  uhc: StarDistribution;
  market: StarDistribution;
  uhcPercentages: Record<string, number>;
  marketPercentages: Record<string, number>;
  uhcScores?: ScoreStats;
  marketScores?: ScoreStats;
  uhcScoresByStar?: ScoresByStarRating;
  marketScoresByStar?: ScoresByStarRating;
};

type YearSummary = {
  year: number;
  uhcContractCount: number;
  marketContractCount: number;
  measures: MeasureComparison[];
};

type UHCComparisonResponse = {
  years: number[];
  yearSummaries: YearSummary[];
  uhcParentOrganizations: string[];
};

type ViewMode = "single-year" | "yoy-change";

const slugifyLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

const shortenLabel = (value: string, maxLength = 40) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

const STAR_COLORS: Record<string, string> = {
  "1": "#ef4444", // red
  "2": "#f97316", // orange
  "3": "#facc15", // yellow
  "4": "#84cc16", // lime
  "5": "#22c55e", // green
};

export function UHCComparisonContent() {
  const [data, setData] = useState<UHCComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("single-year");

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/uhc-comparison");
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to fetch UHC comparison data");
        }
        const payload: UHCComparisonResponse = await response.json();
        setData(payload);
        if (payload.years.length > 0 && !selectedYear) {
          setSelectedYear(payload.years[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [selectedYear]);

  const yearSummary = useMemo(() => {
    if (!data || !selectedYear) return null;
    return data.yearSummaries.find((s) => s.year === selectedYear) ?? null;
  }, [data, selectedYear]);

  const domains = useMemo(() => {
    if (!yearSummary) return [];
    const domainSet = new Set<string>();
    yearSummary.measures.forEach((m) => {
      if (m.domain) domainSet.add(m.domain);
    });
    return Array.from(domainSet).sort();
  }, [yearSummary]);

  const filteredMeasures = useMemo(() => {
    if (!yearSummary) return [];
    return yearSummary.measures
      .filter((m) => {
        if (selectedDomain !== "all" && m.domain !== selectedDomain) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            m.measureName.toLowerCase().includes(query) ||
            m.measureCode.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => a.measureName.localeCompare(b.measureName));
  }, [yearSummary, selectedDomain, searchQuery]);

  // Year-over-Year comparison data
  const yoyData = useMemo(() => {
    if (!data || data.years.length < 2) return null;
    
    const [newerYear, olderYear] = data.years; // years are sorted DESC
    const newerSummary = data.yearSummaries.find(s => s.year === newerYear);
    const olderSummary = data.yearSummaries.find(s => s.year === olderYear);
    
    if (!newerSummary || !olderSummary) return null;

    // Build map of older year measures by code
    const olderMeasureMap = new Map<string, MeasureComparison>();
    olderSummary.measures.forEach(m => olderMeasureMap.set(m.measureCode, m));

    // Calculate YoY changes for measures that exist in both years
    const comparisons = newerSummary.measures
      .filter(newerMeasure => {
        const olderMeasure = olderMeasureMap.get(newerMeasure.measureCode);
        if (!olderMeasure) return false;
        if (selectedDomain !== "all" && newerMeasure.domain !== selectedDomain) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            newerMeasure.measureName.toLowerCase().includes(query) ||
            newerMeasure.measureCode.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .map(newerMeasure => {
        const olderMeasure = olderMeasureMap.get(newerMeasure.measureCode)!;
        
        // Calculate high star (4-5) percentage change for UHC and Market
        const uhcHighStarOlder = (olderMeasure.uhcPercentages["4"] ?? 0) + (olderMeasure.uhcPercentages["5"] ?? 0);
        const uhcHighStarNewer = (newerMeasure.uhcPercentages["4"] ?? 0) + (newerMeasure.uhcPercentages["5"] ?? 0);
        const uhcHighStarChange = uhcHighStarNewer - uhcHighStarOlder;
        
        const marketHighStarOlder = (olderMeasure.marketPercentages["4"] ?? 0) + (olderMeasure.marketPercentages["5"] ?? 0);
        const marketHighStarNewer = (newerMeasure.marketPercentages["4"] ?? 0) + (newerMeasure.marketPercentages["5"] ?? 0);
        const marketHighStarChange = marketHighStarNewer - marketHighStarOlder;

        // Calculate individual star rating changes
        const uhcStarChanges: Record<string, number> = {};
        const marketStarChanges: Record<string, number> = {};
        
        (["1", "2", "3", "4", "5"] as const).forEach(star => {
          uhcStarChanges[star] = (newerMeasure.uhcPercentages[star] ?? 0) - (olderMeasure.uhcPercentages[star] ?? 0);
          marketStarChanges[star] = (newerMeasure.marketPercentages[star] ?? 0) - (olderMeasure.marketPercentages[star] ?? 0);
        });

        // Calculate score changes
        const uhcScoreOlder = olderMeasure.uhcScores?.avg ?? null;
        const uhcScoreNewer = newerMeasure.uhcScores?.avg ?? null;
        const uhcScoreChange = (uhcScoreOlder !== null && uhcScoreNewer !== null) 
          ? uhcScoreNewer - uhcScoreOlder 
          : null;
        
        const marketScoreOlder = olderMeasure.marketScores?.avg ?? null;
        const marketScoreNewer = newerMeasure.marketScores?.avg ?? null;
        const marketScoreChange = (marketScoreOlder !== null && marketScoreNewer !== null) 
          ? marketScoreNewer - marketScoreOlder 
          : null;

        const scoreRelativePerformance = (uhcScoreChange !== null && marketScoreChange !== null)
          ? uhcScoreChange - marketScoreChange
          : null;

        return {
          measureCode: newerMeasure.measureCode,
          measureName: newerMeasure.measureName,
          domain: newerMeasure.domain,
          olderYear,
          newerYear,
          uhcHighStarOlder,
          uhcHighStarNewer,
          uhcHighStarChange,
          marketHighStarOlder,
          marketHighStarNewer,
          marketHighStarChange,
          uhcStarChanges,
          marketStarChanges,
          // Did UHC outperform market in improvement?
          uhcOutperformedMarket: uhcHighStarChange > marketHighStarChange,
          relativePerformance: uhcHighStarChange - marketHighStarChange,
          // Score changes
          uhcScoreOlder,
          uhcScoreNewer,
          uhcScoreChange,
          marketScoreOlder,
          marketScoreNewer,
          marketScoreChange,
          scoreRelativePerformance,
          uhcScoreOutperformedMarket: scoreRelativePerformance !== null && scoreRelativePerformance > 0,
          // Current year data for context
          newerMeasure,
          olderMeasure,
        };
      })
      .sort((a, b) => a.measureName.localeCompare(b.measureName));

    return {
      olderYear,
      newerYear,
      comparisons,
      olderSummary,
      newerSummary,
    };
  }, [data, selectedDomain, searchQuery]);

  const sectionAnchors = useMemo(() => {
    if (!filteredMeasures.length) return [];
    const anchors = [{ id: "uhc-summary", label: "Summary" }];
    filteredMeasures.forEach((m, index) => {
      anchors.push({
        id: `measure-${index}-${slugifyLabel(m.measureCode)}`,
        label: m.measureName,
      });
    });
    return anchors;
  }, [filteredMeasures]);

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
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))[0];

        if (nearest) {
          setActiveSectionId(nearest.target.id);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0.1, 0.5, 0.75] }
    );

    sectionAnchors.forEach((anchor) => {
      const el = document.getElementById(anchor.id);
      if (el) observer.observe(el);
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
      if (event.key === "Escape") setIsDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawerOpen]);

  const handleAnchorJump = (anchorId: string) => {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSectionId(anchorId);
    setIsDrawerOpen(false);
  };

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center text-sm text-muted-foreground">
            Loading UnitedHealth vs Market comparison data...
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

  if (!data || !yearSummary) {
    return (
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="text-center text-muted-foreground py-10">
          No comparison data available.
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-6">
        {/* Summary Card */}
        <div id="uhc-summary" className="rounded-3xl border border-border bg-card p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                  Competitive Analysis
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">
                  UnitedHealth vs Rest of Market
                </h2>
                <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                  Compare star rating distributions for each measure between UnitedHealth contracts
                  and the rest of the marketplace. This analysis shows what percentage of contracts
                  received each star rating.
                </p>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-3 py-1">
                    {data.years.length} Years of Data
                  </span>
                  {data.uhcParentOrganizations.length > 0 && (
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-primary">
                      UHC Orgs: {data.uhcParentOrganizations.join(", ")}
                    </span>
                  )}
                </div>
              </div>

              {sectionAnchors.length > 1 && (
                <div className="flex items-start justify-end">
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-primary/10 px-4 py-2 text-xs font-medium text-primary shadow-sm transition hover:border-primary/70 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    Jump to measure
                  </button>
                </div>
              )}
            </div>

            {/* View Mode Toggle */}
            {data.years.length >= 2 && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("single-year")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    viewMode === "single-year"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Single Year
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("yoy-change")}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                    viewMode === "yoy-change"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <TrendingUp className="h-4 w-4" />
                  Year-over-Year Change
                </button>
              </div>
            )}

            {/* Year & Domain Selectors */}
            <div className="flex flex-wrap gap-4">
              {/* Year Selector - Only show in single-year mode */}
              {viewMode === "single-year" && (
                <div className="relative">
                  <label className="block text-xs text-muted-foreground mb-1.5">Year</label>
                  <div className="relative">
                    <select
                      value={selectedYear ?? ""}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="appearance-none rounded-lg border border-border bg-background px-4 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {data.years.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              )}

              {/* Domain Filter */}
              <div className="relative">
                <label className="block text-xs text-muted-foreground mb-1.5">Domain</label>
                <div className="relative">
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="appearance-none rounded-lg border border-border bg-background px-4 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="all">All Domains</option>
                    {domains.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-muted-foreground mb-1.5">Search Measures</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or code..."
                  className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Stats Cards - Single Year View */}
            {viewMode === "single-year" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
                  <p className="text-xs text-muted-foreground">UnitedHealth Rated Contracts</p>
                  <p className="mt-2 text-2xl font-semibold text-primary">
                    {yearSummary.uhcContractCount.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Contracts with star ratings in {selectedYear}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Rest of Market Rated Contracts</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {yearSummary.marketContractCount.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Contracts with star ratings in {selectedYear}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Measures Analyzed</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {filteredMeasures.length.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedDomain === "all" ? "All domains" : selectedDomain}
                  </p>
                </div>
                <div className="rounded-2xl border border-border bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Domains</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {domains.length.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">With measure data</p>
                </div>
              </div>
            )}

            {/* Stats Cards - YoY View */}
            {viewMode === "yoy-change" && yoyData && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
                  <p className="text-xs text-muted-foreground">Year Comparison</p>
                  <p className="mt-2 text-2xl font-semibold text-primary">
                    {yoyData.olderYear} → {yoyData.newerYear}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Performance change analysis</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Measures Compared</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {yoyData.comparisons.length.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Available in both years</p>
                </div>
                <div className="rounded-2xl border border-green-500/40 bg-green-500/5 p-4">
                  <p className="text-xs text-muted-foreground">UHC Outperformed Market</p>
                  <p className="mt-2 text-2xl font-semibold text-green-500">
                    {yoyData.comparisons.filter(c => c.uhcOutperformedMarket).length}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Measures where UHC improved more</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Market Outperformed UHC</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {yoyData.comparisons.filter(c => !c.uhcOutperformedMarket).length}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Measures where market improved more</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Single Year: Measure Comparisons */}
        {viewMode === "single-year" && filteredMeasures.length > 0 && (
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-8 py-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full bg-primary" />
                <div>
                  <h3 className="text-xl font-bold text-foreground">Star Distribution by Measure</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Percentage of contracts receiving each star rating for {selectedYear}
                  </p>
                </div>
              </div>
            </div>

            {filteredMeasures.map((measure, index) => {
              const anchorId = `measure-${index}-${slugifyLabel(measure.measureCode)}`;
              return (
                <div
                  key={`${measure.measureCode}-${measure.year}`}
                  id={anchorId}
                  className="rounded-3xl border border-border bg-card p-8"
                >
                  <div className="mb-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          {measure.measureName}
                        </h3>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border px-2 py-0.5">
                            {measure.measureCode}
                          </span>
                          {measure.domain && (
                            <span className="rounded-full border border-border px-2 py-0.5">
                              {measure.domain}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <div className="text-center">
                          <p className="text-muted-foreground">UHC</p>
                          <p className="text-lg font-semibold text-foreground">
                            {measure.uhc.total}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground">Market</p>
                          <p className="text-lg font-semibold text-foreground">
                            {measure.market.total}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Measure Score Comparison */}
                  {((measure.uhcScores?.count ?? 0) > 0 || (measure.marketScores?.count ?? 0) > 0) && (
                    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                        <p className="text-xs text-muted-foreground mb-2">UHC Average Score</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-primary">
                            {measure.uhcScores?.avg != null ? `${measure.uhcScores.avg.toFixed(1)}%` : "N/A"}
                          </span>
                          {(measure.uhcScores?.count ?? 0) > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ({measure.uhcScores?.count} contracts)
                            </span>
                          )}
                        </div>
                        {measure.uhcScores?.min != null && measure.uhcScores?.max != null && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Range: {measure.uhcScores.min.toFixed(1)}% – {measure.uhcScores.max.toFixed(1)}%
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl border border-border bg-muted p-4">
                        <p className="text-xs text-muted-foreground mb-2">Market Average Score</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-foreground">
                            {measure.marketScores?.avg != null ? `${measure.marketScores.avg.toFixed(1)}%` : "N/A"}
                          </span>
                          {(measure.marketScores?.count ?? 0) > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ({measure.marketScores?.count} contracts)
                            </span>
                          )}
                        </div>
                        {measure.marketScores?.min != null && measure.marketScores?.max != null && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Range: {measure.marketScores.min.toFixed(1)}% – {measure.marketScores.max.toFixed(1)}%
                          </p>
                        )}
                      </div>
                      {/* Score Difference Indicator */}
                      {measure.uhcScores?.avg != null && measure.marketScores?.avg != null && (
                        <div className="sm:col-span-2">
                          <div className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                            measure.uhcScores.avg > measure.marketScores.avg
                              ? "bg-green-500/10 text-green-500"
                              : measure.uhcScores.avg < measure.marketScores.avg
                                ? "bg-red-500/10 text-red-500"
                                : "bg-muted text-muted-foreground"
                          }`}>
                            {measure.uhcScores.avg > measure.marketScores.avg ? (
                              <>
                                <ArrowUp className="h-4 w-4" />
                                UHC outperforming by {(measure.uhcScores.avg - measure.marketScores.avg).toFixed(1)} pts
                              </>
                            ) : measure.uhcScores.avg < measure.marketScores.avg ? (
                              <>
                                <ArrowDown className="h-4 w-4" />
                                Market outperforming by {(measure.marketScores.avg - measure.uhcScores.avg).toFixed(1)} pts
                              </>
                            ) : (
                              <>
                                <Minus className="h-4 w-4" />
                                Even performance
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Distribution Table with Scores by Star */}
                  <div className="mb-6 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">Star Rating</th>
                          <th className="px-3 py-2 text-right">UHC Count</th>
                          <th className="px-3 py-2 text-right">UHC %</th>
                          <th className="px-3 py-2 text-right">UHC Avg Score</th>
                          <th className="px-3 py-2 text-right">Market Count</th>
                          <th className="px-3 py-2 text-right">Market %</th>
                          <th className="px-3 py-2 text-right">Market Avg Score</th>
                          <th className="px-3 py-2 text-right">% Diff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(["5", "4", "3", "2", "1"] as const).map((star) => {
                          const uhcPct = measure.uhcPercentages[star] ?? 0;
                          const marketPct = measure.marketPercentages[star] ?? 0;
                          const diff = uhcPct - marketPct;
                          const uhcStarScore = measure.uhcScoresByStar?.[star];
                          const marketStarScore = measure.marketScoresByStar?.[star];
                          return (
                            <tr key={star} className="border-b border-border/60 hover:bg-muted/30">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: STAR_COLORS[star] }}
                                  />
                                  <span className="font-medium">
                                    {star} Star{star === "1" ? "" : "s"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {measure.uhc[star].toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {uhcPct.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {uhcStarScore?.avg !== null && uhcStarScore?.avg !== undefined ? (
                                  <span title={`Range: ${uhcStarScore.min?.toFixed(1)}% – ${uhcStarScore.max?.toFixed(1)}% (n=${uhcStarScore.count})`}>
                                    {uhcStarScore.avg.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">–</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {measure.market[star].toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {marketPct.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {marketStarScore?.avg !== null && marketStarScore?.avg !== undefined ? (
                                  <span title={`Range: ${marketStarScore.min?.toFixed(1)}% – ${marketStarScore.max?.toFixed(1)}% (n=${marketStarScore.count})`}>
                                    {marketStarScore.avg.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">–</span>
                                )}
                              </td>
                              <td
                                className={`px-3 py-2 text-right font-mono font-semibold ${
                                  diff > 0 ? "text-green-500" : diff < 0 ? "text-red-500" : "text-muted-foreground"
                                }`}
                              >
                                {diff > 0 ? "+" : ""}
                                {diff.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Visual Bar Comparison */}
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">UnitedHealth Distribution</p>
                      <div className="flex h-6 w-full overflow-hidden rounded-full">
                        {(["1", "2", "3", "4", "5"] as const).map((star) => {
                          const pct = measure.uhcPercentages[star] ?? 0;
                          if (pct === 0) return null;
                          return (
                            <div
                              key={star}
                              style={{ width: `${pct}%`, backgroundColor: STAR_COLORS[star] }}
                              className="relative flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-80"
                              title={`${star} Stars: ${pct.toFixed(1)}%`}
                            >
                              {pct > 8 && `${pct.toFixed(0)}%`}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Rest of Market Distribution</p>
                      <div className="flex h-6 w-full overflow-hidden rounded-full">
                        {(["1", "2", "3", "4", "5"] as const).map((star) => {
                          const pct = measure.marketPercentages[star] ?? 0;
                          if (pct === 0) return null;
                          return (
                            <div
                              key={star}
                              style={{ width: `${pct}%`, backgroundColor: STAR_COLORS[star] }}
                              className="relative flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-80"
                              title={`${star} Stars: ${pct.toFixed(1)}%`}
                            >
                              {pct > 8 && `${pct.toFixed(0)}%`}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-2">
                      {(["1", "2", "3", "4", "5"] as const).map((star) => (
                        <div key={star} className="flex items-center gap-1.5">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: STAR_COLORS[star] }}
                          />
                          <span>{star} Star{star === "1" ? "" : "s"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === "single-year" && filteredMeasures.length === 0 && (
          <div className="rounded-3xl border border-border bg-card p-8">
            <div className="text-center text-muted-foreground py-10">
              No measures match your search criteria.
            </div>
          </div>
        )}

        {/* Year-over-Year Change View */}
        {viewMode === "yoy-change" && yoyData && (
          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-8 py-6">
              <div className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full bg-primary" />
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    Performance Change: {yoyData.olderYear} → {yoyData.newerYear}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Change in high-star (4-5★) percentage for each measure. Positive = more contracts achieved 4-5 stars.
                  </p>
                </div>
              </div>
            </div>

            {yoyData.comparisons.map((comparison, index) => {
              const anchorId = `yoy-${index}-${slugifyLabel(comparison.measureCode)}`;
              return (
                <div
                  key={comparison.measureCode}
                  id={anchorId}
                  className="rounded-3xl border border-border bg-card p-8"
                >
                  <div className="mb-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">
                          {comparison.measureName}
                        </h3>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border px-2 py-0.5">
                            {comparison.measureCode}
                          </span>
                          {comparison.domain && (
                            <span className="rounded-full border border-border px-2 py-0.5">
                              {comparison.domain}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                        comparison.uhcOutperformedMarket 
                          ? "bg-green-500/10 text-green-500 border border-green-500/30" 
                          : "bg-muted text-muted-foreground border border-border"
                      }`}>
                        {comparison.uhcOutperformedMarket ? (
                          <>
                            <ArrowUp className="h-3.5 w-3.5" />
                            UHC Outperformed
                          </>
                        ) : (
                          <>
                            <Minus className="h-3.5 w-3.5" />
                            Market Outperformed
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* High Star Change Summary */}
                  <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                      <p className="text-xs text-muted-foreground mb-1">UHC High Star Change</p>
                      <div className="flex items-center gap-2">
                        {comparison.uhcHighStarChange > 0 ? (
                          <ArrowUp className="h-5 w-5 text-green-500" />
                        ) : comparison.uhcHighStarChange < 0 ? (
                          <ArrowDown className="h-5 w-5 text-red-500" />
                        ) : (
                          <Minus className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className={`text-2xl font-bold ${
                          comparison.uhcHighStarChange > 0 ? "text-green-500" 
                          : comparison.uhcHighStarChange < 0 ? "text-red-500" 
                          : "text-muted-foreground"
                        }`}>
                          {comparison.uhcHighStarChange > 0 ? "+" : ""}{comparison.uhcHighStarChange.toFixed(1)}%
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {comparison.uhcHighStarOlder.toFixed(1)}% → {comparison.uhcHighStarNewer.toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted p-4">
                      <p className="text-xs text-muted-foreground mb-1">Market High Star Change</p>
                      <div className="flex items-center gap-2">
                        {comparison.marketHighStarChange > 0 ? (
                          <ArrowUp className="h-5 w-5 text-green-500" />
                        ) : comparison.marketHighStarChange < 0 ? (
                          <ArrowDown className="h-5 w-5 text-red-500" />
                        ) : (
                          <Minus className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className={`text-2xl font-bold ${
                          comparison.marketHighStarChange > 0 ? "text-green-500" 
                          : comparison.marketHighStarChange < 0 ? "text-red-500" 
                          : "text-muted-foreground"
                        }`}>
                          {comparison.marketHighStarChange > 0 ? "+" : ""}{comparison.marketHighStarChange.toFixed(1)}%
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {comparison.marketHighStarOlder.toFixed(1)}% → {comparison.marketHighStarNewer.toFixed(1)}%
                      </p>
                    </div>
                    <div className={`rounded-xl border p-4 ${
                      comparison.relativePerformance > 0 
                        ? "border-green-500/30 bg-green-500/5" 
                        : comparison.relativePerformance < 0 
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-border bg-muted"
                    }`}>
                      <p className="text-xs text-muted-foreground mb-1">UHC vs Market (Stars)</p>
                      <div className="flex items-center gap-2">
                        {comparison.relativePerformance > 0 ? (
                          <ArrowUp className="h-5 w-5 text-green-500" />
                        ) : comparison.relativePerformance < 0 ? (
                          <ArrowDown className="h-5 w-5 text-red-500" />
                        ) : (
                          <Minus className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className={`text-2xl font-bold ${
                          comparison.relativePerformance > 0 ? "text-green-500" 
                          : comparison.relativePerformance < 0 ? "text-red-500" 
                          : "text-muted-foreground"
                        }`}>
                          {comparison.relativePerformance > 0 ? "+" : ""}{comparison.relativePerformance.toFixed(1)}%
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Relative improvement</p>
                    </div>
                  </div>

                  {/* Measure Score Change Summary */}
                  {(comparison.uhcScoreChange !== null || comparison.marketScoreChange !== null) && (
                    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                        <p className="text-xs text-muted-foreground mb-1">UHC Score Change</p>
                        {comparison.uhcScoreChange !== null ? (
                          <>
                            <div className="flex items-center gap-2">
                              {comparison.uhcScoreChange > 0 ? (
                                <ArrowUp className="h-5 w-5 text-green-500" />
                              ) : comparison.uhcScoreChange < 0 ? (
                                <ArrowDown className="h-5 w-5 text-red-500" />
                              ) : (
                                <Minus className="h-5 w-5 text-muted-foreground" />
                              )}
                              <span className={`text-2xl font-bold ${
                                comparison.uhcScoreChange > 0 ? "text-green-500" 
                                : comparison.uhcScoreChange < 0 ? "text-red-500" 
                                : "text-muted-foreground"
                              }`}>
                                {comparison.uhcScoreChange > 0 ? "+" : ""}{comparison.uhcScoreChange.toFixed(1)} pts
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {comparison.uhcScoreOlder?.toFixed(1)}% → {comparison.uhcScoreNewer?.toFixed(1)}%
                            </p>
                          </>
                        ) : (
                          <span className="text-lg text-muted-foreground">N/A</span>
                        )}
                      </div>
                      <div className="rounded-xl border border-border bg-muted p-4">
                        <p className="text-xs text-muted-foreground mb-1">Market Score Change</p>
                        {comparison.marketScoreChange !== null ? (
                          <>
                            <div className="flex items-center gap-2">
                              {comparison.marketScoreChange > 0 ? (
                                <ArrowUp className="h-5 w-5 text-green-500" />
                              ) : comparison.marketScoreChange < 0 ? (
                                <ArrowDown className="h-5 w-5 text-red-500" />
                              ) : (
                                <Minus className="h-5 w-5 text-muted-foreground" />
                              )}
                              <span className={`text-2xl font-bold ${
                                comparison.marketScoreChange > 0 ? "text-green-500" 
                                : comparison.marketScoreChange < 0 ? "text-red-500" 
                                : "text-muted-foreground"
                              }`}>
                                {comparison.marketScoreChange > 0 ? "+" : ""}{comparison.marketScoreChange.toFixed(1)} pts
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {comparison.marketScoreOlder?.toFixed(1)}% → {comparison.marketScoreNewer?.toFixed(1)}%
                            </p>
                          </>
                        ) : (
                          <span className="text-lg text-muted-foreground">N/A</span>
                        )}
                      </div>
                      <div className={`rounded-xl border p-4 ${
                        comparison.scoreRelativePerformance !== null && comparison.scoreRelativePerformance > 0 
                          ? "border-green-500/30 bg-green-500/5" 
                          : comparison.scoreRelativePerformance !== null && comparison.scoreRelativePerformance < 0 
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-border bg-muted"
                      }`}>
                        <p className="text-xs text-muted-foreground mb-1">UHC vs Market (Scores)</p>
                        {comparison.scoreRelativePerformance !== null ? (
                          <>
                            <div className="flex items-center gap-2">
                              {comparison.scoreRelativePerformance > 0 ? (
                                <ArrowUp className="h-5 w-5 text-green-500" />
                              ) : comparison.scoreRelativePerformance < 0 ? (
                                <ArrowDown className="h-5 w-5 text-red-500" />
                              ) : (
                                <Minus className="h-5 w-5 text-muted-foreground" />
                              )}
                              <span className={`text-2xl font-bold ${
                                comparison.scoreRelativePerformance > 0 ? "text-green-500" 
                                : comparison.scoreRelativePerformance < 0 ? "text-red-500" 
                                : "text-muted-foreground"
                              }`}>
                                {comparison.scoreRelativePerformance > 0 ? "+" : ""}{comparison.scoreRelativePerformance.toFixed(1)} pts
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Relative improvement</p>
                          </>
                        ) : (
                          <span className="text-lg text-muted-foreground">N/A</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Detailed Star Changes Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2">Star Rating</th>
                          <th className="px-3 py-2 text-right">UHC {comparison.olderYear}</th>
                          <th className="px-3 py-2 text-right">UHC {comparison.newerYear}</th>
                          <th className="px-3 py-2 text-right">UHC Change</th>
                          <th className="px-3 py-2 text-right">Market {comparison.olderYear}</th>
                          <th className="px-3 py-2 text-right">Market {comparison.newerYear}</th>
                          <th className="px-3 py-2 text-right">Market Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(["5", "4", "3", "2", "1"] as const).map((star) => {
                          const uhcOld = comparison.olderMeasure.uhcPercentages[star] ?? 0;
                          const uhcNew = comparison.newerMeasure.uhcPercentages[star] ?? 0;
                          const uhcChange = comparison.uhcStarChanges[star];
                          const marketOld = comparison.olderMeasure.marketPercentages[star] ?? 0;
                          const marketNew = comparison.newerMeasure.marketPercentages[star] ?? 0;
                          const marketChange = comparison.marketStarChanges[star];
                          
                          // For high stars, positive change is good. For low stars, negative change is good.
                          const isHighStar = star === "4" || star === "5";
                          const uhcGood = isHighStar ? uhcChange > 0 : uhcChange < 0;
                          const marketGood = isHighStar ? marketChange > 0 : marketChange < 0;
                          
                          return (
                            <tr key={star} className="border-b border-border/60 hover:bg-muted/30">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: STAR_COLORS[star] }}
                                  />
                                  <span className="font-medium">
                                    {star} Star{star === "1" ? "" : "s"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                                {uhcOld.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {uhcNew.toFixed(1)}%
                              </td>
                              <td className={`px-3 py-2 text-right font-mono font-semibold ${
                                uhcGood ? "text-green-500" : uhcChange !== 0 ? "text-red-500" : "text-muted-foreground"
                              }`}>
                                {uhcChange > 0 ? "+" : ""}{uhcChange.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                                {marketOld.toFixed(1)}%
                              </td>
                              <td className="px-3 py-2 text-right font-mono">
                                {marketNew.toFixed(1)}%
                              </td>
                              <td className={`px-3 py-2 text-right font-mono font-semibold ${
                                marketGood ? "text-green-500" : marketChange !== 0 ? "text-red-500" : "text-muted-foreground"
                              }`}>
                                {marketChange > 0 ? "+" : ""}{marketChange.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === "yoy-change" && (!yoyData || yoyData.comparisons.length === 0) && (
          <div className="rounded-3xl border border-border bg-card p-8">
            <div className="text-center text-muted-foreground py-10">
              {!yoyData 
                ? "Year-over-year data requires at least 2 years of data."
                : "No measures match your search criteria for both years."}
            </div>
          </div>
        )}
      </section>

      {/* Navigation Drawer */}
      {sectionAnchors.length > 1 && isDrawerOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Quick jump</p>
                <h3 className="text-lg font-semibold text-foreground">Navigate to a measure</h3>
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
                    <span className="max-w-xs truncate text-left md:max-w-sm">
                      {shortenLabel(anchor.label, 48)}
                    </span>
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
