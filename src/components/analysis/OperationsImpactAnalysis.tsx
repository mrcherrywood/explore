"use client";

import { useEffect, useState, useMemo } from "react";
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
  overallChange: number | null;
  partCChange: number | null;
  partDChange: number | null;
  starBracketChange: number;
  operationsMeasuresExcluded: number;
  totalMeasuresUsed: number;
  totalMeasuresWithoutOps: number;
};

type ParentOrgAnalysis = {
  parentOrganization: string;
  contractCount: number;
  avgCurrentRating: number | null;
  avgProjectedRating: number | null;
  avgOverallChange: number | null;
  contractsGaining: number;
  contractsLosing: number;
  bracketGainers: number;
  bracketLosers: number;
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
    contractsGaining: number;
    contractsLosing: number;
    contractsUnchanged: number;
    bracketGainers: number;
    bracketLosers: number;
    changeDistribution: Record<string, number>;
    totalParentOrgs: number;
  };
  contracts: ContractAnalysis[];
  parentOrganizations: ParentOrgAnalysis[];
};

type SortKey = "contractId" | "organizationMarketingName" | "currentOverallRating" | "projectedOverallRating" | "overallChange" | "starBracketChange";
type OrgSortKey = "parentOrganization" | "contractCount" | "avgCurrentRating" | "avgProjectedRating" | "avgOverallChange";
type SortDirection = "asc" | "desc";
type ViewMode = "contracts" | "organizations";

export function OperationsImpactAnalysis() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("overallChange");
  const [orgSortKey, setOrgSortKey] = useState<OrgSortKey>("avgOverallChange");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [showDomainsInfo, setShowDomainsInfo] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("contracts");

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
      setSortDirection(key === "overallChange" || key === "starBracketChange" ? "desc" : "asc");
    }
  };

  const handleOrgSort = (key: OrgSortKey) => {
    if (orgSortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setOrgSortKey(key);
      setSortDirection(key === "avgOverallChange" || key === "contractCount" ? "desc" : "asc");
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
        case "overallChange":
          aVal = a.overallChange;
          bVal = b.overallChange;
          break;
        case "starBracketChange":
          aVal = a.starBracketChange;
          bVal = b.starBracketChange;
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
        case "avgOverallChange":
          aVal = a.avgOverallChange;
          bVal = b.avgOverallChange;
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
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Avg Rating Change</p>
          <p className={`mt-2 text-3xl font-semibold ${getChangeColor(data.summary.avgOverallChange)}`}>
            {formatChange(data.summary.avgOverallChange)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Overall star rating</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Contracts Gaining</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-500">{data.summary.contractsGaining.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.summary.bracketGainers} would gain a star rating</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Contracts Losing</p>
          <p className="mt-2 text-3xl font-semibold text-rose-500">{data.summary.contractsLosing.toLocaleString()}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.summary.bracketLosers} would lose a star rating</p>
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

      {/* Change Distribution */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Rating Change Distribution</h3>
        <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-8">
          {Object.entries(data.summary.changeDistribution).map(([range, count]) => (
            <div key={range} className="rounded-lg border border-border bg-muted/50 p-3 text-center">
              <p className="text-lg font-semibold text-foreground">{count}</p>
              <p className="text-[10px] text-muted-foreground">{range}</p>
            </div>
          ))}
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
                      <SortHeader label="Projected" sortKeyValue="projectedOverallRating" tooltip="Projected rating after removing CMS measures (weighted average of remaining measures)" />
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <SortHeader label="Change" sortKeyValue="overallChange" tooltip="Difference between projected and current rating (positive = improvement)" />
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">
                      <SortHeader label="Rating Δ" sortKeyValue="starBracketChange" tooltip="Change in rounded star rating (e.g., +0.5★ means moving from 3.5 to 4.0 stars)" />
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
                  {filteredAndSortedContracts.slice(0, 100).map((contract, idx) => (
                    <tr
                      key={contract.contractId}
                      className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{contract.contractId}</td>
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
                        {formatRating(contract.projectedOverallRating)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${getChangeColor(contract.overallChange)}`}>
                        <span className="flex items-center justify-end gap-1">
                          {getChangeIcon(contract.overallChange)}
                          {formatChange(contract.overallChange)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {contract.starBracketChange !== 0 ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            contract.starBracketChange > 0 
                              ? "bg-emerald-500/10 text-emerald-500" 
                              : "bg-rose-500/10 text-rose-500"
                          }`}>
                            {contract.starBracketChange > 0 ? "+" : ""}{contract.starBracketChange / 2}★
                          </span>
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

            {filteredAndSortedContracts.length > 100 && (
              <div className="border-t border-border p-4 text-center text-xs text-muted-foreground">
                Showing 100 of {filteredAndSortedContracts.length} contracts. Use search to filter results.
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
                        onClick={() => handleOrgSort("avgProjectedRating")}
                        className="flex items-center gap-1 justify-end font-medium hover:text-foreground transition-colors group"
                        title="Average projected rating after measure removals"
                      >
                        Avg Projected
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">?</span>
                        {orgSortKey === "avgProjectedRating" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                      <button
                        onClick={() => handleOrgSort("avgOverallChange")}
                        className="flex items-center gap-1 justify-end font-medium hover:text-foreground transition-colors group"
                        title="Average rating change across all contracts (positive = improvement)"
                      >
                        Avg Change
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">?</span>
                        {orgSortKey === "avgOverallChange" && (
                          sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground" title="Contracts that would improve; (★) = would gain a full star rating">
                      <span className="flex items-center gap-1 justify-center">
                        Gaining
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground">?</span>
                      </span>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground" title="Contracts that would decline; (★) = would lose a full star rating">
                      <span className="flex items-center gap-1 justify-center">
                        Losing
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-muted text-[9px] text-muted-foreground">?</span>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedOrgs.slice(0, 100).map((org, idx) => (
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
                        {formatRating(org.avgProjectedRating)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${getChangeColor(org.avgOverallChange)}`}>
                        <span className="flex items-center justify-end gap-1">
                          {getChangeIcon(org.avgOverallChange)}
                          {formatChange(org.avgOverallChange)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-emerald-500">{org.contractsGaining}</span>
                        {org.bracketGainers > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">({org.bracketGainers}★)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-rose-500">{org.contractsLosing}</span>
                        {org.bracketLosers > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">({org.bracketLosers}★)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredAndSortedOrgs.length > 100 && (
              <div className="border-t border-border p-4 text-center text-xs text-muted-foreground">
                Showing 100 of {filteredAndSortedOrgs.length} organizations. Use search to filter results.
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

