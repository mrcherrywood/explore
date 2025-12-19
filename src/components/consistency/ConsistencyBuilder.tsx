"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, TrendingDown, Minus, Info, Shield } from "lucide-react";

type StarRating = "1" | "2" | "3" | "4" | "5";

interface YearTransition {
  fromYear: number;
  toYear: number;
  totalContracts: number;
  maintained: number;
  gainedOne: number;
  lostOne: number;
  gainedMultiple: number;
  lostMultiple: number;
  noDataNextYear: number;
}

interface ConsistencyData {
  measureCode: string;
  measureName: string;
  domain: string | null;
  starRating: StarRating;
  yearTransitions: YearTransition[];
}

interface ConsistencyResponse {
  years: number[];
  measureCount: number;
  consistencyData: ConsistencyData[];
  summary: {
    totalTransitions: number;
    totalMaintained: number;
    overallConsistencyRate: number;
  };
}

export function ConsistencyBuilder() {
  const [data, setData] = useState<ConsistencyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeasure, setSelectedMeasure] = useState<string | null>(null);
  const [selectedStarRating, setSelectedStarRating] = useState<StarRating>("4");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [selectedLeaderboardTransition, setSelectedLeaderboardTransition] = useState<string | null>(null);

  // Get available year transitions for the leaderboard
  const yearTransitions = useMemo(() => {
    if (!data || data.years.length < 2) return [];
    const transitions: string[] = [];
    for (let i = 0; i < data.years.length - 1; i++) {
      transitions.push(`${data.years[i]}-${data.years[i + 1]}`);
    }
    return transitions;
  }, [data]);

  // Calculate volatility rankings for all measures, segmented by year transition
  const volatilityRankings = useMemo(() => {
    if (!data || !selectedLeaderboardTransition) return { mostVolatile: [], leastVolatile: [] };

    const [fromYearStr, toYearStr] = selectedLeaderboardTransition.split("-");
    const fromYear = parseInt(fromYearStr);
    const toYear = parseInt(toYearStr);

    // Group consistency data by measure code for the selected year transition
    const measureStats = new Map<string, { 
      code: string; 
      name: string; 
      domain: string | null;
      totalContracts: number; 
      totalChanged: number;
    }>();

    data.consistencyData.forEach((item) => {
      // Find the transition matching the selected years
      const transition = item.yearTransitions.find(
        (t) => t.fromYear === fromYear && t.toYear === toYear
      );
      if (!transition) return;

      const existing = measureStats.get(item.measureCode) || {
        code: item.measureCode,
        name: item.measureName,
        domain: item.domain,
        totalContracts: 0,
        totalChanged: 0,
      };

      const contractsWithData = transition.totalContracts - transition.noDataNextYear;
      const changed = transition.gainedOne + transition.lostOne + transition.gainedMultiple + transition.lostMultiple;
      existing.totalContracts += contractsWithData;
      existing.totalChanged += changed;

      measureStats.set(item.measureCode, existing);
    });

    // Calculate volatility rate and filter out measures with insufficient data
    const measuresWithVolatility = Array.from(measureStats.values())
      .filter((m) => m.totalContracts >= 10) // Minimum sample size
      .map((m) => ({
        ...m,
        volatilityRate: m.totalContracts > 0 ? (m.totalChanged / m.totalContracts) * 100 : 0,
        consistencyRate: m.totalContracts > 0 ? ((m.totalContracts - m.totalChanged) / m.totalContracts) * 100 : 0,
      }));

    // Sort by volatility rate
    const sortedByVolatility = [...measuresWithVolatility].sort((a, b) => b.volatilityRate - a.volatilityRate);
    const sortedByConsistency = [...measuresWithVolatility].sort((a, b) => b.consistencyRate - a.consistencyRate);

    return {
      mostVolatile: sortedByVolatility.slice(0, 5),
      leastVolatile: sortedByConsistency.slice(0, 5),
    };
  }, [data, selectedLeaderboardTransition]);

  // Set default leaderboard transition when data loads
  useEffect(() => {
    if (yearTransitions.length > 0 && !selectedLeaderboardTransition) {
      // Default to the most recent transition
      setSelectedLeaderboardTransition(yearTransitions[yearTransitions.length - 1]);
    }
  }, [yearTransitions, selectedLeaderboardTransition]);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch("/api/consistency");
        if (!response.ok) {
          throw new Error(`Failed to fetch consistency data: ${response.statusText}`);
        }
        const result = await response.json();
        setData(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
        console.error("Error fetching consistency data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  // Get unique domains
  const domains = Array.from(new Set(data.consistencyData.map((d) => d.domain).filter(Boolean))).sort();

  // Filter data by domain
  const filteredData =
    selectedDomain === "all"
      ? data.consistencyData
      : data.consistencyData.filter((d) => d.domain === selectedDomain);

  // Group by measure
  const measureGroups = new Map<string, ConsistencyData[]>();
  filteredData.forEach((item) => {
    if (!measureGroups.has(item.measureCode)) {
      measureGroups.set(item.measureCode, []);
    }
    measureGroups.get(item.measureCode)!.push(item);
  });

  // Get measures sorted alphabetically
  const measures = Array.from(measureGroups.keys())
    .map((code) => {
      const firstItem = measureGroups.get(code)![0];
      return { code, name: firstItem.measureName, domain: firstItem.domain };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // If no measure is selected, select the first one
  const currentMeasure = selectedMeasure || measures[0]?.code || null;
  const currentMeasureData = currentMeasure ? measureGroups.get(currentMeasure) || [] : [];

  // Filter by selected star rating
  const currentData = currentMeasureData.filter((d) => d.starRating === selectedStarRating);

  const calculatePercentage = (value: number, total: number) => {
    return total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  };

  return (
    <div className="space-y-6">
      {/* Volatility Leaderboard */}
      {yearTransitions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Measure Volatility Leaderboard</CardTitle>
                <CardDescription>Compare which measures changed the most vs stayed the most stable</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-muted-foreground">Year Transition:</label>
                <select
                  value={selectedLeaderboardTransition || ""}
                  onChange={(e) => setSelectedLeaderboardTransition(e.target.value)}
                  className="appearance-none rounded-md border border-input bg-background bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat px-3 py-2 pr-10 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {yearTransitions.map((transition) => {
                    const [from, to] = transition.split("-");
                    return (
                      <option key={transition} value={transition}>
                        {from} → {to}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-5 w-5 text-orange-500" />
                  <h3 className="text-lg font-semibold">Most Volatile</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Highest year-over-year rating changes</p>
                <div className="space-y-2">
                  {volatilityRankings.mostVolatile.map((measure, idx) => (
                    <div
                      key={measure.code}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                        idx === 0 ? "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" :
                        idx === 1 ? "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{measure.name}</p>
                        {measure.domain && (
                          <p className="text-xs text-muted-foreground truncate">{measure.domain}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                          {measure.volatilityRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {measure.totalChanged.toLocaleString()} / {measure.totalContracts.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {volatilityRankings.mostVolatile.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No data available</p>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-5 w-5 text-green-500" />
                  <h3 className="text-lg font-semibold">Most Consistent</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Highest year-over-year rating stability</p>
                <div className="space-y-2">
                  {volatilityRankings.leastVolatile.map((measure, idx) => (
                    <div
                      key={measure.code}
                      className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                        idx === 0 ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                        idx === 1 ? "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{measure.name}</p>
                        {measure.domain && (
                          <p className="text-xs text-muted-foreground truncate">{measure.domain}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600 dark:text-green-400">
                          {measure.consistencyRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(measure.totalContracts - measure.totalChanged).toLocaleString()} / {measure.totalContracts.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {volatilityRankings.leastVolatile.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No data available</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Domain</label>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="w-full appearance-none rounded-md border border-input bg-background bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat px-3 py-2 pr-10 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All Domains</option>
                {domains.map((domain) => (
                  <option key={domain} value={domain as string}>
                    {domain}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Measure</label>
              <select
                value={currentMeasure || ""}
                onChange={(e) => setSelectedMeasure(e.target.value)}
                className="w-full appearance-none rounded-md border border-input bg-background bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat px-3 py-2 pr-10 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {measures.map((measure) => (
                  <option key={measure.code} value={measure.code}>
                    {measure.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Star Rating</label>
              <select
                value={selectedStarRating}
                onChange={(e) => setSelectedStarRating(e.target.value as StarRating)}
                className="w-full appearance-none rounded-md border border-input bg-background bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat px-3 py-2 pr-10 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="1">1 Star</option>
                <option value="2">2 Stars</option>
                <option value="3">3 Stars</option>
                <option value="4">4 Stars</option>
                <option value="5">5 Stars</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {currentData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {currentData[0].measureName} - {selectedStarRating} Star Consistency
            </CardTitle>
            <CardDescription>
              {currentData[0].domain && (
                <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold">
                  {currentData[0].domain}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {currentData[0].yearTransitions.map((transition, idx) => {
                const maintainedPct = calculatePercentage(transition.maintained, transition.totalContracts);
                const gainedOnePct = calculatePercentage(transition.gainedOne, transition.totalContracts);
                const lostOnePct = calculatePercentage(transition.lostOne, transition.totalContracts);
                const gainedMultiplePct = calculatePercentage(transition.gainedMultiple, transition.totalContracts);
                const lostMultiplePct = calculatePercentage(transition.lostMultiple, transition.totalContracts);
                const noDataPct = calculatePercentage(transition.noDataNextYear, transition.totalContracts);

                return (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold">
                        {transition.fromYear} → {transition.toYear}
                      </h3>
                      <span className="inline-flex items-center rounded-md bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                        {transition.totalContracts} contract{transition.totalContracts !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
                        <Minus className="mt-0.5 h-5 w-5 text-green-600" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">Maintained</p>
                          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                            {transition.maintained}
                          </p>
                          <p className="text-sm text-green-600 dark:text-green-400">{maintainedPct}%</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
                        <TrendingUp className="mt-0.5 h-5 w-5 text-blue-600" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Gained 1 Star</p>
                          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                            {transition.gainedOne}
                          </p>
                          <p className="text-sm text-blue-600 dark:text-blue-400">{gainedOnePct}%</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950">
                        <TrendingDown className="mt-0.5 h-5 w-5 text-orange-600" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-orange-900 dark:text-orange-100">Lost 1 Star</p>
                          <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                            {transition.lostOne}
                          </p>
                          <p className="text-sm text-orange-600 dark:text-orange-400">{lostOnePct}%</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <TrendingUp className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Gained 2+ Stars</p>
                          <p className="text-2xl font-bold">{transition.gainedMultiple}</p>
                          <p className="text-sm text-muted-foreground">{gainedMultiplePct}%</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <TrendingDown className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Lost 2+ Stars</p>
                          <p className="text-2xl font-bold">{transition.lostMultiple}</p>
                          <p className="text-sm text-muted-foreground">{lostMultiplePct}%</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <Info className="mt-0.5 h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">No Data Next Year</p>
                          <p className="text-2xl font-bold">{transition.noDataNextYear}</p>
                          <p className="text-sm text-muted-foreground">{noDataPct}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No data available for the selected filters.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
