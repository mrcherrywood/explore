"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { ChartRenderer, ChartSpec } from "@/components/chart/ChartRenderer";
import { EnrollmentLevelId, formatEnrollment } from "@/lib/peer/enrollment-levels";

type Selection = {
  contractId: string;
  state: string;
  planTypeGroup: "SNP" | "NOT";
  enrollmentLevel: EnrollmentLevelId;
};

type PeerRow = {
  contractId: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  parentOrganization: string | null;
  snpIndicator: string | null;
  totalEnrollment: number | null;
  formattedEnrollment: string;
  enrollmentLevel: EnrollmentLevelId;
  suppressedPlanCount: number;
  reportedPlanCount: number;
  latestRatingYear: number | null;
  latestRatingText: string | null;
  latestRatingNumeric: number | null;
};

type PeerComparisonResponse = {
  metricsYear: number;
  state: string;
  planTypeGroup: "SNP" | "NOT";
  enrollmentLevel: EnrollmentLevelId;
  peers: PeerRow[];
  overallChart: ChartSpec | null;
  domainCharts: ChartSpec[];
  measureCharts: ChartSpec[];
};

export function PeerComparisonResults({ selection }: { selection: Selection }) {
  const [data, setData] = useState<PeerComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchComparison() {
      setIsLoading(true);
      setError(null);
      setData(null);
      try {
        const response = await fetch("/api/peer/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selection),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to build peer comparison");
        }

        const payload: PeerComparisonResponse = await response.json();
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to build peer comparison");
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

  const selectedPeer = useMemo(() => {
    if (!data) return null;
    return data.peers.find((peer: PeerRow) => peer.contractId === selection.contractId) ?? null;
  }, [data, selection.contractId]);

  const averageRating = useMemo(() => {
    if (!data) return null;
    const ratings = data.peers
      .map((peer: PeerRow) => peer.latestRatingNumeric)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (ratings.length === 0) return null;
    return ratings.reduce((acc: number, value: number) => acc + value, 0) / ratings.length;
  }, [data]);

  const selectedRank = useMemo(() => {
    if (!data || !selectedPeer) return null;
    const selectedRating = selectedPeer.latestRatingNumeric;
    if (selectedRating === null || selectedRating === undefined) return null;
    
    // Get all peers with ratings and sort by rating (descending - best first)
    const peersWithRatings = data.peers
      .filter((peer: PeerRow) => 
        peer.latestRatingNumeric !== null && 
        peer.latestRatingNumeric !== undefined
      )
      .sort((a, b) => {
        const diff = b.latestRatingNumeric! - a.latestRatingNumeric!;
        if (diff !== 0) return diff;
        return a.contractId.localeCompare(b.contractId);
      });
    
    // Find the rank (1-indexed)
    const rank = peersWithRatings.findIndex((peer: PeerRow) => peer.contractId === selection.contractId) + 1;
    return rank > 0 ? { rank, total: peersWithRatings.length } : null;
  }, [data, selectedPeer, selection.contractId]);

  // Calculate rank for a specific measure chart
  const getMeasureRank = (chart: ChartSpec): { rank: number; total: number } | null => {
    if (!chart.data || chart.data.length === 0) return null;
    
    // Find the selected contract's data point
    const selectedData = chart.data.find((d) => d[chart.highlightKey || "contract"] === selection.contractId);
    if (!selectedData) return null;
    
    // Get the value key (first series key)
    const valueKey = chart.series[0]?.key;
    if (!valueKey) return null;
    
    const selectedValue = selectedData[valueKey];
    if (selectedValue === null || selectedValue === undefined) return null;
    
    // Determine if this is an inverted measure (lower is better)
    const title = chart.title?.toLowerCase() || "";
    const isInvertedMeasure = 
      title.includes("members choosing to leave") ||
      title.includes("complaints about");
    
    // Sort all data points by value
    // For inverted measures: ascending (lower is better)
    // For normal measures: descending (higher is better)
    const sortedData = [...chart.data].sort((a, b) => {
      const aVal = a[valueKey];
      const bVal = b[valueKey];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const diff = isInvertedMeasure 
        ? Number(aVal) - Number(bVal)  // Ascending for inverted
        : Number(bVal) - Number(aVal); // Descending for normal
      if (diff !== 0) return diff;
      return String(a[chart.xKey]).localeCompare(String(b[chart.xKey]));
    });
    
    // Find the rank
    const rank = sortedData.findIndex((d) => d[chart.highlightKey || "contract"] === selection.contractId) + 1;
    return rank > 0 ? { rank, total: chart.data.length } : null;
  };

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center text-sm text-muted-foreground">
            Building peer comparison for {selection.contractId} in {selection.state} ({selection.planTypeGroup})
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

  const peerCount = data.peers.length;

  const headingLabel = selectedPeer?.contractName || selectedPeer?.organizationMarketingName || selection.contractId;

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Selected Contract</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{headingLabel}</h2>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-3 py-1">State {data.state}</span>
              <span className="rounded-full border border-border px-3 py-1">{data.planTypeGroup === "SNP" ? "SNP Plans" : "Non-SNP Plans"}</span>
              <span className="rounded-full border border-border px-3 py-1">Enrollment {selection.enrollmentLevel}</span>
              <span className="rounded-full border border-border px-3 py-1">{peerCount} contracts</span>
            </div>
          </div>
          <div className="grid gap-4 text-sm sm:grid-cols-2 lg:w-1/2">
            <div className="rounded-2xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Selected Contract Rating</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {selectedPeer?.latestRatingNumeric !== null && selectedPeer?.latestRatingNumeric !== undefined
                  ? selectedPeer.latestRatingNumeric.toFixed(1)
                  : "N/A"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedPeer?.latestRatingYear ? `Latest CMS ${selectedPeer.latestRatingYear}` : "No recent rating"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Peer Group Average</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {averageRating !== null ? averageRating.toFixed(1) : "N/A"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Across {peerCount} contracts</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Peer Rank</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {selectedRank ? `#${selectedRank.rank}` : "N/A"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedRank ? `Out of ${selectedRank.total} rated contracts` : "No rating available"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Selected Enrollment</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {formatEnrollment(selectedPeer?.totalEnrollment ?? null)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedPeer?.reportedPlanCount ?? 0} plans with reported enrollment
              </p>
            </div>
          </div>
        </div>
      </div>

      {data.overallChart && (
        <div className="rounded-3xl border border-border bg-card p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h3 className="text-lg font-semibold text-foreground">Overall Star Rating Comparison</h3>
            {selectedRank && (
              <div className="flex-shrink-0 rounded-xl border border-border bg-muted px-4 py-2">
                <p className="text-xs text-muted-foreground">Rank</p>
                <p className="mt-1 text-xl font-semibold text-foreground">#{selectedRank.rank}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">of {selectedRank.total}</p>
              </div>
            )}
          </div>
          <ChartRenderer spec={data.overallChart} />
        </div>
      )}

      {data.domainCharts && data.domainCharts.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-primary"></div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Domain Star Ratings</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Weighted average star ratings by domain across peer contracts
                </p>
              </div>
            </div>
          </div>
          {data.domainCharts.map((chart: ChartSpec, index: number) => {
            const domainRank = getMeasureRank(chart);
            return (
              <div key={`${chart.title ?? "domain"}-${index}`} className="rounded-3xl border border-border bg-card p-8">
                <div className="mb-6 flex items-start justify-between gap-4">
                  {chart.title && <h3 className="text-lg font-semibold text-foreground">{chart.title}</h3>}
                  {domainRank && (
                    <div className="flex-shrink-0 rounded-xl border border-border bg-muted px-4 py-2">
                      <p className="text-xs text-muted-foreground">Rank</p>
                      <p className="mt-1 text-xl font-semibold text-foreground">#{domainRank.rank}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">of {domainRank.total}</p>
                    </div>
                  )}
                </div>
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
                <h3 className="text-xl font-bold text-foreground">Individual Measure Performance</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Detailed performance metrics across individual measures
                </p>
              </div>
            </div>
          </div>
          {data.measureCharts.map((chart: ChartSpec, index: number) => {
            const measureRank = getMeasureRank(chart);
            return (
              <div key={`${chart.title ?? "measure"}-${index}`} className="rounded-3xl border border-border bg-card p-8">
                <div className="mb-6 flex items-start justify-between gap-4">
                  {chart.title && <h3 className="text-lg font-semibold text-foreground">{chart.title}</h3>}
                  {measureRank && (
                    <div className="flex-shrink-0 rounded-xl border border-border bg-muted px-4 py-2">
                      <p className="text-xs text-muted-foreground">Rank</p>
                      <p className="mt-1 text-xl font-semibold text-foreground">#{measureRank.rank}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">of {measureRank.total}</p>
                    </div>
                  )}
                </div>
                <ChartRenderer spec={chart} />
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-3xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h3 className="text-lg font-semibold text-foreground">Peer Contract Details</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Enrollment totals represent the latest CMS reporting period. Highlighted row is the selected contract.
          </p>
        </div>
        <div className="max-h-[540px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card/95 backdrop-blur">
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3">Contract</th>
                <th className="px-6 py-3">Organization</th>
                <th className="px-6 py-3">Enrollment</th>
                <th className="px-6 py-3">Reported Plans</th>
                <th className="px-6 py-3">Suppressed Plans</th>
                <th className="px-6 py-3">Latest Stars</th>
              </tr>
            </thead>
            <tbody>
              {data.peers.map((peer: PeerRow) => {
                const isSelected = peer.contractId === selection.contractId;
                return (
                  <tr
                    key={peer.contractId}
                    className={`${isSelected ? "bg-primary/20" : "hover:bg-muted/70"} border-t border-border/60 transition`}
                  >
                    <td className="px-6 py-3 font-semibold text-foreground">
                      <div>{peer.contractId}</div>
                      {peer.contractName && (
                        <div className="text-xs font-normal text-muted-foreground">{peer.contractName}</div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {peer.organizationMarketingName || "—"}
                    </td>
                    <td className="px-6 py-3 text-foreground">
                      {peer.formattedEnrollment}
                      <div className="text-xs text-muted-foreground">{peer.enrollmentLevel}</div>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{peer.reportedPlanCount.toLocaleString()}</td>
                    <td className="px-6 py-3 text-muted-foreground">{peer.suppressedPlanCount.toLocaleString()}</td>
                    <td className="px-6 py-3 text-foreground">
                      {peer.latestRatingNumeric !== null && peer.latestRatingNumeric !== undefined
                        ? peer.latestRatingNumeric.toFixed(1)
                        : "N/A"}
                      <div className="text-xs text-muted-foreground">
                        {peer.latestRatingYear ? `Year ${peer.latestRatingYear}` : "No data"}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
