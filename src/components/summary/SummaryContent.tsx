"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { Star, TrendingUp, TrendingDown, Building2, MapPin, DollarSign, Users, Info, Search, X } from "lucide-react";

type SummaryData = {
  year: number;
  contractId: string;
  contract: {
    contract_id: string;
    contract_name: string | null;
    organization_marketing_name: string | null;
    parent_organization: string | null;
    organization_type: string | null;
    snp_indicator: string | null;
  };
  overallStars: {
    average: number;
    distribution: Record<number, number>;
    totalMeasures: number;
  };
  domainStars: Array<{
    domain: string;
    averageStars: number;
    measureCount: number;
  }>;
  performance: {
    highest: Array<{
      metric_label: string | null;
      metric_code: string;
      star_rating: string | null;
      rate_percent: number | null;
      metric_category: string;
    }>;
    lowest: Array<{
      metric_label: string | null;
      metric_code: string;
      star_rating: string | null;
      rate_percent: number | null;
      metric_category: string;
    }>;
  };
  planLandscape: {
    totalPlans: number;
    avgPartCPremium: number;
    avgPartDPremium: number;
    statesServed: number;
    countiesServed: number;
    snpPlans: number;
    plans: Array<{
      plan_id: string;
      plan_name: string | null;
      plan_type: string | null;
      overall_star_rating: string | null;
      county_name: string | null;
      state_abbreviation: string | null;
      part_c_premium: string | null;
      part_d_total_premium: string | null;
    }>;
  };
  enrollmentSnapshot: {
    reportYear: number;
    reportMonth: number;
    totalEnrollment: number | null;
    reportedPlans: number;
    suppressedPlans: number;
    snpEnrollment: number | null;
    planTypeSummary: Array<{ planType: string; plans: number; enrollment: number }>;
    topPlans: Array<{
      plan_id: string;
      plan_type: string | null;
      enrollment: number | null;
      is_suppressed: boolean;
      is_snp: boolean;
      previous_enrollment: number | null;
      enrollment_change: number | null;
      enrollment_percent_change: number | null;
    }>;
    previousPeriod: {
      reportYear: number;
      reportMonth: number;
      totalEnrollment: number | null;
    } | null;
    yoyEnrollmentChange: number | null;
    yoyEnrollmentPercent: number | null;
  } | null;
  summaryRating: {
    part_c_summary: string | null;
    part_c_summary_numeric: number | null;
    part_d_summary: string | null;
    part_d_summary_numeric: number | null;
    overall_rating: string | null;
    overall_rating_numeric: number | null;
    disaster_percent_2021: number | null;
    disaster_percent_2022: number | null;
    disaster_percent_2023: number | null;
  } | null;
  computedRatings: {
    overall: number | null;
    partC: number | null;
    partD: number | null;
  };
  qualityImprovement: {
    thresholdMet: boolean;
    excludedMeasures: string[];
  };
  cai: {
    cai_value: number | null;
    overall_fac: number | null;
    part_c_fac: number | null;
    part_d_ma_pd_fac: number | null;
    part_d_pdp_fac: number | null;
    overallBeforeCAI: number | null;
    overallAfterCAI: number | null;
  } | null;
  disenrollment: {
    year: number;
    sourceFile: string | null;
    categories: Array<{
      key: string;
      label: string;
      percent: number | null;
      note: string | null;
    }>;
  } | null;
  filters: {
    availableYears: number[];
    availableContracts: Array<{
      contract_id: string;
      contract_name: string | null;
      organization_marketing_name: string | null;
    }>;
  };
};

type Props = {
  initialYear?: string;
  initialContractId?: string;
};

