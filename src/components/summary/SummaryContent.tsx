"use client";

import { useEffect, useState } from "react";
import { Star, TrendingUp, TrendingDown, Building2, MapPin, DollarSign, Users, Info } from "lucide-react";

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
    }>;
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
        
        // Update selected values if they weren't set
        if (!selectedYear) setSelectedYear(result.year.toString());
        if (!selectedContractId) setSelectedContractId(result.contractId);
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

  type RatingCardConfig = {
    key: 'overall' | 'partC' | 'partD';
    label: string;
    numeric: number | null | undefined;
    text: string | null | undefined;
    fallback?: number;
  };

  const ratingCards: RatingCardConfig[] = [
    {
      key: 'overall',
      label: 'Overall Rating',
      numeric: summaryRating?.overall_rating_numeric,
      text: summaryRating?.overall_rating,
      fallback: overallStars.average,
    },
    {
      key: 'partC',
      label: 'Part C Summary',
      numeric: summaryRating?.part_c_summary_numeric,
      text: summaryRating?.part_c_summary,
    },
    {
      key: 'partD',
      label: 'Part D Summary',
      numeric: summaryRating?.part_d_summary_numeric,
      text: summaryRating?.part_d_summary,
    },
  ];

  const formatRatingValue = (numeric: number | null | undefined, text: string | null | undefined, fallback?: number) => {
    if (typeof numeric === 'number' && Number.isFinite(numeric)) {
      return numeric.toFixed(1);
    }
    if (text && text.trim().length > 0) {
      return text.trim();
    }
    if (typeof fallback === 'number' && Number.isFinite(fallback)) {
      return fallback.toFixed(2);
    }
    return 'N/A';
  };

  const formatRatingAnnotation = (
    numeric: number | null | undefined,
    text: string | null | undefined,
    fallback?: number
  ) => {
    if (typeof numeric === 'number' && text && text.trim().length > 0 && text.trim() !== numeric.toString()) {
      return `Source: ${text.trim()}`;
    }
    if ((numeric === null || numeric === undefined) && text && text.trim().length > 0) {
      return text.trim();
    }
    if ((numeric === null || numeric === undefined) && (!text || text.trim().length === 0) && typeof fallback === 'number') {
      return 'Fallback: average across contract measures';
    }
    return null;
  }

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
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Contract:</label>
            <select
              value={selectedContractId}
              onChange={(e) => setSelectedContractId(e.target.value)}
              className="rounded-full border border-border bg-muted px-4 py-2 text-sm text-foreground"
            >
              {filters.availableContracts.map((contract) => (
                <option key={contract.contract_id} value={contract.contract_id}>
                  {contract.contract_id} - {contract.organization_marketing_name || contract.contract_name}
                </option>
              ))}
            </select>
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
        </div>
        <div className="px-8 py-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {ratingCards.map((card) => {
              const displayValue = formatRatingValue(card.numeric, card.text, card.fallback);
              const annotation = formatRatingAnnotation(card.numeric, card.text, card.fallback);
              return (
                <div key={card.key} className="rounded-2xl border border-border bg-muted p-6">
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <Star className="h-7 w-7 text-yellow-400" />
                    <p className="text-3xl font-bold text-foreground">{displayValue}</p>
                  </div>
                  {annotation ? (
                    <p className="mt-2 text-xs text-muted-foreground">{annotation}</p>
                  ) : null}
                </div>
              );
            })}
            <div className="rounded-2xl border border-border bg-muted p-6">
              <p className="text-xs text-muted-foreground">Total Measures Tracked</p>
              <p className="mt-3 text-3xl font-bold text-foreground">{overallStars.totalMeasures}</p>
            </div>
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
                    <div className="text-xs text-foreground">
                      {plan.enrollment !== null ? `${plan.enrollment.toLocaleString()} members` : plan.is_suppressed ? "Suppressed" : "N/A"}
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
