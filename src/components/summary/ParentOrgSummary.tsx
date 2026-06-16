"use client";

import { Building2, MapPin, Star, Users } from "lucide-react";

export type ParentOrgContract = {
  contract_id: string;
  contract_name: string | null;
  organization_marketing_name: string | null;
  organization_type: string | null;
  snp_indicator: string | null;
  overall: number | null;
  partC: number | null;
  partD: number | null;
  enrollment: number | null;
  statesServed: number;
  enrollmentPercent: number | null;
};

export type ParentOrgStateEnrollment = {
  state: string;
  enrollment: number;
  percent: number | null;
};

export type ParentOrgTotals = {
  contractCount: number;
  ratedContractCount: number;
  totalEnrollment: number | null;
  statesServed: number;
  avgOverall: number | null;
  enrollmentWeightedOverall: number | null;
};

export type ParentOrgData = {
  year: number;
  parentOrg: string;
  contracts: ParentOrgContract[];
  statesEnrollment: ParentOrgStateEnrollment[];
  totals: ParentOrgTotals | null;
  enrollmentPeriod: { year: number; month: number } | null;
};

type Props = {
  data: ParentOrgData;
  onSelectContract?: (contractId: string) => void;
};

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return value.toLocaleString();
}

function formatRating(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatMonthYear(year: number, month: number) {
  const date = new Date(Date.UTC(year, month - 1));
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

export function ParentOrgSummary({ data, onSelectContract }: Props) {
  const { parentOrg, contracts, statesEnrollment, totals, enrollmentPeriod } = data;

  if (!parentOrg) {
    return (
      <div className="rounded-3xl border border-border bg-card px-8 py-10 text-center text-muted-foreground">
        Select a parent organization to view its contracts.
      </div>
    );
  }

  const sortedContracts = [...contracts].sort((a, b) => {
    const aEnroll = a.enrollment ?? -1;
    const bEnroll = b.enrollment ?? -1;
    if (aEnroll !== bEnroll) return bEnroll - aEnroll;
    return a.contract_id.localeCompare(b.contract_id);
  });

  const maxStatePercent = statesEnrollment.reduce(
    (max, entry) => (entry.percent !== null && entry.percent > max ? entry.percent : max),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Parent Org Header */}
      <div className="rounded-3xl border border-border bg-card px-8 py-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted">
            <Building2 className="h-7 w-7 text-sky-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-foreground">{parentOrg}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {totals?.contractCount ?? contracts.length} contract
              {(totals?.contractCount ?? contracts.length) !== 1 ? "s" : ""} • {data.year} Star Year
              {enrollmentPeriod
                ? ` • Enrollment as of ${formatMonthYear(enrollmentPeriod.year, enrollmentPeriod.month)}`
                : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {totals && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sky-400" />
              <p className="text-xs text-muted-foreground">Contracts</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{totals.contractCount.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-sky-400" />
              <p className="text-xs text-muted-foreground">Total Enrollment</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{formatNumber(totals.totalEnrollment)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-sky-400" />
              <p className="text-xs text-muted-foreground">States</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{totals.statesServed.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" />
              <p className="text-xs text-muted-foreground">Avg Overall Rating</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{formatRating(totals.avgOverall)}</p>
            {totals.enrollmentWeightedOverall !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatRating(totals.enrollmentWeightedOverall)} enrollment-weighted
              </p>
            )}
          </div>
        </div>
      )}

      {/* Individual Contract Performance */}
      <div className="rounded-3xl border border-border bg-card">
        <div className="border-b border-border px-8 py-5">
          <h3 className="text-lg font-semibold text-foreground">Contract Performance</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            CMS summary ratings and enrollment for each contract under this parent organization
          </p>
        </div>
        <div className="px-4 py-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Contract</th>
                <th className="px-4 py-3 font-medium text-right">Overall</th>
                <th className="px-4 py-3 font-medium text-right">Part C</th>
                <th className="px-4 py-3 font-medium text-right">Part D</th>
                <th className="px-4 py-3 font-medium text-right">Enrollment</th>
                <th className="px-4 py-3 font-medium text-right">% of Org</th>
                <th className="px-4 py-3 font-medium text-right">States</th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.map((contract) => (
                <tr
                  key={contract.contract_id}
                  className={`border-t border-border ${onSelectContract ? "cursor-pointer hover:bg-muted/40" : ""}`}
                  onClick={onSelectContract ? () => onSelectContract(contract.contract_id) : undefined}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {contract.organization_marketing_name || contract.contract_name || contract.contract_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {contract.contract_id}
                      {contract.snp_indicator && contract.snp_indicator.toLowerCase().startsWith("yes")
                        ? " • SNP"
                        : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">{formatRating(contract.overall)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatRating(contract.partC)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatRating(contract.partD)}</td>
                  <td className="px-4 py-3 text-right text-foreground">{formatNumber(contract.enrollment)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatPercent(contract.enrollmentPercent)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{contract.statesServed.toLocaleString()}</td>
                </tr>
              ))}
              {sortedContracts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    No contracts found for this parent organization in {data.year}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enrollment by State */}
      <div className="rounded-3xl border border-border bg-card">
        <div className="border-b border-border px-8 py-5">
          <h3 className="text-lg font-semibold text-foreground">Population by State</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Share of total reported enrollment across all contracts, by state
            {enrollmentPeriod ? ` (${formatMonthYear(enrollmentPeriod.year, enrollmentPeriod.month)})` : ""}
          </p>
        </div>
        <div className="px-8 py-6">
          {statesEnrollment.length > 0 ? (
            <div className="space-y-3">
              {statesEnrollment.map((entry) => {
                const barWidth =
                  entry.percent !== null && maxStatePercent > 0
                    ? Math.max((entry.percent / maxStatePercent) * 100, 2)
                    : 0;
                return (
                  <div key={entry.state} className="flex items-center gap-4">
                    <div className="w-12 text-sm font-medium text-foreground">{entry.state}</div>
                    <div className="flex-1">
                      <div className="h-6 w-full rounded-full bg-muted">
                        <div
                          className="h-6 rounded-full bg-sky-400/70"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-20 text-right text-sm font-semibold text-foreground">
                      {formatPercent(entry.percent)}
                    </div>
                    <div className="w-28 text-right text-xs text-muted-foreground">
                      {formatNumber(entry.enrollment)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground">
              No geographic enrollment data is available for this parent organization.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