export function SummaryContent({ initialYear, initialContractId }: Props) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(initialYear || "");
  const [selectedContractId, setSelectedContractId] = useState(initialContractId || "");
  const [contractSearchQuery, setContractSearchQuery] = useState<string>("");
  const [isContractDropdownOpen, setIsContractDropdownOpen] = useState<boolean>(false);
  const contractDropdownRef = useRef<HTMLDivElement | null>(null);

  const contractOptions = useMemo(() => {
    if (!data?.filters.availableContracts) return [];
    return data.filters.availableContracts.map((contract) => ({
      value: contract.contract_id,
      label: `${contract.contract_id} - ${contract.organization_marketing_name || contract.contract_name}`,
    }));
  }, [data?.filters.availableContracts]);

  const filteredContractOptions = useMemo(() => {
    if (!contractSearchQuery.trim()) return contractOptions;
    const query = contractSearchQuery.toLowerCase();
    return contractOptions.filter(
      (option) =>
        option.value.toLowerCase().includes(query) ||
        option.label.toLowerCase().includes(query)
    );
  }, [contractOptions, contractSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        contractDropdownRef.current &&
        !contractDropdownRef.current.contains(event.target as Node)
      ) {
        setIsContractDropdownOpen(false);
      }
    };

    if (isContractDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isContractDropdownOpen]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selectedYear) params.set("year", selectedYear);
        if (selectedContractId) params.set("contractId", selectedContractId);

        const response = await fetch(`/api/summary?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Failed to fetch summary data");
        }
        const result = await response.json();
        setData(result);

        const resolvedYear = result?.year ? result.year.toString() : "";
        if (resolvedYear && resolvedYear !== selectedYear) {
          setSelectedYear(resolvedYear);
        }

        if (result?.contractId && result.contractId !== selectedContractId) {
          setSelectedContractId(result.contractId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedYear, selectedContractId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">Loading summary data...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">{error || "No data available"}</div>
      </div>
    );
  }

  const {
    contract,
    overallStars,
    domainStars,
    performance,
    planLandscape,
    filters,
    summaryRating,
    enrollmentSnapshot,
    disenrollment,
  } = data;

  const formatMonthYear = (year: number, month: number) => {
    const date = new Date(Date.UTC(year, month - 1));
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const formatNumber = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'N/A';
    }
    return value.toLocaleString();
  };

  const formatPercentValue = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    const isWholeNumber = Number.isInteger(value);
    return `${isWholeNumber ? value.toFixed(0) : value.toFixed(1)}%`;
  };

  const formatSignedNumber = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    if (value === 0) {
      return '0';
    }
    const abs = Math.abs(value).toLocaleString();
    const sign = value > 0 ? '+' : '-';
    return `${sign}${abs}`;
  };

  const formatSignedPercent = (value: number | null | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    if (value === 0) {
      return '0%';
    }
    const abs = Math.abs(value);
    const formatted = Math.abs(abs) >= 10 ? abs.toFixed(0) : abs.toFixed(1);
    const sign = value > 0 ? '+' : '-';
    return `${sign}${formatted}%`;
  };

  const hasYoyEnrollmentData = Boolean(
    enrollmentSnapshot?.previousPeriod &&
    (enrollmentSnapshot.yoyEnrollmentChange !== null || enrollmentSnapshot.yoyEnrollmentPercent !== null)
  );

  const enrollmentChangeDirection: 'up' | 'down' | 'flat' = (() => {
    if (!hasYoyEnrollmentData) {
      return 'flat';
    }
    const change = enrollmentSnapshot?.yoyEnrollmentChange ?? 0;
    if (change > 0) {
      return 'up';
    }
    if (change < 0) {
      return 'down';
    }
    return 'flat';
  })();

  const ChangeIcon = enrollmentChangeDirection === 'down' ? TrendingDown : TrendingUp;
  const changeAccentClass = enrollmentChangeDirection === 'up'
    ? 'text-emerald-500'
    : enrollmentChangeDirection === 'down'
    ? 'text-red-500'
    : 'text-muted-foreground';

  const yoyChangeDisplay = formatSignedNumber(enrollmentSnapshot?.yoyEnrollmentChange);
  const yoyPercentDisplay = formatSignedPercent(enrollmentSnapshot?.yoyEnrollmentPercent);
  const previousPeriodLabel = enrollmentSnapshot?.previousPeriod
    ? formatMonthYear(enrollmentSnapshot.previousPeriod.reportYear, enrollmentSnapshot.previousPeriod.reportMonth)
    : null;

  type RatingCardConfig = {
    key: 'overall' | 'partC' | 'partD';
    label: string;
    computed: number | null | undefined;
    cmsNumeric: number | null | undefined;
    cmsText: string | null | undefined;
    fallback?: number;
  };

  const ratingCards: RatingCardConfig[] = [
    {
      key: 'overall',
      label: 'Overall Rating',
      computed: data.computedRatings.overall,
      cmsNumeric: summaryRating?.overall_rating_numeric,
      cmsText: summaryRating?.overall_rating,
      fallback: overallStars.average,
    },
    {
      key: 'partC',
      label: 'Part C Summary',
      computed: data.computedRatings.partC,
      cmsNumeric: summaryRating?.part_c_summary_numeric,
      cmsText: summaryRating?.part_c_summary,
    },
    {
      key: 'partD',
      label: 'Part D Summary',
      computed: data.computedRatings.partD,
      cmsNumeric: summaryRating?.part_d_summary_numeric,
      cmsText: summaryRating?.part_d_summary,
    },
  ];

  const formatCmsValue = (
    cmsNumeric: number | null | undefined,
    cmsText: string | null | undefined
  ) => {
    if (typeof cmsNumeric === 'number' && Number.isFinite(cmsNumeric)) {
      return cmsNumeric.toFixed(1);
    }
    if (cmsText && cmsText.trim().length > 0) {
      return cmsText.trim();
    }
    return null;
  };

  const formatComputedValue = (computed: number | null | undefined) => {
    if (typeof computed === 'number' && Number.isFinite(computed)) {
      return computed.toFixed(2);
    }
    return null;
  };

  const valuesAreEqual = (a: string | null, b: string | null) => {
    if (!a || !b) {
      return false;
    }
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return Math.abs(numA - numB) < 0.01;
    }
    return a === b;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <div className="rounded-3xl border border-border bg-card px-8 py-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Year:</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="rounded-full border border-border bg-muted px-4 py-2 text-sm text-foreground"
            >
              {filters.availableYears.map((year: number) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2" ref={contractDropdownRef}>
            <label className="text-sm text-muted-foreground">Contract:</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsContractDropdownOpen(!isContractDropdownOpen)}
                className="rounded-full border border-border bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted/80 transition flex items-center gap-2 min-w-[300px]"
              >
                <span className="truncate flex-1 text-left">
                  {selectedContractId
                    ? contractOptions.find((opt) => opt.value === selectedContractId)?.label || "Select contract"
                    : "Select contract"}
                </span>
                <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </button>
              {isContractDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[400px] rounded-xl border border-border bg-card shadow-lg">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search contracts..."
                        value={contractSearchQuery}
                        onChange={(e) => setContractSearchQuery(e.target.value)}
                        className="w-full rounded-lg border border-border bg-muted pl-9 pr-9 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                        autoFocus
                      />
                      {contractSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setContractSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted-foreground/10 rounded"
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredContractOptions.length > 0 ? (
                      filteredContractOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSelectedContractId(option.value);
                            setIsContractDropdownOpen(false);
                            setContractSearchQuery("");
                          }}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-muted/40 transition ${
                            selectedContractId === option.value ? "bg-primary/5 text-primary" : "text-foreground"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                        No contracts found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contract Header */}
      <div className="rounded-3xl border border-border bg-card px-8 py-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted">
            <Building2 className="h-7 w-7 text-sky-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-foreground">
              {contract.organization_marketing_name || contract.contract_name || contract.contract_id}
            </h2>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div>
                <span className="text-muted-foreground">Contract ID:</span> {contract.contract_id}
              </div>
              {contract.parent_organization && (
                <div>
                  <span className="text-muted-foreground">Parent Org:</span> {contract.parent_organization}
                </div>
              )}
              {contract.organization_type && (
                <div>
                  <span className="text-muted-foreground">Type:</span> {contract.organization_type}
                </div>
              )}
              {contract.snp_indicator && (
                <div>
                  <span className="text-muted-foreground">SNP:</span> {contract.snp_indicator}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ratings Overview */}
      <div className="rounded-3xl border border-border bg-card">
        <div className="border-b border-border px-8 py-5">
          <h3 className="text-lg font-semibold text-foreground">Contract Ratings Overview</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Latest CMS summary ratings with measure distribution context
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Overall ratings exclude the Reward Factor, as CMS has discontinued this component of the Stars program.
          </p>
        </div>
        <div className="px-8 py-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {ratingCards.map((card) => {
              const cmsDisplay = formatCmsValue(card.cmsNumeric, card.cmsText);
              const computedDisplay = formatComputedValue(card.computed);

              const primaryRow = cmsDisplay
                ? { label: 'CMS reported', value: cmsDisplay, source: 'cms' as const }
                : computedDisplay
                ? { label: 'Calculated score', value: computedDisplay, source: 'computed' as const }
                : { label: 'CMS reported', value: 'N/A', source: 'na' as const };

              const secondaryRows: Array<{ label: string; value: string }> = [];

              if (primaryRow.source === 'cms' && computedDisplay && !valuesAreEqual(primaryRow.value, computedDisplay)) {
                secondaryRows.push({ label: 'Calculated score', value: computedDisplay });
              } else if (primaryRow.source !== 'computed' && computedDisplay && !valuesAreEqual(primaryRow.value, computedDisplay)) {
                secondaryRows.push({ label: 'Calculated score', value: computedDisplay });
              }


              return (
                <div key={card.key} className="rounded-2xl border border-border bg-muted p-6">
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <Star className="h-7 w-7 text-yellow-400" />
                    <div>
                      <p className="text-3xl font-bold text-foreground">{primaryRow.value}</p>
                      {primaryRow.label && primaryRow.source !== 'cms' ? (
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{primaryRow.label}</p>
                      ) : null}
                    </div>
                  </div>
                  {secondaryRows.length > 0 ? (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {secondaryRows.map((row) => (
                        <p key={`${card.key}-${row.label}`}>
                          {row.label}: <span className="font-medium text-foreground">{row.value}</span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="rounded-2xl border border-border bg-muted p-6">
              <p className="text-xs text-muted-foreground">Quality Improvement Measures</p>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                <p>
                  Quality improvement measures are always included in the Part C and Part D summaries below. {data.qualityImprovement.thresholdMet
                    ? "For the overall rating, since the contract is >= 3.75, only measures that would lower the overall rating are excluded from it."
                    : "For the overall rating, since the contract is < 3.75, all quality improvement measures are included."}
                </p>
                {data.qualityImprovement.thresholdMet && data.qualityImprovement.excludedMeasures.length > 0 ? (
                  <div>
                    <p>Excluded measures:</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                      {data.qualityImprovement.excludedMeasures.map((code) => (
                        <li key={code}>{code}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
            {data.cai && data.cai.cai_value !== null ? (
              <div className="rounded-2xl border border-border bg-muted p-6">
                <p className="text-xs text-muted-foreground">CAI Adjustment</p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-foreground">
                      {data.cai.cai_value > 0 ? '+' : ''}{data.cai.cai_value.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Before CAI: {data.cai.overallBeforeCAI?.toFixed(2) ?? 'N/A'}</p>
                    <p>After CAI: {data.cai.overallAfterCAI?.toFixed(2) ?? 'N/A'}</p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="rounded-2xl border border-border bg-muted p-4 md:col-span-2 xl:col-span-3">
              <div className="flex items-center justify-between gap-6">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-3">Star Distribution</p>
                  <div className="flex flex-wrap gap-4">
                    {[5, 4, 3, 2, 1].map((stars) => (
                      <div key={stars} className="flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm">
                        <span className="text-muted-foreground text-base">{stars}★</span>
                        <span className="font-semibold text-foreground text-base">{overallStars.distribution[stars] || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {summaryRating && (summaryRating.disaster_percent_2021 || summaryRating.disaster_percent_2022 || summaryRating.disaster_percent_2023) ? (
                  <div className="border-l border-border pl-6">
                    <p className="text-xs text-muted-foreground mb-3">Disaster Impact</p>
                    <div className="flex flex-wrap gap-3">
                      {[{ year: 2021, value: summaryRating.disaster_percent_2021 }, { year: 2022, value: summaryRating.disaster_percent_2022 }, { year: 2023, value: summaryRating.disaster_percent_2023 }]
                        .filter(({ value }) => value !== null && value !== undefined)
                        .map(({ year, value }) => (
                          <div key={year} className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
                            <span className="text-muted-foreground">{year}:</span>
                            <span className="font-medium text-foreground">{value}%</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Domain Stars */}
      {domainStars && domainStars.length > 0 && (
        <div className="rounded-3xl border border-border bg-card">
          <div className="border-b border-border px-8 py-5">
            <h3 className="text-lg font-semibold text-foreground">Stars by Domain</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Weighted average star ratings across measure domains
            </p>
          </div>
          <div className="px-8 py-6">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {domainStars.map((domain) => (
                <div key={domain.domain} className="rounded-2xl border border-border bg-muted p-4">
                  <p className="text-xs text-muted-foreground mb-3">{domain.domain}</p>
                  <div className="flex items-center gap-3">
                    <Star className="h-6 w-6 text-yellow-400" />
                    <p className="text-2xl font-bold text-foreground">
                      {domain.averageStars.toFixed(2)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {domain.measureCount} measure{domain.measureCount !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Performance Details */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Highest Performing */}
        <div className="rounded-3xl border border-border bg-card">
          <div className="border-b border-border px-8 py-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-400" />
              <h3 className="text-lg font-semibold text-foreground">Highest Performing Measures</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Top 5 measures by star rating</p>
          </div>
          <div className="px-8 py-6">
            <div className="space-y-3">
              {performance.highest.map((measure, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-muted p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {measure.metric_label || measure.metric_code}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{measure.metric_category}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {measure.star_rating && (
                        <div className="flex items-center gap-1 rounded-full bg-yellow-400/10 px-2 py-1">
                          <Star className="h-3 w-3 text-yellow-400" />
                          <span className="text-xs font-semibold text-yellow-400">
                            {measure.star_rating}
                          </span>
                        </div>
                      )}
                      {measure.rate_percent !== null && (
                        <span className="text-xs text-muted-foreground">
                          {measure.rate_percent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Lowest Performing */}
        <div className="rounded-3xl border border-border bg-card">
          <div className="border-b border-border px-8 py-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-400" />
              <h3 className="text-lg font-semibold text-foreground">Lowest Performing Measures</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Bottom 5 measures by star rating</p>
          </div>
          <div className="px-8 py-6">
            <div className="space-y-3">
              {performance.lowest.map((measure, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-muted p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {measure.metric_label || measure.metric_code}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{measure.metric_category}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {measure.star_rating && (
                        <div className="flex items-center gap-1 rounded-full bg-red-400/10 px-2 py-1">
                          <Star className="h-3 w-3 text-red-400" />
                          <span className="text-xs font-semibold text-red-400">
                            {measure.star_rating}
                          </span>
                        </div>
                      )}
                      {measure.rate_percent !== null && (
                        <span className="text-xs text-muted-foreground">
                          {measure.rate_percent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Disenrollment Reasons */}
      {disenrollment ? (
        <div className="rounded-3xl border border-border bg-card">
          <div className="border-b border-border px-8 py-5">
            <h3 className="text-lg font-semibold text-foreground">Disenrollment Reasons</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              CMS reported disenrollment categories for {disenrollment.year}
            </p>
          </div>
          <div className="px-8 py-6">
            {disenrollment.categories.length > 0 ? (
              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {disenrollment.categories.map((category) => {
                  const percentDisplay = formatPercentValue(category.percent);
                  return (
                    <div key={category.key} className="rounded-2xl border border-border bg-muted p-4 flex flex-col">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">{category.label}</p>
                      <span className="text-2xl font-bold text-foreground mt-auto">
                        {percentDisplay ?? category.note ?? 'N/A'}
                      </span>
                      {!percentDisplay && category.note ? (
                        <p className="mt-1 text-xs text-muted-foreground">{category.note}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground">
                CMS did not report disenrollment details for this contract in {disenrollment.year}.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Enrollment & Plan Landscape */}
      <div className="rounded-3xl border border-border bg-card">
        <div className="border-b border-border px-8 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Enrollment & Plan Landscape</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {enrollmentSnapshot 
                  ? `Latest enrollment as of ${formatMonthYear(enrollmentSnapshot.reportYear, enrollmentSnapshot.reportMonth)} with geographic coverage`
                  : 'Geographic coverage and plan details'}
              </p>
            </div>
            {enrollmentSnapshot && (
              <div className="flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
                <Users className="h-4 w-4 text-sky-400" />
                <span>Total Enrollment: {formatNumber(enrollmentSnapshot.totalEnrollment)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="px-8 py-6 space-y-6">
          {/* Combined Stats Grid */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {enrollmentSnapshot && (
              <>
                <div className="rounded-2xl border border-border bg-muted p-4">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-sky-400" />
                    <p className="text-xs text-muted-foreground">Total Enrollment</p>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-foreground">
                    {formatNumber(enrollmentSnapshot.totalEnrollment)}
                  </p>
                </div>
                {hasYoyEnrollmentData ? (
                  <div className="rounded-2xl border border-border bg-muted p-4">
                    <div className="flex items-center gap-2">
                      <ChangeIcon className={`h-4 w-4 ${changeAccentClass}`} />
                      <p className="text-xs text-muted-foreground">YoY Enrollment Change</p>
                    </div>
                    <p className={`mt-2 text-2xl font-bold ${changeAccentClass}`}>
                      {yoyChangeDisplay ?? 'N/A'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {previousPeriodLabel ? `vs ${previousPeriodLabel}` : 'Prior year'}
                      {yoyPercentDisplay ? (
                        <span className={`ml-2 font-semibold ${changeAccentClass}`}>
                          {yoyPercentDisplay}
                        </span>
                      ) : null}
                    </p>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-border bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Reported Plans</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">
                    {enrollmentSnapshot.reportedPlans.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {enrollmentSnapshot.suppressedPlans > 0 && `+${enrollmentSnapshot.suppressedPlans} suppressed`}
                  </p>
                </div>
              </>
            )}
            <div className="rounded-2xl border border-border bg-muted p-4">
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-muted-foreground">Total Plans</p>
                <div className="group relative">
                  <Info className="h-3 w-3 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-popover border border-border rounded-lg shadow-lg text-xs text-popover-foreground z-50">
                    <div className="text-center">Plan-county combinations. A single plan offered in multiple counties counts once per county.</div>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{planLandscape.totalPlans}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-sky-400" />
                <p className="text-xs text-muted-foreground">States</p>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{planLandscape.statesServed}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-sky-400" />
                <p className="text-xs text-muted-foreground">Counties</p>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{planLandscape.countiesServed}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">SNP Plans</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{planLandscape.snpPlans}</p>
              {enrollmentSnapshot?.snpEnrollment && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatNumber(enrollmentSnapshot.snpEnrollment)} members
                </p>
              )}
            </div>
          </div>

          {/* Premium Stats */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-muted p-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-400" />
                <p className="text-xs text-muted-foreground">Average Part C Premium</p>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                ${planLandscape.avgPartCPremium.toFixed(0)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted p-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-400" />
                <p className="text-xs text-muted-foreground">Average Part D Premium</p>
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                ${planLandscape.avgPartDPremium.toFixed(0)}
              </p>
            </div>
          </div>

          {/* Enrollment by Plan Type */}
          {enrollmentSnapshot && enrollmentSnapshot.planTypeSummary.length > 0 && (
            <div className="rounded-2xl border border-border bg-muted p-6">
              <p className="text-sm font-medium text-foreground mb-4">Enrollment by Plan Type</p>
              <div className="space-y-3">
                {enrollmentSnapshot.planTypeSummary.slice(0, 8).map((entry) => (
                  <div key={entry.planType} className="flex items-center justify-between gap-4">
                    <div className="text-sm text-foreground flex-1">{entry.planType}</div>
                    <div className="flex items-center gap-6 text-xs">
                      <span className="text-muted-foreground">{entry.plans.toLocaleString()} plans</span>
                      <span className="font-semibold text-foreground min-w-[100px] text-right">
                        {entry.enrollment.toLocaleString()} members
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Plans by Enrollment */}
          {enrollmentSnapshot && enrollmentSnapshot.topPlans.length > 0 && (
            <div className="rounded-2xl border border-border bg-muted p-6">
              <p className="text-sm font-medium text-foreground mb-4">Top Plans by Enrollment</p>
              <div className="space-y-2">
                {enrollmentSnapshot.topPlans.map((plan, index) => (
                  <div
                    key={`${plan.plan_id}-${index}`}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">Plan {plan.plan_id}</p>
                          {plan.is_snp && (
                            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                              SNP
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{plan.plan_type || "Type not specified"}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                      <div className="text-sm font-semibold text-foreground">
                        {plan.enrollment !== null ? `${plan.enrollment.toLocaleString()} members` : plan.is_suppressed ? "Suppressed" : "N/A"}
                      </div>
                      {(() => {
                        if (
                          plan.enrollment_change === null ||
                          plan.enrollment_percent_change === null
                        ) {
                          return null;
                        }

                        if (plan.enrollment_percent_change === 0) {
                          return (
                            <span className="text-muted-foreground">No change from prior year</span>
                          );
                        }

                        const direction = plan.enrollment_change > 0 ? 'up' : 'down';
                        const iconClass = direction === 'up' ? 'text-emerald-500' : 'text-red-500';
                        const Icon = direction === 'up' ? TrendingUp : TrendingDown;

                        const changeDisplay = formatSignedNumber(plan.enrollment_change);
                        const percentDisplay = formatSignedPercent(plan.enrollment_percent_change);

                        if (!changeDisplay && !percentDisplay) {
                          return null;
                        }

                        return (
                          <div className={`flex items-center gap-2 ${iconClass}`}>
                            <Icon className="h-3 w-3" />
                            <span className="font-semibold">
                              {changeDisplay ?? 'N/A'}
                              {percentDisplay ? ` (${percentDisplay})` : ''}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
