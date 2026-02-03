"use client";

import { useEffect, useMemo, useState } from "react";
import { 
  Activity,
  AlertTriangle, 
  ChevronDown, 
  ChevronRight, 
  Heart,
  Loader2, 
  Pill,
  TrendingDown, 
  TrendingUp, 
  TriangleAlert,
  Users
} from "lucide-react";

type ContractMeasureAnalysis = {
  contractId: string;
  parentOrganization: string | null;
  measureCode: string;
  measureName: string;
  domain: string | null;
  score: number;
  starRating: number;
  isRisk: boolean;
  riskPoints: number | null;
  isOpportunity: boolean;
  opportunityPoints: number | null;
  lowerCutPoint: number | null;
  upperCutPoint: number | null;
  isHEDIS: boolean;
  isHOS: boolean;
  isPharmacy: boolean;
};

type ContractAnalysis = {
  contractId: string;
  parentOrganization: string | null;
  enrollment: number | null;
  riskMeasures: ContractMeasureAnalysis[];
  opportunityMeasures: ContractMeasureAnalysis[];
  totalRiskCount: number;
  totalOpportunityCount: number;
};

type RiskOpportunitySummary = {
  year: number;
  uhcContractCount: number;
  totalMeasuresAnalyzed: number;
  totalUHCEnrollment: number;
  byContract: ContractAnalysis[];
  totalRiskMeasures: number;
  totalOpportunityMeasures: number;
  measureCutPoints: {
    measureCode: string;
    measureName: string;
    domain: string | null;
    starCutPoints: Record<string, number | null>;
    totalContracts: number;
  }[];
};

const STAR_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#facc15",
  4: "#84cc16",
  5: "#22c55e",
};

// Format enrollment number with commas and abbreviations for large numbers
function formatEnrollment(enrollment: number | null): string {
  if (enrollment === null) return "N/A";
  if (enrollment >= 1_000_000) {
    return `${(enrollment / 1_000_000).toFixed(1)}M`;
  }
  if (enrollment >= 1_000) {
    return `${(enrollment / 1_000).toFixed(0)}K`;
  }
  return enrollment.toLocaleString();
}

// Format full enrollment with commas
function formatEnrollmentFull(enrollment: number | null): string {
  if (enrollment === null) return "N/A";
  return enrollment.toLocaleString();
}

