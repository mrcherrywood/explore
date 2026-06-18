"use client";

import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import type { CsvData } from "@/lib/export/csv";
import type { CloverContractImpact } from "@/lib/clover-impact/analysis";

const ESTIMATED_BENCHMARK_PMPM = 1200;
const QUALITY_BONUS_RATE = 0.05;
const ESTIMATED_ANNUAL_QBP_PER_MEMBER = ESTIMATED_BENCHMARK_PMPM * 12 * QUALITY_BONUS_RATE;
const QBP_ELIGIBILITY_THRESHOLD = 4.0;

type RecalcRow = {
  contractId: string;
  organizationName: string;
  parentOrganization: string;
  enrollment: number | null;
  originalRating: number | null;
  recalcRaw: number | null;
  finalRating: number | null;
  gainsBonus: boolean;
  bidResubmissionEligible: boolean;
  estimatedAnnualGain: number;
};

function formatRating(value: number | null): string {
  return value === null ? "-" : value.toFixed(1);
}

function formatScore(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function formatEnrollment(value: number | null): string {
  return value === null ? "-" : value.toLocaleString();
}

function formatCurrency(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1_000_000_000) return `${sign}$${(absoluteValue / 1_000_000_000).toFixed(1)}B`;
  if (absoluteValue >= 1_000_000) return `${sign}$${(absoluteValue / 1_000_000).toFixed(1)}M`;
  if (absoluteValue >= 1_000) return `${sign}$${(absoluteValue / 1_000).toFixed(0)}K`;
  return `${sign}$${absoluteValue.toLocaleString()}`;
}

function buildRow(contract: CloverContractImpact): RecalcRow {
  const qbp = contract.qbp2027;
  const originalEligible = qbp.originalRating !== null && qbp.originalRating >= QBP_ELIGIBILITY_THRESHOLD;
  const finalEligible = qbp.finalRating !== null && qbp.finalRating >= QBP_ELIGIBILITY_THRESHOLD;
  const gainsBonus = qbp.ratingIncreased && !originalEligible && finalEligible;
  const enrollment = contract.totalEnrollment;
  const estimatedAnnualGain = gainsBonus ? (enrollment ?? 0) * ESTIMATED_ANNUAL_QBP_PER_MEMBER : 0;

  return {
    contractId: contract.contractId,
    organizationName: contract.organizationMarketingName || contract.contractName || "Unknown",
    parentOrganization: contract.parentOrganization ?? "Unknown",
    enrollment,
    originalRating: qbp.originalRating,
    recalcRaw: qbp.recalcRatingRaw,
    finalRating: qbp.finalRating,
    gainsBonus,
    bidResubmissionEligible: qbp.bidResubmissionEligible,
    estimatedAnnualGain,
  };
}

