"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Loader2, TrendingUp, TrendingDown, Minus, Search, ChevronDown, ChevronUp, Info } from "lucide-react";

type DomainSummary = {
  domain: string;
  measureCount: number;
  removedMeasureCount: number;
  totalWeight: number;
  removedWeight: number;
  measures: Array<{ code: string; name: string | null; weight: number; isBeingRemoved: boolean }>;
};

type RemovedMeasure = {
  code: string;
  name: string | null;
  domain: string;
  weight: number;
};

type ContractAnalysis = {
  contractId: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  parentOrganization: string | null;
  organizationType: string | null;
  snpIndicator: string | null;
  currentOverallRating: number | null;
  currentPartCRating: number | null;
  currentPartDRating: number | null;
  projectedOverallRating: number | null;
  projectedPartCRating: number | null;
  projectedPartDRating: number | null;
  // Final projected ratings including reward factor adjustments
  finalProjectedOverall: number | null;
  finalProjectedPartC: number | null;
  finalProjectedPartD: number | null;
  finalOverallChange: number | null;
  finalStarBracketChange: number;
  overallChange: number | null;
  partCChange: number | null;
  partDChange: number | null;
  starBracketChange: number;
  operationsMeasuresExcluded: number;
  totalMeasuresUsed: number;
  totalMeasuresWithoutOps: number;
  rewardFactor?: {
    currentRFactor: number;
    projectedRFactor: number;
    rFactorChange: number;
    currentMean: number;
    projectedMean: number;
    currentVariance: number;
    projectedVariance: number;
    currentAdjustedRating: number;
    projectedAdjustedRating: number;
  };
};

type PercentileThresholds = {
  mean65th: number;
  mean85th: number;
  variance30th: number;
  variance70th: number;
};

type RewardFactorImpactData = {
  thresholds: {
    current: PercentileThresholds;
    projected: PercentileThresholds;
    changes: {
      mean65thChange: number;
      mean85thChange: number;
      variance30thChange: number;
      variance70thChange: number;
    };
    officialComparison?: {
      official: PercentileThresholds;
      differences: {
        mean65th: number;
        mean85th: number;
        variance30th: number;
        variance70th: number;
      };
      percentDifferences: {
        mean65th: number;
        mean85th: number;
        variance30th: number;
        variance70th: number;
      };
    };
  };
  summary: {
    totalContracts: number;
    contractsGainingRFactor: number;
    contractsLosingRFactor: number;
    contractsUnchanged: number;
    avgRFactorChange: number;
  };
  distribution: Record<string, number>;
  topGainers: Array<{
    contractId: string;
    currentRFactor: number;
    projectedRFactor: number;
    change: number;
    currentMean: number;
    projectedMean: number;
    currentVariance: number;
    projectedVariance: number;
  }>;
  topLosers: Array<{
    contractId: string;
    currentRFactor: number;
    projectedRFactor: number;
    change: number;
    currentMean: number;
    projectedMean: number;
    currentVariance: number;
    projectedVariance: number;
  }>;
};

type ParentOrgAnalysis = {
  parentOrganization: string;
  contractCount: number;
  avgCurrentRating: number | null;
  avgProjectedRating: number | null;
  avgFinalProjectedRating: number | null;
  avgOverallChange: number | null;
  avgFinalOverallChange: number | null;
  contractsGaining: number;
  contractsLosing: number;
  bracketGainers: number;
  bracketLosers: number;
  finalBracketGainers: number;
  finalBracketLosers: number;
};

type AnalysisData = {
  year: number;
  domains: DomainSummary[];
  removedMeasures: RemovedMeasure[];
  removedMeasuresSummary: {
    count: number;
    totalWeight: number;
  };
  summary: {
    totalContracts: number;
    avgOverallChange: number;
    avgFinalOverallChange: number | null;
    contractsGaining: number;
    contractsLosing: number;
    contractsUnchanged: number;
    finalContractsGaining: number;
    finalContractsLosing: number;
    bracketGainers: number;
    bracketLosers: number;
    finalBracketGainers: number;
    finalBracketLosers: number;
    bracketChangeDistribution: Record<string, number>;
    bracketTransitions: Array<{ transition: string; count: number; direction: 'gain' | 'loss' | 'unchanged' }>;
    totalParentOrgs: number;
  };
  contracts: ContractAnalysis[];
  parentOrganizations: ParentOrgAnalysis[];
  rewardFactorImpact?: {
    overall: RewardFactorImpactData;
    partC: RewardFactorImpactData;
    partD: RewardFactorImpactData;
  };
};

type SortKey = "contractId" | "organizationMarketingName" | "currentOverallRating" | "projectedOverallRating" | "finalProjectedOverall" | "overallChange" | "finalOverallChange" | "starBracketChange" | "finalStarBracketChange" | "rFactorChange";
type OrgSortKey = "parentOrganization" | "contractCount" | "avgCurrentRating" | "avgProjectedRating" | "avgFinalProjectedRating" | "avgOverallChange" | "avgFinalOverallChange" | "contractsGaining" | "contractsLosing";
type SortDirection = "asc" | "desc";
type ViewMode = "contracts" | "organizations";

