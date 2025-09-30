"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { YoYComparisonResults } from "./YoYComparisonResults";

type ContractRow = {
  contract_id: string;
  contract_name: string | null;
  organization_marketing_name: string | null;
};

type BuilderState = {
  contractId: string;
  years: number[];
};

export function YoYComparisonBuilder() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractSearch, setContractSearch] = useState("");
  const [selectedContractId, setSelectedContractId] = useState<string>("");

  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [yearsLoading, setYearsLoading] = useState(false);
  const [yearsError, setYearsError] = useState<string | null>(null);

  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());

  const [submittedSelection, setSubmittedSelection] = useState<BuilderState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [step, setStep] = useState(1);

  // Fetch contracts
  useEffect(() => {
    async function fetchContracts() {
      try {
        const response = await fetch("/api/yoy/contracts");
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to load contracts");
        }
        const payload: { contracts: ContractRow[] } = await response.json();
        const unique = Array.from(
          new Map((payload.contracts || []).map((c) => [c.contract_id, c])).values()
        );
        setContracts(unique);
      } catch (error) {
        console.error("Failed to load contracts", error);
        setContracts([]);
      }
    }

    fetchContracts();
  }, []);

  const filteredContracts = useMemo(() => {
    if (!contractSearch) return contracts;
    const query = contractSearch.toLowerCase();
    return contracts.filter((contract) => {
      return (
        contract.contract_id.toLowerCase().includes(query) ||
        contract.contract_name?.toLowerCase().includes(query) ||
        contract.organization_marketing_name?.toLowerCase().includes(query)
      );
    });
  }, [contracts, contractSearch]);

  // Fetch available years for selected contract
  useEffect(() => {
    if (!selectedContractId) {
      setAvailableYears([]);
      setSelectedYears(new Set());
      setYearsError(null);
      return;
    }

    async function fetchYears(contractId: string) {
      setYearsLoading(true);
      setYearsError(null);
      try {
        const response = await fetch("/api/yoy/years", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contractId }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to fetch years");
        }

        const data: { years: number[] } = await response.json();
        const sortedYears = [...(data.years || [])].sort((a, b) => a - b);
        setAvailableYears(sortedYears);

        // Auto-select all available years
        setSelectedYears(new Set(sortedYears));
      } catch (error) {
        console.error("Failed to fetch years", error);
        setYearsError(error instanceof Error ? error.message : "Failed to fetch years");
        setAvailableYears([]);
      } finally {
        setYearsLoading(false);
      }
    }

    fetchYears(selectedContractId);
  }, [selectedContractId]);

  const toggleYear = (year: number) => {
    const newSet = new Set(selectedYears);
    if (newSet.has(year)) {
      newSet.delete(year);
    } else {
      newSet.add(year);
    }
    setSelectedYears(newSet);
  };

  const canProceed = (stepNum: number) => {
    if (stepNum === 1) return Boolean(selectedContractId);
    if (stepNum === 2) return selectedYears.size >= 2;
    return false;
  };

  const canGenerate = Boolean(selectedContractId && selectedYears.size >= 2);

  const resetSelection = () => {
    setSelectedContractId("");
    setSelectedYears(new Set());
    setSubmittedSelection(null);
    setStep(1);
  };

  const submitSelection = async () => {
    if (!canGenerate || isSubmitting) return;
    
    setIsSubmitting(true);
    setSubmittedSelection({
      contractId: selectedContractId,
      years: Array.from(selectedYears).sort((a, b) => a - b),
    });
    setTimeout(() => setIsSubmitting(false), 150);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Build Year over Year Analysis</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Select a contract and years to compare performance trends over time
            </p>
          </div>
          {(selectedContractId || selectedYears.size > 0) && (
            <button
              onClick={resetSelection}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition hover:border-red-400/60 hover:text-red-200"
            >
              <X className="h-3 w-3" />
              Clear All
            </button>
          )}
        </div>

        <div className="mb-8 flex items-center gap-4">
          {[1, 2].map((stepNum) => (
            <div key={stepNum} className="flex flex-1 items-center gap-3">
              <button
                onClick={() => setStep(stepNum)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition ${
                  step === stepNum
                    ? "border-primary bg-primary/10 text-primary"
                    : stepNum < step || canProceed(stepNum)
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {stepNum}
              </button>
              <div className="flex-1">
                <p className={`text-xs font-medium ${step === stepNum ? "text-foreground" : "text-muted-foreground"}`}>
                  {stepNum === 1 && "Select Contract"}
                  {stepNum === 2 && "Choose Years"}
                </p>
                <p className="text-[0.65rem] text-muted-foreground">
                  {stepNum === 1 && (selectedContractId ? "1 selected" : "0 selected")}
                  {stepNum === 2 && `${selectedYears.size} selected`}
                </p>
              </div>
              {stepNum < 2 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          {step === 1 && (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Select Contract</h3>
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by contract ID or name..."
                  value={contractSearch}
                  onChange={(e) => setContractSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                {filteredContracts.map((contract) => {
                  const isSelected = selectedContractId === contract.contract_id;
                  return (
                    <button
                      key={contract.contract_id}
                      onClick={() => setSelectedContractId(contract.contract_id)}
                      className={`flex items-start justify-between rounded-lg px-4 py-3 text-left transition ${
                        isSelected ? "bg-primary/10 border border-primary/40" : "hover:bg-accent border border-transparent"
                      }`}
                    >
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {contract.contract_id}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {contract.organization_marketing_name || contract.contract_name || "No name"}
                        </p>
                      </div>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">
                Select Years to Compare (minimum 2)
              </h3>
              {yearsLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading available years...
                </div>
              )}
              {yearsError && <p className="text-xs text-red-400">{yearsError}</p>}
              {!yearsLoading && availableYears.length === 0 && !yearsError && (
                <p className="text-xs text-muted-foreground">No historical data available for this contract.</p>
              )}
              {!yearsLoading && availableYears.length > 0 && (
                <>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Found {availableYears.length} year{availableYears.length !== 1 ? "s" : ""} with data for this contract
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {availableYears.map((year) => {
                      const isSelected = selectedYears.has(year);
                      return (
                        <button
                          key={year}
                          onClick={() => toggleYear(year)}
                          className={`flex items-center justify-center rounded-lg px-4 py-3 text-sm font-medium transition ${
                            isSelected
                              ? "bg-primary/10 text-primary border border-primary/40"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent"
                          }`}
                        >
                          {year}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition hover:border-border/60 hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 2 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed(step)}
                className="flex items-center gap-2 rounded-2xl border border-primary/70 bg-primary/10 px-6 py-2 text-sm font-medium text-primary transition hover:border-primary/80 hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={submitSelection}
                disabled={!canGenerate || isSubmitting}
                className="rounded-2xl border border-primary/70 bg-primary/10 px-6 py-2 text-sm font-medium text-primary transition hover:border-primary/80 hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating...
                  </span>
                ) : (
                  "Generate Analysis"
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {submittedSelection && <YoYComparisonResults selection={submittedSelection} />}
    </div>
  );
}