function SummaryCard({
  label,
  value,
  caption,
  accent,
}: {
  label: string;
  value: string;
  caption: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-card/40"}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? "text-emerald-400" : "text-foreground"}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

export function CloverQbpRecalcAnalysis({ contracts }: { contracts: CloverContractImpact[] }) {
  const [parentFilter, setParentFilter] = useState<string>("all");

  const improvedRows = useMemo(
    () =>
      contracts
        .filter((contract) => contract.qbp2027.ratingIncreased)
        .map(buildRow)
        .sort((a, b) => (b.enrollment ?? 0) - (a.enrollment ?? 0)),
    [contracts],
  );

  const parentOptions = useMemo(() => {
    const parents = new Set(improvedRows.map((row) => row.parentOrganization));
    return Array.from(parents).sort((a, b) => a.localeCompare(b));
  }, [improvedRows]);

  const filteredRows = useMemo(
    () => (parentFilter === "all" ? improvedRows : improvedRows.filter((row) => row.parentOrganization === parentFilter)),
    [improvedRows, parentFilter],
  );

  const summary = useMemo(() => {
    const improvedEnrollment = improvedRows.reduce((sum, row) => sum + (row.enrollment ?? 0), 0);
    const bonusRows = improvedRows.filter((row) => row.gainsBonus);
    const bonusEnrollment = bonusRows.reduce((sum, row) => sum + (row.enrollment ?? 0), 0);
    const bonusDollars = bonusRows.reduce((sum, row) => sum + row.estimatedAnnualGain, 0);
    const bidRows = improvedRows.filter((row) => row.bidResubmissionEligible);
    return {
      improvedContracts: improvedRows.length,
      improvedEnrollment,
      bonusContracts: bonusRows.length,
      bonusEnrollment,
      bonusDollars,
      bidContracts: bidRows.length,
    };
  }, [improvedRows]);

  const getCsvData = (): CsvData => ({
    headers: [
      "Contract",
      "Organization",
      "Parent",
      "Enrollment",
      "Original Stars 2026",
      "Recalc Score",
      "Final Stars 2026 (HH)",
      "Gains QBP Bonus",
      "Bid Resubmission Eligible",
      "Est. Annual QBP Gain",
    ],
    rows: filteredRows.map((row) => [
      row.contractId,
      row.organizationName,
      row.parentOrganization,
      row.enrollment === null ? "" : String(row.enrollment),
      formatRating(row.originalRating),
      formatScore(row.recalcRaw),
      formatRating(row.finalRating),
      row.gainsBonus ? "Yes" : "No",
      row.bidResubmissionEligible ? "Yes" : "No",
      String(Math.round(row.estimatedAnnualGain)),
    ]),
  });

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <Scale className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Official Stars 2026 Recalculation Impact</h3>
            <p className="mt-1 max-w-3xl text-pretty text-xs text-muted-foreground">
              CMS&apos;s June 17, 2026 voluntary recalculation is hold-harmless: a contract&apos;s final Stars 2026 rating (which
              drives the 2027 QBP) is the higher of its original rating and the recalculated rating, so no contract is
              downgraded. Only rating increases are shown. Dollar estimates are a ballpark for contracts newly reaching the{" "}
              {QBP_ELIGIBILITY_THRESHOLD.toFixed(1)}-star QBP bonus: enrollment x ${ESTIMATED_BENCHMARK_PMPM.toLocaleString()}{" "}
              PMPM x 12 x {(QUALITY_BONUS_RATE * 100).toFixed(0)}%.
            </p>
          </div>
        </div>
        <ExportCsvButton
          fileName="clover-2027-qbp-recalc"
          getData={getCsvData}
          disabled={filteredRows.length === 0}
          className="shrink-0"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Contracts Improved"
          value={summary.improvedContracts.toLocaleString()}
          caption={`${formatEnrollment(summary.improvedEnrollment)} members`}
        />
        <SummaryCard
          label="Newly QBP-Eligible"
          value={summary.bonusContracts.toLocaleString()}
          caption={`reach ${QBP_ELIGIBILITY_THRESHOLD.toFixed(1)}+ stars`}
          accent
        />
        <SummaryCard
          label="Est. Annual QBP Gain"
          value={formatCurrency(summary.bonusDollars)}
          caption={`${formatEnrollment(summary.bonusEnrollment)} newly-eligible members`}
          accent
        />
        <SummaryCard
          label="Bid Resubmission Eligible"
          value={summary.bidContracts.toLocaleString()}
          caption="benchmark/rebate tier change"
        />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Parent organization</span>
          <select
            value={parentFilter}
            onChange={(event) => setParentFilter(event.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All parent organizations</option>
            {parentOptions.map((parent) => (
              <option key={parent} value={parent}>
                {parent}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium tabular-nums text-foreground">{filteredRows.length}</span> contracts with a Stars 2026
          increase
        </p>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left">Contract</th>
              <th className="px-3 py-2 text-left">Parent</th>
              <th className="px-3 py-2 text-right">Enrollment</th>
              <th className="px-3 py-2 text-right">Original 2026</th>
              <th className="px-3 py-2 text-right">Recalc Score</th>
              <th className="px-3 py-2 text-right">Final 2026 (HH)</th>
              <th className="px-3 py-2 text-right">Est. Annual Gain</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => (
                <tr key={row.contractId} className="border-b border-border/50">
                  <td className="px-3 py-2 font-mono text-xs text-primary">{row.contractId}</td>
                  <td className="px-3 py-2">
                    <p className="max-w-[240px] truncate text-foreground">{row.organizationName}</p>
                    <p className="max-w-[240px] truncate text-xs text-muted-foreground">{row.parentOrganization}</p>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatEnrollment(row.enrollment)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatRating(row.originalRating)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatScore(row.recalcRaw)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-emerald-500">
                    {formatRating(row.finalRating)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-emerald-500">
                    {row.estimatedAnnualGain > 0 ? formatCurrency(row.estimatedAnnualGain) : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.gainsBonus ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          Gains QBP
                        </span>
                      ) : (
                        <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300">
                          Higher rating
                        </span>
                      )}
                      {row.bidResubmissionEligible ? (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                          Bid eligible
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No contracts improve their Stars 2026 rating under the official recalculation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