export function OperationsImpactAnalysis() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("finalOverallChange");
  const [orgSortKey, setOrgSortKey] = useState<OrgSortKey>("avgFinalOverallChange");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showDomainsInfo, setShowDomainsInfo] = useState(false);
  const [showRewardFactorInfo, setShowRewardFactorInfo] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("contracts");
  const [contractsPage, setContractsPage] = useState(1);
  const [orgsPage, setOrgsPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Reset page when search changes
  useEffect(() => {
    setContractsPage(1);
    setOrgsPage(1);
  }, [searchQuery]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/analysis/operations-impact?year=2026");
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to fetch analysis data");
        }
        const result: AnalysisData = await response.json();
        setData(result);
      } catch (err) {
        console.error("Failed to load operations impact analysis:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      const descByDefault = ["overallChange", "finalOverallChange", "starBracketChange", "finalStarBracketChange", "rFactorChange"];
      setSortDirection(descByDefault.includes(key) ? "desc" : "asc");
    }
  };

  const handleOrgSort = (key: OrgSortKey) => {
    if (orgSortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setOrgSortKey(key);
      const descByDefault = ["avgOverallChange", "avgFinalOverallChange", "contractCount", "contractsGaining", "contractsLosing"];
      setSortDirection(descByDefault.includes(key) ? "desc" : "asc");
    }
  };

  const filteredAndSortedContracts = useMemo(() => {
    if (!data) return [];
    
    let contracts = data.contracts;
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      contracts = contracts.filter(c =>
        c.contractId.toLowerCase().includes(query) ||
        c.contractName?.toLowerCase().includes(query) ||
        c.organizationMarketingName?.toLowerCase().includes(query) ||
        c.parentOrganization?.toLowerCase().includes(query)
      );
    }

    // Sort
    contracts = [...contracts].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortKey) {
        case "contractId":
          aVal = a.contractId;
          bVal = b.contractId;
          break;
        case "organizationMarketingName":
          aVal = a.organizationMarketingName || "";
          bVal = b.organizationMarketingName || "";
          break;
        case "currentOverallRating":
          aVal = a.currentOverallRating;
          bVal = b.currentOverallRating;
          break;
        case "projectedOverallRating":
          aVal = a.projectedOverallRating;
          bVal = b.projectedOverallRating;
          break;
        case "finalProjectedOverall":
          aVal = a.finalProjectedOverall;
          bVal = b.finalProjectedOverall;
          break;
        case "overallChange":
          aVal = a.overallChange;
          bVal = b.overallChange;
          break;
        case "finalOverallChange":
          aVal = a.finalOverallChange;
          bVal = b.finalOverallChange;
          break;
        case "starBracketChange":
          aVal = a.starBracketChange;
          bVal = b.starBracketChange;
          break;
        case "finalStarBracketChange":
          aVal = a.finalStarBracketChange;
          bVal = b.finalStarBracketChange;
          break;
        case "rFactorChange":
          aVal = a.rewardFactor?.rFactorChange ?? null;
          bVal = b.rewardFactor?.rFactorChange ?? null;
          break;
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortDirection === "asc" 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number);
    });

    return contracts;
  }, [data, searchQuery, sortKey, sortDirection]);

  const filteredAndSortedOrgs = useMemo(() => {
    if (!data) return [];
    
    let orgs = data.parentOrganizations;
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      orgs = orgs.filter(o =>
        o.parentOrganization.toLowerCase().includes(query)
      );
    }

    // Sort
    orgs = [...orgs].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (orgSortKey) {
        case "parentOrganization":
          aVal = a.parentOrganization;
          bVal = b.parentOrganization;
          break;
        case "contractCount":
          aVal = a.contractCount;
          bVal = b.contractCount;
          break;
        case "avgCurrentRating":
          aVal = a.avgCurrentRating;
          bVal = b.avgCurrentRating;
          break;
        case "avgProjectedRating":
          aVal = a.avgProjectedRating;
          bVal = b.avgProjectedRating;
          break;
        case "avgFinalProjectedRating":
          aVal = a.avgFinalProjectedRating;
          bVal = b.avgFinalProjectedRating;
          break;
        case "avgOverallChange":
          aVal = a.avgOverallChange;
          bVal = b.avgOverallChange;
          break;
        case "avgFinalOverallChange":
          aVal = a.avgFinalOverallChange;
          bVal = b.avgFinalOverallChange;
          break;
        case "contractsGaining":
          aVal = a.contractsGaining;
          bVal = b.contractsGaining;
          break;
        case "contractsLosing":
          aVal = a.contractsLosing;
          bVal = b.contractsLosing;
          break;
      }

      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortDirection === "asc" 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number);
    });

    return orgs;
  }, [data, searchQuery, orgSortKey, sortDirection]);

  const formatRating = (rating: number | null) => {
    if (rating === null) return "—";
    return rating.toFixed(2);
  };

  const formatChange = (change: number | null) => {
    if (change === null) return "—";
    const sign = change >= 0 ? "+" : "";
    return `${sign}${change.toFixed(2)}`;
  };

  const getChangeColor = (change: number | null) => {
    if (change === null) return "text-muted-foreground";
    if (change > 0.01) return "text-emerald-500";
    if (change < -0.01) return "text-rose-500";
    return "text-muted-foreground";
  };

  const getChangeIcon = (change: number | null) => {
    if (change === null) return <Minus className="h-4 w-4" />;
    if (change > 0.01) return <TrendingUp className="h-4 w-4" />;
    if (change < -0.01) return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const SortHeader = ({ label, sortKeyValue, tooltip }: { label: string; sortKeyValue: SortKey; tooltip?: string }) => (
    <button
      onClick={() => handleSort(sortKeyValue)}
      className="flex items-center gap-1 text-left font-medium hover:text-foreground transition-colors group"
      title={tooltip}
    >
      {label}
      {tooltip && (
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity ml-0.5">?</span>
      )}
      {sortKey === sortKeyValue && (
        sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Analyzing impact of removing operations measures...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-6">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Total Contracts Analyzed</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{data.summary.totalContracts.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">With valid star ratings</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Avg Final Rating Change</p>
          <p className={`mt-2 text-3xl font-semibold ${getChangeColor(data.summary.avgFinalOverallChange ?? data.summary.avgOverallChange)}`}>
            {formatChange(data.summary.avgFinalOverallChange ?? data.summary.avgOverallChange)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">With measure removal + reward factor</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Contracts Gaining</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-500">{data.summary.finalContractsGaining.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.summary.finalBracketGainers} would gain a half-star</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Contracts Losing</p>
          <p className="mt-2 text-3xl font-semibold text-rose-500">{data.summary.finalContractsLosing.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.summary.finalBracketLosers} would lose a half-star</p>
        </div>
      </div>

      {/* CMS Removed Measures Info */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <button
          onClick={() => setShowDomainsInfo(!showDomainsInfo)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">CMS Measures Being Removed</h3>
              <p className="text-xs text-muted-foreground">
                {data.removedMeasuresSummary?.count || 0} measures • Total weight: {data.removedMeasuresSummary?.totalWeight || 0}
              </p>
            </div>
          </div>
          {showDomainsInfo ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </button>

        {showDomainsInfo && (
          <div className="mt-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Based on CMS announcements for 2028-2029 Star Ratings, the following measures are being excluded from the projected ratings:
            </p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Code</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Measure Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Domain</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.removedMeasures || []).map((measure, idx) => (
                    <tr
                      key={measure.code}
                      className={`border-b border-border/50 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-amber-400">{measure.code}</td>
                      <td className="px-3 py-2 text-foreground">{measure.name || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{measure.domain}</td>
                      <td className="px-3 py-2 text-right text-foreground">{measure.weight}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30">
                    <td colSpan={3} className="px-3 py-2 text-xs font-medium text-muted-foreground">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-foreground">
                      {data.removedMeasuresSummary?.totalWeight || 0}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Impact by Domain</p>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {data.domains
                  .filter(d => d.removedMeasureCount > 0)
                  .sort((a, b) => b.removedWeight - a.removedWeight)
                  .map((domain) => (
                    <div
                      key={domain.domain}
                      className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-amber-400">
                          {domain.domain}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-amber-500">
                          {domain.removedMeasureCount} removed
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {domain.removedMeasureCount} of {domain.measureCount} measures • Weight: {domain.removedWeight} of {domain.totalWeight}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reward Factor Threshold Impact */}
      {data.rewardFactorImpact && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <button
            onClick={() => setShowRewardFactorInfo(!showRewardFactorInfo)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Reward Factor Threshold Impact</h3>
                <p className="text-xs text-muted-foreground">
                  How percentile thresholds are expected to shift when measures are removed
                </p>
              </div>
            </div>
            {showRewardFactorInfo ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </button>

          {showRewardFactorInfo && data.rewardFactorImpact && (
            <div className="mt-4 space-y-6">
              {/* Methodology Explanation */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <h4 className="text-sm font-medium text-foreground">How Projected Thresholds Are Calculated</h4>
                <div className="text-xs text-muted-foreground space-y-2">
                  <p>
                    <strong className="text-foreground">Step 1: Calculate Current Stats</strong> — For each contract, we compute the 
                    weighted mean (performance) and weighted variance (consistency) of their individual measure star ratings using CMS measure weights.
                  </p>
                  <p>
                    <strong className="text-foreground">Step 2: Compute Current Thresholds</strong> — The 65th and 85th percentiles of weighted means 
                    across all {data.summary.totalContracts} contracts determine performance categories. The 30th and 70th percentiles of weighted variances 
                    determine consistency categories.
                  </p>
                  <p>
                    <strong className="text-foreground">Step 3: Remove Measures</strong> — For each contract, we exclude the {data.removedMeasuresSummary?.count || 0} CMS-removed measures 
                    and recalculate their weighted mean and variance using only the remaining measures.
                  </p>
                  <p>
                    <strong className="text-foreground">Step 4: Compute Projected Thresholds</strong> — Using the new contract-level stats (after measure removal), 
                    we recompute the percentile cutpoints across all contracts. The thresholds shift because every contract&apos;s mean and variance changes.
                  </p>
                  <p>
                    <strong className="text-foreground">Step 5: Reclassify Contracts</strong> — Each contract is reclassified into mean and variance categories 
                    using the new projected thresholds, which determines their new Reward Factor (0.0, 0.1, 0.2, 0.3, or 0.4).
                  </p>
                </div>
              </div>

              {/* R-Factor Mapping Reference */}
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="text-sm font-medium text-foreground mb-3">R-Factor Mapping Rules (CMS)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Mean Category</th>
                        <th className="px-2 py-1.5 text-center text-muted-foreground font-medium">Low Variance<br/><span className="font-normal">(≤30th %ile)</span></th>
                        <th className="px-2 py-1.5 text-center text-muted-foreground font-medium">Medium Variance<br/><span className="font-normal">(30th-70th %ile)</span></th>
                        <th className="px-2 py-1.5 text-center text-muted-foreground font-medium">High Variance<br/><span className="font-normal">(≥70th %ile)</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="px-2 py-1.5 text-foreground">High (≥85th %ile)</td>
                        <td className="px-2 py-1.5 text-center font-semibold text-emerald-500">+0.4</td>
                        <td className="px-2 py-1.5 text-center font-semibold text-emerald-500">+0.3</td>
                        <td className="px-2 py-1.5 text-center text-muted-foreground">0.0</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="px-2 py-1.5 text-foreground">Relatively High (65th-85th %ile)</td>
                        <td className="px-2 py-1.5 text-center font-semibold text-emerald-500">+0.2</td>
                        <td className="px-2 py-1.5 text-center font-semibold text-emerald-500">+0.1</td>
                        <td className="px-2 py-1.5 text-center text-muted-foreground">0.0</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1.5 text-foreground">Below Threshold (&lt;65th %ile)</td>
                        <td className="px-2 py-1.5 text-center text-muted-foreground">0.0</td>
                        <td className="px-2 py-1.5 text-center text-muted-foreground">0.0</td>
                        <td className="px-2 py-1.5 text-center text-muted-foreground">0.0</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Overall Rating Thresholds */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Projected Threshold Changes (Overall Rating)</h4>
                <p className="text-xs text-muted-foreground">
                  When the {data.removedMeasuresSummary?.count || 0} measures are removed, each contract&apos;s weighted mean and variance change. 
                  This shifts the distribution of all contracts, resulting in new percentile cutpoints:
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-3">Performance (Mean) Thresholds</p>
                    <p className="text-[10px] text-muted-foreground mb-2">Determines if a contract qualifies for &quot;High&quot; or &quot;Relatively High&quot; mean category</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">65th Percentile:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-foreground">{data.rewardFactorImpact.overall.thresholds.current.mean65th.toFixed(4)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-mono text-foreground">{data.rewardFactorImpact.overall.thresholds.projected.mean65th.toFixed(4)}</span>
                          <span className={`font-mono text-xs ${data.rewardFactorImpact.overall.thresholds.changes.mean65thChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            ({data.rewardFactorImpact.overall.thresholds.changes.mean65thChange >= 0 ? '+' : ''}{data.rewardFactorImpact.overall.thresholds.changes.mean65thChange.toFixed(4)})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">85th Percentile:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-foreground">{data.rewardFactorImpact.overall.thresholds.current.mean85th.toFixed(4)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-mono text-foreground">{data.rewardFactorImpact.overall.thresholds.projected.mean85th.toFixed(4)}</span>
                          <span className={`font-mono text-xs ${data.rewardFactorImpact.overall.thresholds.changes.mean85thChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            ({data.rewardFactorImpact.overall.thresholds.changes.mean85thChange >= 0 ? '+' : ''}{data.rewardFactorImpact.overall.thresholds.changes.mean85thChange.toFixed(4)})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-3">Variance Thresholds</p>
                    <p className="text-[10px] text-muted-foreground mb-2">Lower variance = more consistent performance across measures</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">30th Percentile:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-foreground">{data.rewardFactorImpact.overall.thresholds.current.variance30th.toFixed(4)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-mono text-foreground">{data.rewardFactorImpact.overall.thresholds.projected.variance30th.toFixed(4)}</span>
                          <span className={`font-mono text-xs ${data.rewardFactorImpact.overall.thresholds.changes.variance30thChange >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            ({data.rewardFactorImpact.overall.thresholds.changes.variance30thChange >= 0 ? '+' : ''}{data.rewardFactorImpact.overall.thresholds.changes.variance30thChange.toFixed(4)})
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">70th Percentile:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-foreground">{data.rewardFactorImpact.overall.thresholds.current.variance70th.toFixed(4)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-mono text-foreground">{data.rewardFactorImpact.overall.thresholds.projected.variance70th.toFixed(4)}</span>
                          <span className={`font-mono text-xs ${data.rewardFactorImpact.overall.thresholds.changes.variance70thChange >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            ({data.rewardFactorImpact.overall.thresholds.changes.variance70thChange >= 0 ? '+' : ''}{data.rewardFactorImpact.overall.thresholds.changes.variance70thChange.toFixed(4)})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reward Factor Impact Summary */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Reward Factor Impact Summary</h4>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-500">{data.rewardFactorImpact.overall.summary.contractsGainingRFactor}</p>
                    <p className="text-xs text-muted-foreground mt-1">Contracts gaining Reward Factor</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <p className="text-2xl font-bold text-rose-500">{data.rewardFactorImpact.overall.summary.contractsLosingRFactor}</p>
                    <p className="text-xs text-muted-foreground mt-1">Contracts losing Reward Factor</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                    <p className={`text-2xl font-bold ${data.rewardFactorImpact.overall.summary.avgRFactorChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {data.rewardFactorImpact.overall.summary.avgRFactorChange >= 0 ? '+' : ''}{data.rewardFactorImpact.overall.summary.avgRFactorChange.toFixed(4)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Avg Reward Factor change</p>
                  </div>
                </div>
              </div>

              {/* R-Factor Change Distribution */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">R-Factor Change Distribution</h4>
                <p className="text-xs text-muted-foreground">
                  How contracts moved between Reward Factor values due to threshold shifts:
                </p>
                <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-8">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                    <p className="text-lg font-semibold text-emerald-500">{data.rewardFactorImpact.overall.distribution.gainsBy0_4}</p>
                    <p className="text-[10px] text-muted-foreground">Gained +0.4</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                    <p className="text-lg font-semibold text-emerald-500">{data.rewardFactorImpact.overall.distribution.gainsBy0_3}</p>
                    <p className="text-[10px] text-muted-foreground">Gained +0.3</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                    <p className="text-lg font-semibold text-emerald-500">{data.rewardFactorImpact.overall.distribution.gainsBy0_2}</p>
                    <p className="text-[10px] text-muted-foreground">Gained +0.2</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-center">
                    <p className="text-lg font-semibold text-emerald-500">{data.rewardFactorImpact.overall.distribution.gainsBy0_1}</p>
                    <p className="text-[10px] text-muted-foreground">Gained +0.1</p>
                  </div>
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-center">
                    <p className="text-lg font-semibold text-rose-500">{data.rewardFactorImpact.overall.distribution.lossesBy0_1}</p>
                    <p className="text-[10px] text-muted-foreground">Lost −0.1</p>
                  </div>
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-center">
                    <p className="text-lg font-semibold text-rose-500">{data.rewardFactorImpact.overall.distribution.lossesBy0_2}</p>
                    <p className="text-[10px] text-muted-foreground">Lost −0.2</p>
                  </div>
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-center">
                    <p className="text-lg font-semibold text-rose-500">{data.rewardFactorImpact.overall.distribution.lossesBy0_3}</p>
                    <p className="text-[10px] text-muted-foreground">Lost −0.3</p>
                  </div>
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-center">
                    <p className="text-lg font-semibold text-rose-500">{data.rewardFactorImpact.overall.distribution.lossesBy0_4}</p>
                    <p className="text-[10px] text-muted-foreground">Lost −0.4</p>
                  </div>
                </div>
              </div>

              {/* Top Gainers/Losers */}
              {(data.rewardFactorImpact.overall.topGainers.length > 0 || data.rewardFactorImpact.overall.topLosers.length > 0) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {data.rewardFactorImpact.overall.topGainers.length > 0 && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <p className="text-xs font-medium text-emerald-500 mb-3">Top Reward Factor Gainers</p>
                      <div className="space-y-2">
                        {data.rewardFactorImpact.overall.topGainers.slice(0, 5).map((c) => (
                          <div key={c.contractId} className="flex items-center justify-between text-xs">
                            <Link 
                              href={`/summary?contractId=${c.contractId}&year=2026`}
                              className="font-mono text-primary hover:underline"
                            >
                              {c.contractId}
                            </Link>
                            <span className="text-emerald-500">
                              {c.currentRFactor.toFixed(1)} → {c.projectedRFactor.toFixed(1)} (+{c.change.toFixed(1)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.rewardFactorImpact.overall.topLosers.length > 0 && (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
                      <p className="text-xs font-medium text-rose-500 mb-3">Top Reward Factor Losers</p>
                      <div className="space-y-2">
                        {data.rewardFactorImpact.overall.topLosers.slice(0, 5).map((c) => (
                          <div key={c.contractId} className="flex items-center justify-between text-xs">
                            <Link 
                              href={`/summary?contractId=${c.contractId}&year=2026`}
                              className="font-mono text-primary hover:underline"
                            >
                              {c.contractId}
                            </Link>
                            <span className="text-rose-500">
                              {c.currentRFactor.toFixed(1)} → {c.projectedRFactor.toFixed(1)} ({c.change.toFixed(1)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Official Threshold Comparison */}
              {data.rewardFactorImpact.overall.thresholds.officialComparison && (
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3">Comparison with Official CMS 2026 Thresholds</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Comparing our calculated thresholds against the official CMS published values to validate calculations.
                  </p>
                  <div className="grid gap-2 md:grid-cols-4">
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Mean 65th Diff</p>
                      <p className={`text-sm font-mono ${Math.abs(data.rewardFactorImpact.overall.thresholds.officialComparison.percentDifferences.mean65th) < 5 ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {data.rewardFactorImpact.overall.thresholds.officialComparison.percentDifferences.mean65th.toFixed(2)}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Mean 85th Diff</p>
                      <p className={`text-sm font-mono ${Math.abs(data.rewardFactorImpact.overall.thresholds.officialComparison.percentDifferences.mean85th) < 5 ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {data.rewardFactorImpact.overall.thresholds.officialComparison.percentDifferences.mean85th.toFixed(2)}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Variance 30th Diff</p>
                      <p className={`text-sm font-mono ${Math.abs(data.rewardFactorImpact.overall.thresholds.officialComparison.percentDifferences.variance30th) < 10 ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {data.rewardFactorImpact.overall.thresholds.officialComparison.percentDifferences.variance30th.toFixed(2)}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Variance 70th Diff</p>
                      <p className={`text-sm font-mono ${Math.abs(data.rewardFactorImpact.overall.thresholds.officialComparison.percentDifferences.variance70th) < 10 ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {data.rewardFactorImpact.overall.thresholds.officialComparison.percentDifferences.variance70th.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Star Bracket Change Distribution */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Star Rating Bracket Changes</h3>
        
        {/* Summary by half-star change */}
        <div className="mb-6">
          <p className="mb-3 text-xs text-muted-foreground">Contracts by half-star change amount:</p>
          <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-7">
            {Object.entries(data.summary.bracketChangeDistribution).map(([change, count]) => {
              const isGain = change.startsWith('+');
              const isLoss = change.startsWith('-');
              return (
                <div 
                  key={change} 
                  className={`rounded-lg border p-3 text-center ${
                    isGain 
                      ? 'border-emerald-500/30 bg-emerald-500/5' 
                      : isLoss 
                        ? 'border-rose-500/30 bg-rose-500/5' 
                        : 'border-border bg-muted/50'
                  }`}
                >
                  <p className={`text-lg font-semibold ${
                    isGain ? 'text-emerald-500' : isLoss ? 'text-rose-500' : 'text-foreground'
                  }`}>{count}</p>
                  <p className="text-[10px] text-muted-foreground">{change}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed bracket transitions */}
        <div>
          <p className="mb-3 text-xs text-muted-foreground">Top bracket transitions (current → projected):</p>
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-5">
            {data.summary.bracketTransitions
              .filter(t => t.direction !== 'unchanged')
              .slice(0, 10)
              .map((t) => (
                <div 
                  key={t.transition} 
                  className={`rounded-lg border p-3 ${
                    t.direction === 'gain' 
                      ? 'border-emerald-500/30 bg-emerald-500/5' 
                      : 'border-rose-500/30 bg-rose-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${
                      t.direction === 'gain' ? 'text-emerald-500' : 'text-rose-500'
                    }`}>{t.transition}</span>
                    <span className={`text-xs font-semibold ${
                      t.direction === 'gain' ? 'text-emerald-400' : 'text-rose-400'
                    }`}>{t.count}</span>
                  </div>
                </div>
              ))}
          </div>
          {data.summary.bracketTransitions.filter(t => t.direction === 'unchanged').length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {data.summary.bracketTransitions.find(t => t.direction === 'unchanged')?.count || 0} contracts remain at the same star bracket
            </p>
          )}
        </div>
      </div>

      {/* View Mode Tabs and Table */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-1">
            <button
              onClick={() => setViewMode("contracts")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "contracts"
                  ? "bg-primary/10 text-primary border border-primary/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Contracts ({data.summary.totalContracts})
            </button>
            <button
              onClick={() => setViewMode("organizations")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "organizations"
                  ? "bg-primary/10 text-primary border border-primary/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Parent Orgs ({data.summary.totalParentOrgs})
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={viewMode === "contracts" ? "Search contracts..." : "Search organizations..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>

        {viewMode === "contracts" ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      <SortHeader label="Contract" sortKeyValue="contractId" tooltip="CMS contract ID (H = MA, S = PDP)" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      <SortHeader label="Organization" sortKeyValue="organizationMarketingName" tooltip="Marketing name and parent organization" />
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <SortHeader label="Current" sortKeyValue="currentOverallRating" tooltip="Current CMS overall star rating (1-5 scale)" />
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <SortHeader label="Final Projected" sortKeyValue="finalProjectedOverall" tooltip="Projected rating after removing measures AND applying new Reward Factor" />
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <SortHeader label="Final Change" sortKeyValue="finalOverallChange" tooltip="Difference between final projected (with Reward Factor) and current rating (positive = improvement)" />
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                      <SortHeader label="Rating Δ" sortKeyValue="finalStarBracketChange" tooltip="Change in rounded star rating including reward factor adjustment (e.g., +0.5★ means moving from 3.5 to 4.0 stars)" />
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <SortHeader label="r-Factor Δ" sortKeyValue="rFactorChange" tooltip="Change in Reward Factor due to measure removal (current → projected)" />
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground" title="Measures removed / Total measures for this contract. The total varies because not all plans report every measure.">
                      <span className="flex items-center gap-1 justify-end">
                        Removed
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground">?</span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedContracts
                    .slice((contractsPage - 1) * pageSize, contractsPage * pageSize)
                    .map((contract, idx) => (
                    <tr
                      key={contract.contractId}
                      className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link 
                          href={`/summary?contractId=${contract.contractId}&year=2026`}
                          className="text-primary hover:underline"
                        >
                          {contract.contractId}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[240px]">
                          <p className="truncate text-foreground">{contract.organizationMarketingName || contract.contractName || "—"}</p>
                          {contract.parentOrganization && (
                            <p className="truncate text-xs text-muted-foreground">{contract.parentOrganization}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatRating(contract.currentOverallRating)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        <div className="flex flex-col items-end">
                          <span>{formatRating(contract.finalProjectedOverall ?? contract.projectedOverallRating)}</span>
                          {contract.finalProjectedOverall !== null && contract.projectedOverallRating !== null && (
                            <span className="text-[10px] text-muted-foreground">
                              ({formatRating(contract.projectedOverallRating)} + {contract.rewardFactor?.projectedRFactor?.toFixed(1) ?? '0'})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${getChangeColor(contract.finalOverallChange ?? contract.overallChange)}`}>
                        <span className="flex items-center justify-end gap-1">
                          {getChangeIcon(contract.finalOverallChange ?? contract.overallChange)}
                          {formatChange(contract.finalOverallChange ?? contract.overallChange)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {contract.finalStarBracketChange !== 0 ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            contract.finalStarBracketChange > 0 
                              ? "bg-emerald-500/10 text-emerald-500" 
                              : "bg-rose-500/10 text-rose-500"
                          }`}>
                            {contract.finalStarBracketChange > 0 ? "+" : ""}{contract.finalStarBracketChange / 2}★
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {contract.rewardFactor ? (
                          <div className="flex flex-col items-end">
                            <span className={`font-medium ${
                              contract.rewardFactor.rFactorChange > 0.001 
                                ? "text-emerald-500" 
                                : contract.rewardFactor.rFactorChange < -0.001 
                                  ? "text-rose-500" 
                                  : "text-muted-foreground"
                            }`}>
                              {contract.rewardFactor.rFactorChange >= 0 ? "+" : ""}{contract.rewardFactor.rFactorChange.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {contract.rewardFactor.currentRFactor.toFixed(1)} → {contract.rewardFactor.projectedRFactor.toFixed(1)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td 
                        className="px-4 py-3 text-right text-xs text-muted-foreground cursor-help"
                        title={`${contract.operationsMeasuresExcluded} of ${contract.totalMeasuresUsed} measures removed for this contract.\n\nThe total varies by contract because not all plans report data for every measure. Only measures with valid star ratings are included in the calculation.`}
                      >
                        <span className="underline decoration-dotted decoration-muted-foreground/50">
                          {contract.operationsMeasuresExcluded} / {contract.totalMeasuresUsed}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredAndSortedContracts.length > 0 && (
              <div className="border-t border-border p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    Showing {((contractsPage - 1) * pageSize) + 1}–{Math.min(contractsPage * pageSize, filteredAndSortedContracts.length)} of {filteredAndSortedContracts.length} contracts
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Per page:</label>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setContractsPage(1);
                      }}
                      className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={500}>500</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setContractsPage(1)}
                    disabled={contractsPage === 1}
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setContractsPage(p => Math.max(1, p - 1))}
                    disabled={contractsPage === 1}
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground px-2">
                    Page {contractsPage} of {Math.ceil(filteredAndSortedContracts.length / pageSize)}
                  </span>
                  <button
                    onClick={() => setContractsPage(p => Math.min(Math.ceil(filteredAndSortedContracts.length / pageSize), p + 1))}
                    disabled={contractsPage >= Math.ceil(filteredAndSortedContracts.length / pageSize)}
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setContractsPage(Math.ceil(filteredAndSortedContracts.length / pageSize))}
                    disabled={contractsPage >= Math.ceil(filteredAndSortedContracts.length / pageSize)}
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}

            {filteredAndSortedContracts.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No contracts match your search criteria.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleOrgSort("parentOrganization")}
                        className="flex items-center gap-1 text-left font-medium hover:text-foreground transition-colors group"
                        title="Corporate parent organization name"
                      >
                        Parent Organization
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">?</span>
                        {orgSortKey === "parentOrganization" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleOrgSort("contractCount")}
                        className="flex items-center gap-1 justify-end font-medium hover:text-foreground transition-colors group"
                        title="Number of contracts under this parent organization"
                      >
                        Contracts
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">?</span>
                        {orgSortKey === "contractCount" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleOrgSort("avgCurrentRating")}
                        className="flex items-center gap-1 justify-end font-medium hover:text-foreground transition-colors group"
                        title="Average current CMS star rating across all contracts"
                      >
                        Avg Current
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">?</span>
                        {orgSortKey === "avgCurrentRating" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleOrgSort("avgFinalProjectedRating")}
                        className="flex items-center gap-1 justify-end font-medium hover:text-foreground transition-colors group"
                        title="Average final projected rating after measure removals + reward factor"
                      >
                        Avg Final Projected
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">?</span>
                        {orgSortKey === "avgFinalProjectedRating" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleOrgSort("avgFinalOverallChange")}
                        className="flex items-center gap-1 justify-end font-medium hover:text-foreground transition-colors group"
                        title="Average final rating change including reward factor (positive = improvement)"
                      >
                        Avg Final Δ
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">?</span>
                        {orgSortKey === "avgFinalOverallChange" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground" title="Contracts that would improve; (★) = would cross a half-star bracket (e.g., 3.5 → 4.0)">
                      <button
                        onClick={() => handleOrgSort("contractsGaining")}
                        className="group inline-flex items-center gap-1 justify-center cursor-pointer hover:text-foreground transition-colors"
                      >
                        Gaining
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">?</span>
                        {orgSortKey === "contractsGaining" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground" title="Contracts that would decline; (★) = would cross a half-star bracket (e.g., 4.0 → 3.5)">
                      <button
                        onClick={() => handleOrgSort("contractsLosing")}
                        className="group inline-flex items-center gap-1 justify-center cursor-pointer hover:text-foreground transition-colors"
                      >
                        Losing
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">?</span>
                        {orgSortKey === "contractsLosing" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedOrgs
                    .slice((orgsPage - 1) * pageSize, orgsPage * pageSize)
                    .map((org, idx) => (
                    <tr
                      key={org.parentOrganization}
                      className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-4 py-3">
                        <p className="max-w-[300px] truncate text-foreground">{org.parentOrganization}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {org.contractCount}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatRating(org.avgCurrentRating)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatRating(org.avgFinalProjectedRating ?? org.avgProjectedRating)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${getChangeColor(org.avgFinalOverallChange ?? org.avgOverallChange)}`}>
                        <span className="flex items-center justify-end gap-1">
                          {getChangeIcon(org.avgFinalOverallChange ?? org.avgOverallChange)}
                          {formatChange(org.avgFinalOverallChange ?? org.avgOverallChange)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-emerald-500">{org.contractsGaining}</span>
                        {org.finalBracketGainers > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">({org.finalBracketGainers}★)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-rose-500">{org.contractsLosing}</span>
                        {org.finalBracketLosers > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">({org.finalBracketLosers}★)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredAndSortedOrgs.length > 0 && (
              <div className="border-t border-border p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    Showing {((orgsPage - 1) * pageSize) + 1}–{Math.min(orgsPage * pageSize, filteredAndSortedOrgs.length)} of {filteredAndSortedOrgs.length} organizations
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Per page:</label>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setOrgsPage(1);
                      }}
                      className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={500}>500</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOrgsPage(1)}
                    disabled={orgsPage === 1}
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setOrgsPage(p => Math.max(1, p - 1))}
                    disabled={orgsPage === 1}
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground px-2">
                    Page {orgsPage} of {Math.ceil(filteredAndSortedOrgs.length / pageSize)}
                  </span>
                  <button
                    onClick={() => setOrgsPage(p => Math.min(Math.ceil(filteredAndSortedOrgs.length / pageSize), p + 1))}
                    disabled={orgsPage >= Math.ceil(filteredAndSortedOrgs.length / pageSize)}
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setOrgsPage(Math.ceil(filteredAndSortedOrgs.length / pageSize))}
                    disabled={orgsPage >= Math.ceil(filteredAndSortedOrgs.length / pageSize)}
                    className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted/80"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}

            {filteredAndSortedOrgs.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No organizations match your search criteria.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

