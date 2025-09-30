"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { ENROLLMENT_LEVELS, EnrollmentLevelId } from "@/lib/peer/enrollment-levels";
import { PeerComparisonResults } from "./PeerComparisonResults";

type ContractRow = {
  contract_id: string;
  contract_name: string | null;
  organization_marketing_name: string | null;
  has_snp_plans: boolean;
};

type StateRow = {
  state: string;
  totalEnrollment: number | null;
  enrollmentLevel: EnrollmentLevelId;
  formattedEnrollment: string;
  availablePlanTypes: string[];
};

type ContractSummary = {
  total: number | null;
  formattedTotal: string;
  level: EnrollmentLevelId;
};

type BuilderState = {
  contractId: string;
  state: string;
  planTypeGroup: "SNP" | "NOT";
  enrollmentLevel: EnrollmentLevelId;
};

const PLAN_TYPE_OPTIONS: Array<{ id: "SNP" | "NOT"; label: string; description: string }> = [
  { id: "SNP", label: "Special Needs (SNP)", description: "Plans focused on special needs populations" },
  { id: "NOT", label: "Non-SNP Plans", description: "General population plans" },
];

export function PeerComparisonBuilder() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractSearch, setContractSearch] = useState("");
  const [selectedContractId, setSelectedContractId] = useState<string>("");

  const [states, setStates] = useState<StateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [contractSummary, setContractSummary] = useState<ContractSummary | null>(null);

  const [selectedState, setSelectedState] = useState<string>("");
  const [selectedPlanType, setSelectedPlanType] = useState<"SNP" | "NOT" | null>(null);
  const [selectedEnrollmentLevel, setSelectedEnrollmentLevel] = useState<EnrollmentLevelId | null>(null);

  const [submittedSelection, setSubmittedSelection] = useState<BuilderState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchContracts() {
      try {
        const response = await fetch("/api/peer/contracts");
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to load contracts");
        }
        const payload: { contracts: ContractRow[] } = await response.json();
        const unique = Array.from(new Map((payload.contracts || []).map((row) => [row.contract_id, row])).values());
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

  useEffect(() => {
    if (!selectedContractId) {
      setStates([]);
      setContractSummary(null);
      setStatesError(null);
      setSelectedState("");
      setSelectedPlanType(null);
      setSelectedEnrollmentLevel(null);
      return;
    }

    async function fetchStates(contractId: string) {
      setStatesLoading(true);
      setStatesError(null);
      try {
        const response = await fetch("/api/peer/states", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contractId }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to fetch states");
        }

        const data: {
          states: StateRow[];
          contractEnrollment?: ContractSummary;
        } = await response.json();

        setStates(data.states || []);
        setContractSummary(data.contractEnrollment ?? null);
        setSelectedState("");
        setSelectedPlanType(null);
        setSelectedEnrollmentLevel(null);
      } catch (error) {
        console.error("Peer states fetch failed", error);
        setStatesError(error instanceof Error ? error.message : "Failed to fetch states");
        setStates([]);
        setContractSummary(null);
      } finally {
        setStatesLoading(false);
      }
    }

    fetchStates(selectedContractId);
  }, [selectedContractId]);

  const availablePlanTypes = useMemo(() => {
    // Always show both plan type options to allow cross-comparison
    // (e.g., comparing an SNP contract against non-SNP peers)
    return PLAN_TYPE_OPTIONS;
  }, []);

  const canProceed = (step: number) => {
    if (step === 1) {
      return Boolean(selectedContractId);
    }
    if (step === 2) {
      return Boolean(selectedState);
    }
    if (step === 3) {
      return Boolean(selectedPlanType);
    }
    if (step === 4) {
      return Boolean(selectedEnrollmentLevel);
    }
    return false;
  };

  const canGenerate = Boolean(
    selectedContractId && selectedState && selectedPlanType && selectedEnrollmentLevel
  );

  const [step, setStep] = useState(1);

  const resetSelection = () => {
    setSelectedContractId("");
    setSelectedState("");
    setSelectedPlanType(null);
    setSelectedEnrollmentLevel(null);
    setSubmittedSelection(null);
    setStep(1);
  };

  const submitSelection = async () => {
    if (!canGenerate || isSubmitting || !selectedPlanType || !selectedEnrollmentLevel) {
      return;
    }
    setIsSubmitting(true);
    setSubmittedSelection({
      contractId: selectedContractId,
      state: selectedState,
      planTypeGroup: selectedPlanType,
      enrollmentLevel: selectedEnrollmentLevel,
    });
    setTimeout(() => setIsSubmitting(false), 150);
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Select Peer Group Criteria</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a contract, state, plan type grouping, and enrollment tier to compare against peers.
            </p>
          </div>
          {(selectedContractId || selectedState || selectedPlanType || selectedEnrollmentLevel) && (
            <button
              onClick={resetSelection}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition hover:border-red-400/60 hover:text-red-200"
            >
              <X className="h-3 w-3" />
              Clear All
            </button>
          )}
        </div>

        {contractSummary && (
          <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-muted p-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Contract Enrollment</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {contractSummary.formattedTotal}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enrollment Level</p>
              <p className="mt-2 text-lg font-medium text-foreground">{contractSummary.level}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">States Loaded</p>
              <p className="mt-2 text-lg font-medium text-foreground">{states.length}</p>
            </div>
          </div>
        )}

        <div className="mb-8 flex items-center gap-4">
          {[1, 2, 3, 4].map((stepNum) => (
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
                  {stepNum === 2 && "Choose State"}
                  {stepNum === 3 && "Plan Type Group"}
                  {stepNum === 4 && "Enrollment Level"}
                </p>
                <p className="text-[0.65rem] text-muted-foreground">
                  {stepNum === 1 && (selectedContractId ? "1 selected" : "0 selected")}
                  {stepNum === 2 && (selectedState || "None selected")}
                  {stepNum === 3 && (selectedPlanType || "None selected")}
                  {stepNum === 4 && (selectedEnrollmentLevel || "None selected")}
                </p>
              </div>
              {stepNum < 4 && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
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
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${
                            isSelected ? "text-primary" : "text-foreground"
                          }`}>
                            {contract.contract_id}
                          </p>
                          {contract.has_snp_plans && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                              SNP
                            </span>
                          )}
                        </div>
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
              <h3 className="mb-4 text-sm font-semibold text-foreground">Choose State (ranked by enrollment)</h3>
              {statesLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading states...
                </div>
              )}
              {statesError && <p className="text-xs text-red-400">{statesError}</p>}
              {!statesLoading && states.length === 0 && !statesError && (
                <p className="text-xs text-muted-foreground">No state enrollment data available for this contract.</p>
              )}
              <div className="mt-3 flex max-h-96 flex-col gap-2 overflow-y-auto">
                {states.map((state) => {
                  const isSelected = selectedState === state.state;
                  return (
                    <button
                      key={state.state}
                      onClick={() => {
                        setSelectedState(state.state);
                        setSelectedPlanType(null);
                        setSelectedEnrollmentLevel(state.enrollmentLevel);
                      }}
                      className={`flex items-center justify-between rounded-lg px-4 py-3 text-left transition ${
                        isSelected ? "bg-primary/10 border border-primary/40" : "hover:bg-accent border border-transparent"
                      }`}
                    >
                      <div>
                        <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>{state.state}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Enrollment {state.formattedEnrollment} • Level {state.enrollmentLevel}
                        </p>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Plan Type Group</h3>
              {availablePlanTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No plan types available for the selected state. Please choose another state.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {availablePlanTypes.map((option) => {
                    const isSelected = selectedPlanType === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() => setSelectedPlanType(option.id)}
                        className={`flex h-full flex-col gap-2 rounded-xl border px-4 py-3 text-left transition ${
                          isSelected
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-muted hover:border-border/70"
                        }`}
                      >
                        <span className="text-sm font-semibold">{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Enrollment Level</h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {ENROLLMENT_LEVELS.filter((bucket) => bucket.id !== "null").map((bucket) => {
                  const isSelected = selectedEnrollmentLevel === bucket.id;
                  return (
                    <button
                      key={bucket.id}
                      onClick={() => setSelectedEnrollmentLevel(bucket.id)}
                      className={`flex h-full flex-col gap-2 rounded-xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-muted hover:border-border/70"
                      }`}
                    >
                      <span className="text-sm font-semibold">{bucket.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {bucket.id === "all"
                          ? "Compare across all enrollment sizes"
                          : bucket.min !== undefined || bucket.max !== undefined
                          ? `${bucket.min?.toLocaleString() ?? "0"} - ${bucket.max?.toLocaleString() ?? "∞"}`
                          : "Suppressed"}
                      </span>
                    </button>
                  );
                })}
              </div>
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
            {step < 4 ? (
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
                  "Generate Comparison"
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {submittedSelection ? (
        <PeerComparisonResults selection={submittedSelection} />
      ) : null}
    </div>
  );
}