export function RiskOpportunityAnalysis() {
  const [data, setData] = useState<RiskOpportunitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedContracts, setExpandedContracts] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"by-contract" | "by-measure">("by-contract");
  const [filterDomain, setFilterDomain] = useState<string>("all");

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/uhc-comparison/risk-opportunity");
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to fetch risk/opportunity data");
        }
        const payload: RiskOpportunitySummary = await response.json();
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  const domains = useMemo(() => {
    if (!data) return [];
    const domainSet = new Set<string>();
    data.byContract.forEach((c) => {
      c.riskMeasures.forEach((m) => m.domain && domainSet.add(m.domain));
      c.opportunityMeasures.forEach((m) => m.domain && domainSet.add(m.domain));
    });
    return Array.from(domainSet).sort();
  }, [data]);

  // Calculate HEDIS, HOS, and Pharmacy stats
  const measureTypeStats = useMemo(() => {
    if (!data) return { hedisRisk: 0, hedisOpp: 0, hosRisk: 0, hosOpp: 0, pharmacyRisk: 0, pharmacyOpp: 0 };
    
    let hedisRisk = 0;
    let hedisOpp = 0;
    let hosRisk = 0;
    let hosOpp = 0;
    let pharmacyRisk = 0;
    let pharmacyOpp = 0;
    
    data.byContract.forEach((c) => {
      c.riskMeasures.forEach((m) => {
        if (m.isHEDIS) hedisRisk++;
        if (m.isHOS) hosRisk++;
        if (m.isPharmacy) pharmacyRisk++;
      });
      c.opportunityMeasures.forEach((m) => {
        if (m.isHEDIS) hedisOpp++;
        if (m.isHOS) hosOpp++;
        if (m.isPharmacy) pharmacyOpp++;
      });
    });
    
    return { hedisRisk, hedisOpp, hosRisk, hosOpp, pharmacyRisk, pharmacyOpp };
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data) return null;
    if (filterDomain === "all") return data;

    return {
      ...data,
      byContract: data.byContract.map((c) => ({
        ...c,
        riskMeasures: c.riskMeasures.filter((m) => m.domain === filterDomain),
        opportunityMeasures: c.opportunityMeasures.filter((m) => m.domain === filterDomain),
        totalRiskCount: c.riskMeasures.filter((m) => m.domain === filterDomain).length,
        totalOpportunityCount: c.opportunityMeasures.filter((m) => m.domain === filterDomain).length,
      })).filter((c) => c.totalRiskCount > 0 || c.totalOpportunityCount > 0),
    };
  }, [data, filterDomain]);

  // Group by measure for "by-measure" view
  const byMeasureData = useMemo(() => {
    if (!data) return [];
    
    const measureMap = new Map<string, {
      measureCode: string;
      measureName: string;
      domain: string | null;
      isHEDIS: boolean;
      isHOS: boolean;
      isPharmacy: boolean;
      riskContracts: ContractMeasureAnalysis[];
      opportunityContracts: ContractMeasureAnalysis[];
    }>();

    data.byContract.forEach((contract) => {
      contract.riskMeasures.forEach((m) => {
        if (filterDomain !== "all" && m.domain !== filterDomain) return;
        
        if (!measureMap.has(m.measureCode)) {
          measureMap.set(m.measureCode, {
            measureCode: m.measureCode,
            measureName: m.measureName,
            domain: m.domain,
            isHEDIS: m.isHEDIS,
            isHOS: m.isHOS,
            isPharmacy: m.isPharmacy,
            riskContracts: [],
            opportunityContracts: [],
          });
        }
        measureMap.get(m.measureCode)!.riskContracts.push(m);
      });

      contract.opportunityMeasures.forEach((m) => {
        if (filterDomain !== "all" && m.domain !== filterDomain) return;
        
        if (!measureMap.has(m.measureCode)) {
          measureMap.set(m.measureCode, {
            measureCode: m.measureCode,
            measureName: m.measureName,
            domain: m.domain,
            isHEDIS: m.isHEDIS,
            isHOS: m.isHOS,
            isPharmacy: m.isPharmacy,
            riskContracts: [],
            opportunityContracts: [],
          });
        }
        measureMap.get(m.measureCode)!.opportunityContracts.push(m);
      });
    });

    return Array.from(measureMap.values())
      .sort((a, b) => 
        (b.riskContracts.length + b.opportunityContracts.length) - 
        (a.riskContracts.length + a.opportunityContracts.length)
      );
  }, [data, filterDomain]);

  const toggleContract = (contractId: string) => {
    setExpandedContracts((prev) => {
      const next = new Set(prev);
      if (next.has(contractId)) {
        next.delete(contractId);
      } else {
        next.add(contractId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center text-sm text-muted-foreground">
            Analyzing measures near cut points...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-8">
        <div className="flex flex-col items-center gap-3 py-14 text-red-200">
          <TriangleAlert className="h-8 w-8" />
          <div className="text-center text-sm font-medium">{error}</div>
        </div>
      </div>
    );
  }

  if (!data || !filteredData) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8">
        <div className="text-center text-muted-foreground py-10">
          No risk/opportunity data available.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                {data.year} Star Ratings
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                Risk & Opportunity Analysis
              </h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                Identifies UnitedHealth measures where contract scores are within 2 points of the 
                cut point boundaries. <strong className="text-red-400">Risk</strong> measures are 
                close to dropping a star, while <strong className="text-green-400">Opportunity</strong> measures 
                are close to gaining a star.
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
              <p className="text-xs text-muted-foreground">UHC Contracts Analyzed</p>
              <p className="mt-2 text-2xl font-semibold text-primary">
                {data.uhcContractCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">For {data.year}</p>
            </div>
            <div className="rounded-2xl border border-blue-500/40 bg-blue-500/5 p-4">
              <p className="text-xs text-muted-foreground">Total UHC Enrollment</p>
              <p className="mt-2 text-2xl font-semibold text-blue-400">
                {formatEnrollment(data.totalUHCEnrollment)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{formatEnrollmentFull(data.totalUHCEnrollment)} members</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Measures with Cut Points</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {data.totalMeasuresAnalyzed}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Derived from data</p>
            </div>
            <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <p className="text-xs text-muted-foreground">Total Risk Measures</p>
              </div>
              <p className="mt-2 text-2xl font-semibold text-red-500">
                {data.totalRiskMeasures}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Within 2 pts of lower cut point</p>
            </div>
            <div className="rounded-2xl border border-green-500/40 bg-green-500/5 p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <p className="text-xs text-muted-foreground">Total Opportunity Measures</p>
              </div>
              <p className="mt-2 text-2xl font-semibold text-green-500">
                {data.totalOpportunityMeasures}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Within 2 pts of upper cut point</p>
            </div>
          </div>

          {/* HEDIS, HOS & Pharmacy Breakdown */}
          {(measureTypeStats.hedisRisk > 0 || measureTypeStats.hedisOpp > 0 || 
            measureTypeStats.hosRisk > 0 || measureTypeStats.hosOpp > 0 ||
            measureTypeStats.pharmacyRisk > 0 || measureTypeStats.pharmacyOpp > 0) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* HEDIS */}
              <div className="rounded-2xl border border-pink-500/40 bg-pink-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="h-4 w-4 text-pink-400" />
                  <p className="text-sm font-medium text-pink-400">HEDIS</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Risk</p>
                    <p className="text-xl font-semibold text-pink-400">{measureTypeStats.hedisRisk}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Opportunity</p>
                    <p className="text-xl font-semibold text-pink-400">{measureTypeStats.hedisOpp}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Clinical quality measures</p>
              </div>
              {/* HOS */}
              <div className="rounded-2xl border border-cyan-500/40 bg-cyan-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <p className="text-sm font-medium text-cyan-400">HOS</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Risk</p>
                    <p className="text-xl font-semibold text-cyan-400">{measureTypeStats.hosRisk}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Opportunity</p>
                    <p className="text-xl font-semibold text-cyan-400">{measureTypeStats.hosOpp}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Health Outcomes Survey</p>
              </div>
              {/* Pharmacy */}
              <div className="rounded-2xl border border-purple-500/40 bg-purple-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Pill className="h-4 w-4 text-purple-400" />
                  <p className="text-sm font-medium text-purple-400">Pharmacy</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Risk</p>
                    <p className="text-xl font-semibold text-purple-400">{measureTypeStats.pharmacyRisk}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Opportunity</p>
                    <p className="text-xl font-semibold text-purple-400">{measureTypeStats.pharmacyOpp}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Medication adherence</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setViewMode("by-contract")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  viewMode === "by-contract"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                By Contract
              </button>
              <button
                type="button"
                onClick={() => setViewMode("by-measure")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  viewMode === "by-measure"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                By Measure
              </button>
            </div>

            <div className="relative">
              <label className="block text-xs text-muted-foreground mb-1.5">Domain Filter</label>
              <div className="relative">
                <select
                  value={filterDomain}
                  onChange={(e) => setFilterDomain(e.target.value)}
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
          </div>
        </div>
      </div>

      {/* By Contract View */}
      {viewMode === "by-contract" && filteredData.byContract.length > 0 && (
        <div className="flex flex-col gap-4">
          {filteredData.byContract.map((contract) => {
            const isExpanded = expandedContracts.has(contract.contractId);
            const hasRisks = contract.totalRiskCount > 0;
            const hasOpportunities = contract.totalOpportunityCount > 0;

            if (!hasRisks && !hasOpportunities) return null;

            return (
              <div
                key={contract.contractId}
                className="rounded-2xl border border-border bg-card overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleContract(contract.contractId)}
                  className="w-full flex items-center justify-between gap-4 p-4 hover:bg-muted/30 transition text-left"
                >
                  <div className="flex items-center gap-4">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <div className="flex items-center gap-3">
                        <p className="font-semibold text-foreground">{contract.contractId}</p>
                        {contract.enrollment !== null && (
                          <div className="flex items-center gap-1 text-xs text-blue-400">
                            <Users className="h-3.5 w-3.5" />
                            <span className="font-medium">{formatEnrollment(contract.enrollment)}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {contract.parentOrganization || "Unknown Organization"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {hasRisks && (
                      <div className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {contract.totalRiskCount} Risk
                      </div>
                    )}
                    {hasOpportunities && (
                      <div className="flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-500">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {contract.totalOpportunityCount} Opportunity
                      </div>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Risk Measures */}
                      {hasRisks && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingDown className="h-4 w-4 text-red-500" />
                            <h4 className="text-sm font-semibold text-red-400">
                              Risk Measures ({contract.totalRiskCount})
                            </h4>
                          </div>
                          <div className="space-y-2">
                            {contract.riskMeasures.map((m, idx) => (
                              <div
                                key={`${m.measureCode}-${idx}`}
                                className={`rounded-lg border p-3 ${
                                  m.isHEDIS 
                                    ? "border-pink-500/30 bg-gradient-to-r from-red-500/5 to-pink-500/10" 
                                    : m.isHOS
                                      ? "border-cyan-500/30 bg-gradient-to-r from-red-500/5 to-cyan-500/10"
                                      : m.isPharmacy 
                                        ? "border-purple-500/30 bg-gradient-to-r from-red-500/5 to-purple-500/10"
                                        : "border-red-500/20 bg-red-500/5"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium text-foreground truncate">
                                        {m.measureName}
                                      </p>
                                      {m.isHEDIS && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/50 bg-pink-500/20 px-2 py-0.5 text-[10px] font-semibold text-pink-400">
                                          <Heart className="h-2.5 w-2.5" />
                                          HEDIS
                                        </span>
                                      )}
                                      {m.isHOS && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/50 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
                                          <Activity className="h-2.5 w-2.5" />
                                          HOS
                                        </span>
                                      )}
                                      {m.isPharmacy && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/50 bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                                          <Pill className="h-2.5 w-2.5" />
                                          Pharmacy
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                                      <span className="rounded border border-border px-1.5 py-0.5">
                                        {m.measureCode}
                                      </span>
                                      {m.domain && (
                                        <span className="rounded border border-border px-1.5 py-0.5">
                                          {m.domain}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="flex items-center gap-1.5">
                                      <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: STAR_COLORS[m.starRating] }}
                                      />
                                      <span className="text-sm font-semibold">{m.starRating}★</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {m.score}%
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-red-500/20 text-xs">
                                  <span className="text-red-400 font-medium">
                                    Only {m.riskPoints} pts above {m.lowerCutPoint}% cut point
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Opportunity Measures */}
                      {hasOpportunities && (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="h-4 w-4 text-green-500" />
                            <h4 className="text-sm font-semibold text-green-400">
                              Opportunity Measures ({contract.totalOpportunityCount})
                            </h4>
                          </div>
                          <div className="space-y-2">
                            {contract.opportunityMeasures.map((m, idx) => (
                              <div
                                key={`${m.measureCode}-${idx}`}
                                className={`rounded-lg border p-3 ${
                                  m.isHEDIS 
                                    ? "border-pink-500/30 bg-gradient-to-r from-green-500/5 to-pink-500/10" 
                                    : m.isHOS
                                      ? "border-cyan-500/30 bg-gradient-to-r from-green-500/5 to-cyan-500/10"
                                      : m.isPharmacy 
                                        ? "border-purple-500/30 bg-gradient-to-r from-green-500/5 to-purple-500/10"
                                        : "border-green-500/20 bg-green-500/5"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium text-foreground truncate">
                                        {m.measureName}
                                      </p>
                                      {m.isHEDIS && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/50 bg-pink-500/20 px-2 py-0.5 text-[10px] font-semibold text-pink-400">
                                          <Heart className="h-2.5 w-2.5" />
                                          HEDIS
                                        </span>
                                      )}
                                      {m.isHOS && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/50 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-400">
                                          <Activity className="h-2.5 w-2.5" />
                                          HOS
                                        </span>
                                      )}
                                      {m.isPharmacy && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/50 bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                                          <Pill className="h-2.5 w-2.5" />
                                          Pharmacy
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                                      <span className="rounded border border-border px-1.5 py-0.5">
                                        {m.measureCode}
                                      </span>
                                      {m.domain && (
                                        <span className="rounded border border-border px-1.5 py-0.5">
                                          {m.domain}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="flex items-center gap-1.5">
                                      <div
                                        className="h-3 w-3 rounded-full"
                                        style={{ backgroundColor: STAR_COLORS[m.starRating] }}
                                      />
                                      <span className="text-sm font-semibold">{m.starRating}★</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {m.score}%
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-green-500/20 text-xs">
                                  <span className="text-green-400 font-medium">
                                    Only {m.opportunityPoints} pts below {m.upperCutPoint}% for {m.starRating + 1}★
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* By Measure View */}
      {viewMode === "by-measure" && byMeasureData.length > 0 && (
        <div className="flex flex-col gap-4">
          {byMeasureData.map((measure) => {
            const hasRisks = measure.riskContracts.length > 0;
            const hasOpportunities = measure.opportunityContracts.length > 0;

            return (
              <div
                key={measure.measureCode}
                className={`rounded-2xl border bg-card p-6 ${
                  measure.isHEDIS 
                    ? "border-pink-500/30" 
                    : measure.isHOS
                      ? "border-cyan-500/30"
                      : measure.isPharmacy 
                        ? "border-purple-500/30"
                        : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-foreground">
                        {measure.measureName}
                      </h3>
                      {measure.isHEDIS && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/50 bg-pink-500/20 px-2 py-0.5 text-xs font-semibold text-pink-400">
                          <Heart className="h-3 w-3" />
                          HEDIS
                        </span>
                      )}
                      {measure.isHOS && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/50 bg-cyan-500/20 px-2 py-0.5 text-xs font-semibold text-cyan-400">
                          <Activity className="h-3 w-3" />
                          HOS
                        </span>
                      )}
                      {measure.isPharmacy && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/50 bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-400">
                          <Pill className="h-3 w-3" />
                          Pharmacy
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="rounded border border-border px-2 py-0.5">
                        {measure.measureCode}
                      </span>
                      {measure.domain && (
                        <span className="rounded border border-border px-2 py-0.5">
                          {measure.domain}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {hasRisks && (
                      <div className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {measure.riskContracts.length} at Risk
                      </div>
                    )}
                    {hasOpportunities && (
                      <div className="flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-xs font-medium text-green-500">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {measure.opportunityContracts.length} Opportunity
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Risk Contracts */}
                  {hasRisks && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                      <h4 className="text-sm font-medium text-red-400 mb-3">
                        Risk Contracts
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-red-500/20 text-left text-muted-foreground">
                              <th className="pb-2 pr-3">Contract</th>
                              <th className="pb-2 pr-3 text-right">Score</th>
                              <th className="pb-2 pr-3 text-right">Star</th>
                              <th className="pb-2 text-right">Gap</th>
                            </tr>
                          </thead>
                          <tbody>
                            {measure.riskContracts.map((c, idx) => (
                              <tr key={`${c.contractId}-${idx}`} className="border-b border-red-500/10">
                                <td className="py-1.5 pr-3 font-medium">{c.contractId}</td>
                                <td className="py-1.5 pr-3 text-right">{c.score}%</td>
                                <td className="py-1.5 pr-3 text-right">
                                  <span
                                    className="inline-flex items-center gap-1"
                                    style={{ color: STAR_COLORS[c.starRating] }}
                                  >
                                    {c.starRating}★
                                  </span>
                                </td>
                                <td className="py-1.5 text-right text-red-400">
                                  +{c.riskPoints} pts
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Opportunity Contracts */}
                  {hasOpportunities && (
                    <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                      <h4 className="text-sm font-medium text-green-400 mb-3">
                        Opportunity Contracts
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-green-500/20 text-left text-muted-foreground">
                              <th className="pb-2 pr-3">Contract</th>
                              <th className="pb-2 pr-3 text-right">Score</th>
                              <th className="pb-2 pr-3 text-right">Star</th>
                              <th className="pb-2 text-right">Gap</th>
                            </tr>
                          </thead>
                          <tbody>
                            {measure.opportunityContracts.map((c, idx) => (
                              <tr key={`${c.contractId}-${idx}`} className="border-b border-green-500/10">
                                <td className="py-1.5 pr-3 font-medium">{c.contractId}</td>
                                <td className="py-1.5 pr-3 text-right">{c.score}%</td>
                                <td className="py-1.5 pr-3 text-right">
                                  <span
                                    className="inline-flex items-center gap-1"
                                    style={{ color: STAR_COLORS[c.starRating] }}
                                  >
                                    {c.starRating}★
                                  </span>
                                </td>
                                <td className="py-1.5 text-right text-green-400">
                                  -{c.opportunityPoints} pts
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {viewMode === "by-contract" && filteredData.byContract.length === 0 && (
        <div className="rounded-3xl border border-border bg-card p-8">
          <div className="text-center text-muted-foreground py-10">
            No contracts with risk or opportunity measures found for the selected domain.
          </div>
        </div>
      )}

      {viewMode === "by-measure" && byMeasureData.length === 0 && (
        <div className="rounded-3xl border border-border bg-card p-8">
          <div className="text-center text-muted-foreground py-10">
            No measures with risk or opportunity contracts found for the selected domain.
          </div>
        </div>
      )}
    </div>
  );
}
