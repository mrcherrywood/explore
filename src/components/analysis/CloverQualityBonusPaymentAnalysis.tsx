"use client";

import { useMemo, useState } from "react";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import type { CsvData } from "@/lib/export/csv";
import type { CloverContractImpact } from "@/lib/clover-impact/analysis";

type ScenarioId = "model1" | "model2";
type ImpactStatus = "gain" | "loss" | "retained" | "notEligible";

type ImpactRow = {
  contractId: string;
  parentOrganization: string;
  organizationName: string;
  enrollment: number | null;
  officialRating: number | null;
  scenarioScore: number | null;
  scenarioRounded: number | null;
  status: ImpactStatus;
  estimatedAnnualPaymentChange: number;
};

type ScenarioImpact = {
  id: ScenarioId;
  label: string;
  rows: ImpactRow[];
  changedRows: ImpactRow[];
  officialEligibleContracts: number;
  scenarioEligibleContracts: number;
  officialEligibleEnrollment: number;
  scenarioEligibleEnrollment: number;
  gainedContracts: number;
  lostContracts: number;
  gainedEnrollment: number;
  lostEnrollment: number;
  gainedEstimatedPayment: number;
  lostEstimatedPayment: number;
  netEstimatedPayment: number;
};

const ESTIMATED_BENCHMARK_PMPM = 1200;
const QUALITY_BONUS_RATE = 0.05;
const ESTIMATED_ANNUAL_QBP_PER_MEMBER = ESTIMATED_BENCHMARK_PMPM * 12 * QUALITY_BONUS_RATE;

const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: "model1", label: "Model 1" },
  { id: "model2", label: "Model 2" },
];

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function isBonusEligible(value: number | null): boolean {
  return value !== null && value >= 4;
}

