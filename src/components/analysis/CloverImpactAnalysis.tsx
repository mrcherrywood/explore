"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, Scale } from "lucide-react";
import { CloverImpactTable } from "./CloverImpactTable";
import { CloverParentOrgChart, type CloverParentWeightMode } from "./CloverParentOrgChart";
import { CloverParentOrgTable } from "./CloverParentOrgTable";
import { CloverScenarioMeasureScores } from "./CloverScenarioMeasureScores";
import { CloverScenarioChart } from "./CloverScenarioChart";
import type { CloverContractImpact, CloverImpactResult } from "@/lib/clover-impact/analysis";

type PopulationView = "contracts" | "parents";
type ChartView = "contract" | "parent";
type ActiveChartSummary = {
  official2026: number | null;
  model1: number | null;
  model2: number | null;
  model1Change: number | null;
  model2Change: number | null;
  comparisonLabel: string;
};

function formatScore(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : value.toFixed(2);
}

function uniqueSorted(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function weightedAverage(items: Array<{ value: number | null; weight: number | null }>): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    if (item.value === null || item.weight === null || item.weight <= 0) continue;
    weightedSum += item.value * item.weight;
    totalWeight += item.weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function getCalculated2026BaselineScore(contract: CloverContractImpact): number | null {
  const withQI = contract.scores.s26WithQI;
  const withoutQI = contract.scores.s26NoQI;

  if (withoutQI !== null && withoutQI >= 4 && withQI !== null && withQI < withoutQI) {
    return withoutQI;
  }

  return withQI ?? withoutQI;
}

function getCalculated2026BaselineLabel(contract: CloverContractImpact): string {
  const withQI = contract.scores.s26WithQI;
  const withoutQI = contract.scores.s26NoQI;

  if (withoutQI !== null && withoutQI >= 4 && withQI !== null && withQI < withoutQI) {
    return "vs calculated 2026 No QI (hold harmless)";
  }

  return "vs calculated 2026 With QI";
}

function formatChange(value: number | null): string {
  if (value === null) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function choosePreferredContract(contracts: CloverContractImpact[]): CloverContractImpact | null {
  return contracts.find((contract) => contract.contractId === "H8947") ?? contracts[0] ?? null;
}

export function CloverImpactAnalysis() {
  const [data, setData] = useState<CloverImpactResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedParent, setSelectedParent] = useState("");
  const [selectedMarketing, setSelectedMarketing] = useState("");
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [populationView, setPopulationView] = useState<PopulationView>("contracts");
  const [chartView, setChartView] = useState<ChartView>("contract");
  const [parentWeightMode, setParentWeightMode] = useState<CloverParentWeightMode>("equal");
  const [showScenarioDefinitions, setShowScenarioDefinitions] = useState(false);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/analysis/clover-impact");
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Failed to fetch Clover scenario analysis");
        }

        const result: CloverImpactResult = await response.json();
        const preferred = choosePreferredContract(result.contracts);
        setData(result);
        setSelectedContractId(preferred?.contractId ?? null);
        setSelectedParent(preferred?.parentOrganization ?? "");
        setSelectedMarketing(preferred?.organizationMarketingName ?? "");
      } catch (err) {
        console.error("Failed to load Clover impact analysis:", err);
        setError(err instanceof Error ? err.message : "Failed to load Clover impact analysis");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const selectedContract = useMemo(() => {
    if (!data || !selectedContractId) return null;
    return data.contracts.find((contract) => contract.contractId === selectedContractId) ?? null;
  }, [data, selectedContractId]);

  const parentOptions = useMemo(() => uniqueSorted(data?.contracts.map((contract) => contract.parentOrganization) ?? []), [data]);

  const marketingOptions = useMemo(() => {
    if (!data || !selectedParent) return [];
    return uniqueSorted(
      data.contracts
        .filter((contract) => contract.parentOrganization === selectedParent)
        .map((contract) => contract.organizationMarketingName),
    );
  }, [data, selectedParent]);

  const contractOptions = useMemo(() => {
    if (!data) return [];
    return data.contracts
      .filter((contract) => !selectedParent || contract.parentOrganization === selectedParent)
      .filter((contract) => !selectedMarketing || contract.organizationMarketingName === selectedMarketing)
      .sort((a, b) => a.contractId.localeCompare(b.contractId));
  }, [data, selectedMarketing, selectedParent]);

  const selectedParentContracts = useMemo(() => {
    if (!data || !selectedParent) return [];
    return data.contracts.filter((contract) => (contract.parentOrganization?.trim() || "Unknown") === selectedParent);
  }, [data, selectedParent]);

  const canShowParentChart = selectedParentContracts.length > 1;
  const effectiveChartView: ChartView = canShowParentChart ? chartView : "contract";
  const activeChartSummary: ActiveChartSummary = useMemo(() => {
    if (effectiveChartView === "parent") {
      const official2026 = parentWeightMode === "equal"
        ? average(selectedParentContracts.map((contract) => contract.officialScores.stars2026))
        : weightedAverage(selectedParentContracts.map((contract) => ({
            value: contract.officialScores.stars2026,
            weight: contract.totalEnrollment,
          })));
      const baseline2026 = parentWeightMode === "equal"
        ? average(selectedParentContracts.map(getCalculated2026BaselineScore))
        : weightedAverage(selectedParentContracts.map((contract) => ({
            value: getCalculated2026BaselineScore(contract),
            weight: contract.totalEnrollment,
          })));
      const model1 = parentWeightMode === "equal"
        ? average(selectedParentContracts.map((contract) => contract.scores.model1))
        : weightedAverage(selectedParentContracts.map((contract) => ({
            value: contract.scores.model1,
            weight: contract.totalEnrollment,
          })));
      const model2 = parentWeightMode === "equal"
        ? average(selectedParentContracts.map((contract) => contract.scores.model2))
        : weightedAverage(selectedParentContracts.map((contract) => ({
            value: contract.scores.model2,
            weight: contract.totalEnrollment,
          })));

      return {
        official2026,
        model1,
        model2,
        model1Change: model1 !== null && baseline2026 !== null ? model1 - baseline2026 : null,
        model2Change: model2 !== null && baseline2026 !== null ? model2 - baseline2026 : null,
        comparisonLabel: `vs ${parentWeightMode === "equal" ? "equal-weighted" : "enrollment-weighted"} calculated 2026 (QI hold harmless)`,
      };
    }

    if (!selectedContract) {
      return {
        official2026: null,
        model1: null,
        model2: null,
        model1Change: null,
        model2Change: null,
        comparisonLabel: "vs calculated 2026",
      };
    }

    const baseline2026 = getCalculated2026BaselineScore(selectedContract);

    return {
      official2026: selectedContract.officialScores.stars2026,
      model1: selectedContract.scores.model1,
      model2: selectedContract.scores.model2,
      model1Change: selectedContract.scores.model1 !== null && baseline2026 !== null
        ? selectedContract.scores.model1 - baseline2026
        : null,
      model2Change: selectedContract.scores.model2 !== null && baseline2026 !== null
        ? selectedContract.scores.model2 - baseline2026
        : null,
      comparisonLabel: getCalculated2026BaselineLabel(selectedContract),
    };
  }, [effectiveChartView, parentWeightMode, selectedContract, selectedParentContracts]);

  function selectContract(contract: CloverContractImpact | null) {
    setSelectedContractId(contract?.contractId ?? null);
    setSelectedParent(contract?.parentOrganization ?? "");
    setSelectedMarketing(contract?.organizationMarketingName ?? "");
  }

  function handleParentChange(parent: string) {
    if (!data) return;
    const nextContract = data.contracts
      .filter((contract) => contract.parentOrganization === parent)
      .sort((a, b) => a.contractId.localeCompare(b.contractId))[0] ?? null;
    setSelectedParent(parent);
    setSelectedMarketing(nextContract?.organizationMarketingName ?? "");
    setSelectedContractId(nextContract?.contractId ?? null);
    if (data.contracts.filter((contract) => (contract.parentOrganization?.trim() || "Unknown") === parent).length <= 1) {
      setChartView("contract");
    }
  }

  function handleParentTableSelect(parent: string) {
    handleParentChange(parent);
  }

  function handleMarketingChange(marketingName: string) {
    if (!data) return;
    const nextContract = data.contracts
      .filter((contract) => !selectedParent || contract.parentOrganization === selectedParent)
      .filter((contract) => contract.organizationMarketingName === marketingName)
      .sort((a, b) => a.contractId.localeCompare(b.contractId))[0] ?? null;
    setSelectedMarketing(marketingName);
    setSelectedContractId(nextContract?.contractId ?? null);
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Calculating Clover scenario impact...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!data || !selectedContract) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">No Clover scenario data available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-6">
        <div className="flex items-start gap-3">
          <Scale className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-sky-300">Clover Lawsuit Scenario Analysis</h2>
            <p className="text-sm text-muted-foreground">{data.rulingSummary}</p>
            <p className="text-xs text-muted-foreground">
              Stars 2025 and Stars 2026 bars use official CMS overall ratings. Scenario bars use the local weighted-mean
              and reward-factor engine.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[240px_240px_minmax(260px,1fr)]">
        <label className="space-y-2 text-xs font-medium text-muted-foreground">
          Parent Organization
          <select
            value={selectedParent}
            onChange={(event) => handleParentChange(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {parentOptions.map((parent) => (
              <option key={parent} value={parent}>{parent}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-xs font-medium text-muted-foreground">
          Marketing Name
          <select
            value={selectedMarketing}
            onChange={(event) => handleMarketingChange(event.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {marketingOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2 text-xs font-medium text-muted-foreground">
          Target Contract
          <select
            value={selectedContractId ?? ""}
            onChange={(event) => selectContract(data.contracts.find((contract) => contract.contractId === event.target.value) ?? null)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            {contractOptions.map((contract) => (
              <option key={contract.contractId} value={contract.contractId}>
                {contract.contractId} - {contract.organizationMarketingName || contract.contractName || "Unknown"}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <button
          type="button"
          onClick={() => setShowScenarioDefinitions((value) => !value)}
          className="flex w-full items-center justify-between gap-4 text-left"
          aria-expanded={showScenarioDefinitions}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Scenario Definitions</h3>
              <p className="text-xs text-muted-foreground">Measure groups used in the chart and table.</p>
            </div>
          </div>
          <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${showScenarioDefinitions ? "rotate-180" : ""}`} />
        </button>

        {showScenarioDefinitions ? (
          <div className="mt-4">
            <div className="space-y-3">
              {data.scenarioNotes.map((note) => (
                <p key={note.label} className="text-sm text-muted-foreground">
                  <span className="font-semibold text-sky-300">{note.label}:</span> {note.description}
                </p>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {data.computedScenarios.map((scenario) => (
                <div key={scenario.id} className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-foreground">{scenario.label}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {scenario.removedCodes.length} removed
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{scenario.description}</p>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">{scenario.removedCodes.join(", ")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Chart View</h3>
            <p className="text-xs text-muted-foreground">
              Choose whether the scenario chart shows the selected contract or the selected parent organization.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-1">
            <button
              type="button"
              onClick={() => setChartView("contract")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                effectiveChartView === "contract"
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Individual Contract
            </button>
            {canShowParentChart ? (
              <button
                type="button"
                onClick={() => setChartView("parent")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  effectiveChartView === "parent"
                    ? "border border-primary/40 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Parent Org ({selectedParentContracts.length} contracts)
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">2026 Official</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatScore(activeChartSummary.official2026)}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {effectiveChartView === "parent" ? selectedParent : selectedContract.contractId}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Model 1 Score</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatScore(activeChartSummary.model1)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatChange(activeChartSummary.model1Change)} {activeChartSummary.comparisonLabel}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Model 2 Score</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatScore(activeChartSummary.model2)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatChange(activeChartSummary.model2Change)} {activeChartSummary.comparisonLabel}
          </p>
        </div>
      </section>

      {effectiveChartView === "parent" && selectedParent ? (
        <CloverParentOrgChart
          parentOrganization={selectedParent}
          contracts={data.contracts}
          chartScores={data.chartScores}
          enrollmentSource={data.enrollmentSource}
          weightMode={parentWeightMode}
          onWeightModeChange={setParentWeightMode}
        />
      ) : (
        <CloverScenarioChart contract={selectedContract} chartScores={data.chartScores} />
      )}

      <CloverScenarioMeasureScores contract={selectedContract} scenarios={data.computedScenarios} />

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Population Views</h3>
            <p className="text-xs text-muted-foreground">Review Clover scenario impact by contract or parent organization.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-1">
            <button
              type="button"
              onClick={() => setPopulationView("contracts")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                populationView === "contracts"
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Contracts ({data.contracts.length})
            </button>
            <button
              type="button"
              onClick={() => setPopulationView("parents")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                populationView === "parents"
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Parent Orgs ({parentOptions.length})
            </button>
          </div>
        </div>
      </section>

      {populationView === "contracts" ? (
        <CloverImpactTable
          contracts={data.contracts}
          selectedContractId={selectedContractId}
          onSelectContract={(contractId) => {
            const contract = data.contracts.find((candidate) => candidate.contractId === contractId) ?? null;
            selectContract(contract);
          }}
        />
      ) : (
        <CloverParentOrgTable
          contracts={data.contracts}
          selectedParent={selectedParent}
          onSelectParent={handleParentTableSelect}
        />
      )}
    </div>
  );
}