function formatScore(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function formatRoundedStar(value: number | null): string {
  return value === null ? "-" : value.toFixed(1);
}

function formatEnrollment(value: number | null): string {
  return value === null ? "-" : value.toLocaleString();
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString()}`;
}

function formatCurrency(value: number): string {
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1_000_000_000) {
    return `${sign}$${(absoluteValue / 1_000_000_000).toFixed(1)}B`;
  }
  if (absoluteValue >= 1_000_000) {
    return `${sign}$${(absoluteValue / 1_000_000).toFixed(1)}M`;
  }
  if (absoluteValue >= 1_000) {
    return `${sign}$${(absoluteValue / 1_000).toFixed(0)}K`;
  }
  return `${sign}$${absoluteValue.toLocaleString()}`;
}

function getStatusLabel(status: ImpactStatus): string {
  if (status === "gain") return "Gains QBP";
  if (status === "loss") return "Loses QBP";
  if (status === "retained") return "Retains QBP";
  return "Not eligible";
}

function getStatusClass(status: ImpactStatus): string {
  if (status === "gain") return "bg-emerald-500/10 text-emerald-400";
  if (status === "loss") return "bg-rose-500/10 text-rose-400";
  if (status === "retained") return "bg-sky-500/10 text-sky-300";
  return "bg-muted text-muted-foreground";
}

function sumEnrollment(rows: ImpactRow[]): number {
  return rows.reduce((sum, row) => sum + (row.enrollment ?? 0), 0);
}

function sumEstimatedPayments(rows: ImpactRow[]): number {
  return rows.reduce((sum, row) => sum + row.estimatedAnnualPaymentChange, 0);
}

function buildScenarioImpact(contracts: CloverContractImpact[], scenario: { id: ScenarioId; label: string }): ScenarioImpact {
  const rows = contracts.map((contract) => {
    const officialRating = contract.officialScores.stars2026;
    const scenarioScore = contract.scores[scenario.id];
    const scenarioRounded = scenarioScore === null ? null : roundToHalf(scenarioScore);
    const officialEligible = isBonusEligible(officialRating);
    const scenarioEligible = isBonusEligible(scenarioRounded);
    const status: ImpactStatus = !officialEligible && scenarioEligible
      ? "gain"
      : officialEligible && !scenarioEligible
        ? "loss"
        : officialEligible && scenarioEligible
          ? "retained"
          : "notEligible";
    const enrollment = contract.totalEnrollment;
    const estimatedAnnualPaymentChange =
      status === "gain" ? (enrollment ?? 0) * ESTIMATED_ANNUAL_QBP_PER_MEMBER :
      status === "loss" ? -(enrollment ?? 0) * ESTIMATED_ANNUAL_QBP_PER_MEMBER :
      0;

    return {
      contractId: contract.contractId,
      parentOrganization: contract.parentOrganization ?? "Unknown",
      organizationName: contract.organizationMarketingName || contract.contractName || "Unknown",
      enrollment,
      officialRating,
      scenarioScore,
      scenarioRounded,
      status,
      estimatedAnnualPaymentChange,
    };
  });

  const officialEligibleRows = rows.filter((row) => isBonusEligible(row.officialRating));
  const scenarioEligibleRows = rows.filter((row) => isBonusEligible(row.scenarioRounded));
  const gainedRows = rows.filter((row) => row.status === "gain");
  const lostRows = rows.filter((row) => row.status === "loss");
  const changedRows = [...gainedRows, ...lostRows].sort((a, b) => (b.enrollment ?? 0) - (a.enrollment ?? 0));

  return {
    id: scenario.id,
    label: scenario.label,
    rows,
    changedRows,
    officialEligibleContracts: officialEligibleRows.length,
    scenarioEligibleContracts: scenarioEligibleRows.length,
    officialEligibleEnrollment: sumEnrollment(officialEligibleRows),
    scenarioEligibleEnrollment: sumEnrollment(scenarioEligibleRows),
    gainedContracts: gainedRows.length,
    lostContracts: lostRows.length,
    gainedEnrollment: sumEnrollment(gainedRows),
    lostEnrollment: sumEnrollment(lostRows),
    gainedEstimatedPayment: sumEstimatedPayments(gainedRows),
    lostEstimatedPayment: Math.abs(sumEstimatedPayments(lostRows)),
    netEstimatedPayment: sumEstimatedPayments(changedRows),
  };
}

function ImpactCard({ impact }: { impact: ScenarioImpact }) {
  const netContracts = impact.scenarioEligibleContracts - impact.officialEligibleContracts;
  const netEnrollment = impact.scenarioEligibleEnrollment - impact.officialEligibleEnrollment;
  const netIsPositive = impact.netEstimatedPayment >= 0;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{impact.label}</h4>
          <p className="mt-1 text-pretty text-xs text-muted-foreground">Scenario rounded stars vs official 2026 rounded stars.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${netContracts >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
          {formatSigned(netContracts)} contracts
        </span>
      </div>

      <div className={`mt-5 rounded-xl border p-4 ${netIsPositive ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}>
        <p className="text-xs font-medium text-muted-foreground">Estimated Annual QBP Swing</p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${netIsPositive ? "text-emerald-400" : "text-rose-400"}`}>
          {formatCurrency(impact.netEstimatedPayment)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Net eligible enrollment: <span className="font-medium tabular-nums text-foreground">{formatSigned(netEnrollment)}</span>
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <p className="text-xs text-muted-foreground">Eligible Contracts</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{impact.scenarioEligibleContracts.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">from {impact.officialEligibleContracts.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <p className="text-xs text-muted-foreground">Eligible Enrollment</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatSigned(netEnrollment)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <p className="text-xs text-muted-foreground">Per Member Assumption</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(ESTIMATED_ANNUAL_QBP_PER_MEMBER)}</p>
          <p className="text-xs text-muted-foreground">annual QBP proxy</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-emerald-400">Gaining QBP</p>
            <p className="text-sm font-semibold tabular-nums text-emerald-400">{formatCurrency(impact.gainedEstimatedPayment)}</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{impact.gainedContracts.toLocaleString()}</span> contracts
            <span className="mx-1">/</span>
            <span className="font-medium tabular-nums text-foreground">{formatEnrollment(impact.gainedEnrollment)}</span> members
          </p>
        </div>
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-rose-400">Losing QBP</p>
            <p className="text-sm font-semibold tabular-nums text-rose-400">{formatCurrency(-impact.lostEstimatedPayment)}</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{impact.lostContracts.toLocaleString()}</span> contracts
            <span className="mx-1">/</span>
            <span className="font-medium tabular-nums text-foreground">{formatEnrollment(impact.lostEnrollment)}</span> members
          </p>
        </div>
      </div>
    </div>
  );
}

export function CloverQualityBonusPaymentAnalysis({ contracts }: { contracts: CloverContractImpact[] }) {
  const impacts = useMemo(() => SCENARIOS.map((scenario) => buildScenarioImpact(contracts, scenario)), [contracts]);
  const allChangedRows = useMemo(
    () => impacts.flatMap((impact) => impact.changedRows.map((row) => ({ ...row, scenarioLabel: impact.label }))),
    [impacts],
  );

  const [parentFilter, setParentFilter] = useState<string>("all");

  const parentOptions = useMemo(() => {
    const parents = new Set(allChangedRows.map((row) => row.parentOrganization));
    return Array.from(parents).sort((a, b) => a.localeCompare(b));
  }, [allChangedRows]);

  const filteredChangedRows = useMemo(
    () => (parentFilter === "all" ? allChangedRows : allChangedRows.filter((row) => row.parentOrganization === parentFilter)),
    [allChangedRows, parentFilter],
  );

  const changedRows = useMemo(() => filteredChangedRows.slice(0, 25), [filteredChangedRows]);

  const getCsvData = (): CsvData => ({
    headers: [
      "Scenario",
      "Contract",
      "Organization",
      "Parent",
      "Enrollment",
      "Official 2026",
      "Scenario Score",
      "Rounded",
      "Est. Annual Swing",
      "QBP Status",
    ],
    rows: filteredChangedRows.map((row) => [
      row.scenarioLabel,
      row.contractId,
      row.organizationName,
      row.parentOrganization,
      row.enrollment === null ? "" : String(row.enrollment),
      formatRoundedStar(row.officialRating),
      formatScore(row.scenarioScore),
      formatRoundedStar(row.scenarioRounded),
      String(Math.round(row.estimatedAnnualPaymentChange)),
      getStatusLabel(row.status),
    ]),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Quality Bonus Payment Eligibility</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Uses the CMS 4.0+ overall Star threshold as a QBP eligibility proxy. Dollar impact is a ballpark annual estimate:
            enrollment x ${ESTIMATED_BENCHMARK_PMPM.toLocaleString()} benchmark PMPM x {(QUALITY_BONUS_RATE * 100).toFixed(0)}% QBP.
            It does not adjust for county benchmarks, bids, rebates, or double-bonus counties.
          </p>
        </div>
        <ExportCsvButton
          fileName="clover-qbp-eligibility-changes"
          getData={getCsvData}
          disabled={filteredChangedRows.length === 0}
          className="shrink-0"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {impacts.map((impact) => (
          <ImpactCard key={impact.id} impact={impact} />
        ))}
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
          Showing <span className="font-medium tabular-nums text-foreground">{changedRows.length}</span> of{" "}
          <span className="font-medium tabular-nums text-foreground">{filteredChangedRows.length}</span> changed contracts
        </p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left">Scenario</th>
              <th className="px-3 py-2 text-left">Contract</th>
              <th className="px-3 py-2 text-left">Parent</th>
              <th className="px-3 py-2 text-right">Enrollment</th>
              <th className="px-3 py-2 text-right">Official 2026</th>
              <th className="px-3 py-2 text-right">Scenario Score</th>
              <th className="px-3 py-2 text-right">Rounded</th>
              <th className="px-3 py-2 text-right">Est. Annual Swing</th>
              <th className="px-3 py-2 text-left">QBP Status</th>
            </tr>
          </thead>
          <tbody>
            {changedRows.length > 0 ? (
              changedRows.map((row) => (
                <tr key={`${row.scenarioLabel}-${row.contractId}`} className="border-b border-border/50">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.scenarioLabel}</td>
                  <td className="px-3 py-2 font-mono text-xs text-primary">{row.contractId}</td>
                  <td className="px-3 py-2">
                    <p className="max-w-[260px] truncate text-foreground">{row.organizationName}</p>
                    <p className="max-w-[260px] truncate text-xs text-muted-foreground">{row.parentOrganization}</p>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatEnrollment(row.enrollment)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatRoundedStar(row.officialRating)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatScore(row.scenarioScore)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{formatRoundedStar(row.scenarioRounded)}</td>
                  <td className={`px-3 py-2 text-right font-mono text-xs ${row.estimatedAnnualPaymentChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatCurrency(row.estimatedAnnualPaymentChange)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusClass(row.status)}`}>
                      {getStatusLabel(row.status)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No contracts change QBP eligibility under Model 1 or Model 2.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
