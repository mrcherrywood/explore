"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { ENROLLMENT_LEVELS, EnrollmentLevelId } from "@/lib/peer/enrollment-levels";
import { PeerComparisonResults } from "./PeerComparisonResults";

type ComparisonType = "contract" | "organization";

type ContractRow = {
  contract_id: string;
  contract_name: string | null;
  organization_marketing_name: string | null;
  has_snp_plans: boolean;
};

type OrganizationRow = {
  parent_organization: string;
  contract_count: number;
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
  comparisonType: ComparisonType;
  contractId: string;
  contractSeries: "H_ONLY" | "S_ONLY";
  parentOrganization: string;
  peerOrganizations: string[];
  states: string[];
  planTypeGroup: "SNP" | "NOT" | "ALL";
  enrollmentLevel: EnrollmentLevelId;
};

const PLAN_TYPE_OPTIONS: Array<{ id: "SNP" | "NOT" | "ALL"; label: string; description: string }> = [
  { id: "ALL", label: "All Plans", description: "Combine SNP and Non-SNP peers" },
  { id: "SNP", label: "Special Needs (SNP)", description: "Plans focused on special needs populations" },
  { id: "NOT", label: "Non-SNP Plans", description: "General population plans" },
];

const CONTRACT_SERIES_OPTIONS: Array<{ id: "H_ONLY" | "S_ONLY"; label: string; description: string }> = [
  { id: "H_ONLY", label: "H-Series Contracts", description: "Exclude S-series employer or EGWP contracts" },
  { id: "S_ONLY", label: "S-Series Contracts", description: "Focus only on S-series contracts" },
];

export function PeerComparisonBuilder() {
  const [comparisonType, setComparisonType] = useState<ComparisonType>("contract");
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [contractSearch, setContractSearch] = useState("");
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [selectedContractSeries, setSelectedContractSeries] = useState<"H_ONLY" | "S_ONLY">("H_ONLY");
  const [selectedParentOrg, setSelectedParentOrg] = useState<string>("");
  const [selectedPeerOrgs, setSelectedPeerOrgs] = useState<string[]>([]);

  const [states, setStates] = useState<StateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [contractSummary, setContractSummary] = useState<ContractSummary | null>(null);

  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedPlanType, setSelectedPlanType] = useState<"SNP" | "NOT" | "ALL" | null>(null);
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

    async function fetchOrganizations() {
      try {
        const response = await fetch("/api/peer/organizations");
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to load organizations");
        }
        const payload: { organizations: OrganizationRow[] } = await response.json();
        setOrganizations(payload.organizations || []);
      } catch (error) {
        console.error("Failed to load organizations", error);
        setOrganizations([]);
      }
    }

    if (comparisonType === "contract") {
      fetchContracts();
    } else {
      fetchOrganizations();
    }
  }, [comparisonType]);

  const filteredContracts = useMemo(() => {
    const bySeries = contracts.filter((contract) => {
      if (selectedContractSeries === "H_ONLY") {
        return contract.contract_id.toUpperCase().startsWith("H");
      }
      if (selectedContractSeries === "S_ONLY") {
        return contract.contract_id.toUpperCase().startsWith("S");
      }
      return true;
    });

    if (!contractSearch) return bySeries;
    const query = contractSearch.toLowerCase();
    return bySeries.filter((contract) => {
      return (
        contract.contract_id.toLowerCase().includes(query) ||
        contract.contract_name?.toLowerCase().includes(query) ||
        contract.organization_marketing_name?.toLowerCase().includes(query)
      );
    });
  }, [contracts, contractSearch, selectedContractSeries]);

  useEffect(() => {
    if (!selectedContractId) {
      return;
    }
    const upper = selectedContractId.toUpperCase();
    const matchesSeries =
      (selectedContractSeries === "H_ONLY" && upper.startsWith("H")) ||
      (selectedContractSeries === "S_ONLY" && upper.startsWith("S"));
    if (!matchesSeries) {
      setSelectedContractId("");
    }
  }, [selectedContractSeries, selectedContractId]);

  const filteredOrganizations = useMemo(() => {
    if (!organizationSearch) return organizations;
    const query = organizationSearch.toLowerCase();
    return organizations.filter((org) => {
      return org.parent_organization.toLowerCase().includes(query);
    });
  }, [organizations, organizationSearch]);

  useEffect(() => {
    // Only fetch states for contract-level comparison
    if (comparisonType === "organization") {
      setStates([]);
      setContractSummary(null);
      setStatesError(null);
      return;
    }

    if (!selectedContractId) {
      setStates([]);
      setContractSummary(null);
      setStatesError(null);
      setSelectedStates([]);
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
        setSelectedStates([]);
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
  }, [selectedContractId, comparisonType]);

  const availablePlanTypes = useMemo(() => PLAN_TYPE_OPTIONS, []);

  const selectedContractSeriesLabel = useMemo(() => {
    const option = CONTRACT_SERIES_OPTIONS.find((entry) => entry.id === selectedContractSeries);
    return option ? option.label : selectedContractSeries;
  }, [selectedContractSeries]);

  const selectedPlanTypeLabel = useMemo(() => {
    if (!selectedPlanType) return null;
    return availablePlanTypes.find((option) => option.id === selectedPlanType)?.label ?? selectedPlanType;
  }, [availablePlanTypes, selectedPlanType]);

  const canProceed = (step: number) => {
    if (comparisonType === "organization") {
      if (step === 1) return Boolean(selectedParentOrg);
      if (step === 2) return selectedPeerOrgs.length > 0;
      return false;
    }
    // Contract-level logic
    if (step === 1) return Boolean(selectedContractId);
    if (step === 2) return selectedStates.length > 0;
    if (step === 3) return Boolean(selectedPlanType);
    if (step === 4) return Boolean(selectedEnrollmentLevel);
    return false;
  };

  const canGenerate = comparisonType === "organization"
    ? Boolean(selectedParentOrg && selectedPeerOrgs.length > 0)
    : Boolean(selectedContractId && selectedStates.length > 0 && selectedPlanType && selectedEnrollmentLevel);

  const [step, setStep] = useState(1);

  const resetSelection = () => {
    setSelectedContractId("");
    setSelectedParentOrg("");
    setSelectedPeerOrgs([]);
    setSelectedStates([]);
    setSelectedPlanType(null);
    setSelectedEnrollmentLevel(null);
    setSubmittedSelection(null);
    setSelectedContractSeries("H_ONLY");
    setStep(1);
  };

  const submitSelection = useCallback(async () => {
    if (!canGenerate || isSubmitting) {
      return;
    }
    if (comparisonType === "contract" && (!selectedPlanType || !selectedEnrollmentLevel)) {
      return;
    }
    setIsSubmitting(true);
    setSubmittedSelection({
      comparisonType,
      contractId: selectedContractId,
      contractSeries: selectedContractSeries,
      parentOrganization: selectedParentOrg,
      peerOrganizations: selectedPeerOrgs,
      states: selectedStates.map((value) => value.toUpperCase()),
      planTypeGroup: selectedPlanType || "ALL",
      enrollmentLevel: selectedEnrollmentLevel || "all",
    });
    setTimeout(() => setIsSubmitting(false), 150);
  }, [
    canGenerate,
    comparisonType,
    isSubmitting,
    selectedContractId,
    selectedContractSeries,
    selectedEnrollmentLevel,
    selectedParentOrg,
    selectedPeerOrgs,
    selectedPlanType,
    selectedStates,
  ]);

  useEffect(() => {
    if (comparisonType !== "contract") {
      return;
    }
    if (selectedContractSeries !== "S_ONLY") {
      return;
    }
    if (!selectedContractId) {
      return;
    }

    const defaultsApplied =
      selectedStates.length === 1 &&
      selectedStates[0] === "ALL" &&
      selectedPlanType === "ALL" &&
      selectedEnrollmentLevel === "all";

    if (!defaultsApplied) {
      setSelectedStates(["ALL"]);
      setSelectedPlanType("ALL");
      setSelectedEnrollmentLevel("all");
      setStep(4);
      return;
    }

    const alreadySubmitted =
      submittedSelection &&
      submittedSelection.contractId === selectedContractId &&
      submittedSelection.contractSeries === "S_ONLY";

    if (!alreadySubmitted) {
      if (!isSubmitting) {
        setStep(4);
        void submitSelection();
      }
    }
  }, [
    comparisonType,
    isSubmitting,
    selectedContractId,
    selectedContractSeries,
    selectedEnrollmentLevel,
    selectedPlanType,
    selectedStates,
    submitSelection,
    submittedSelection,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Select Peer Group Criteria</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {comparisonType === "contract" 
                ? "Choose a contract, state, plan type grouping, and enrollment tier to compare against peers."
                : "Choose a primary parent organization and peer organizations to compare performance."}
            </p>
          </div>
          {(selectedContractId || selectedParentOrg || selectedPeerOrgs.length > 0 || selectedStates.length > 0 || selectedPlanType || selectedEnrollmentLevel) && (
            <button
              onClick={resetSelection}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition hover:border-red-400/60 hover:text-red-200"
            >
              <X className="h-3 w-3" />
              Clear All
            </button>
          )}
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-border bg-muted p-2">
          <button
            onClick={() => {
              setComparisonType("contract");
              setSelectedParentOrg("");
              setSelectedPeerOrgs([]);
              setSelectedStates([]);
              setSelectedPlanType(null);
              setSelectedEnrollmentLevel(null);
              setSubmittedSelection(null);
              setSelectedContractSeries("H_ONLY");
              setStep(1);
            }}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
              comparisonType === "contract"
                ? "bg-primary/10 text-primary border border-primary/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Contract-Level
          </button>
          <button
            onClick={() => {
              setComparisonType("organization");
              setSelectedContractId("");
              setSelectedPeerOrgs([]);
              setSelectedStates([]);
              setSelectedPlanType(null);
              setSelectedEnrollmentLevel(null);
              setSubmittedSelection(null);
              setSelectedContractSeries("H_ONLY");
              setStep(1);
            }}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
              comparisonType === "organization"
                ? "bg-primary/10 text-primary border border-primary/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Organization-Level
          </button>
        </div>

        {comparisonType === "contract" && contractSummary && (
          <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-muted p-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{comparisonType === "contract" ? "Contract" : "Organization"} Enrollment</p>
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
          {(comparisonType === "contract" ? [1, 2, 3, 4] : [1, 2]).map((stepNum) => (
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
                  {stepNum === 1 && (comparisonType === "contract" ? "Select Contract" : "Select Primary Org")}
                  {stepNum === 2 && (comparisonType === "contract" ? "Choose States" : "Select Peer Orgs")}
                  {stepNum === 3 && "Plan Type Group"}
                  {stepNum === 4 && "Enrollment Level"}
                </p>
                <p className="text-[0.65rem] text-muted-foreground">
                  {stepNum === 1 && (comparisonType === "contract"
                    ? `${selectedContractSeriesLabel}${selectedContractId ? " • 1 selected" : " • 0 selected"}`
                    : (selectedParentOrg ? "1 selected" : "0 selected"))}
                  {stepNum === 2 && (comparisonType === "contract" 
                    ? (selectedStates.length > 0 ? `${selectedStates.length} selected` : "None selected")
                    : (selectedPeerOrgs.length > 0 ? `${selectedPeerOrgs.length} selected` : "None selected"))}
                  {stepNum === 3 && (selectedPlanTypeLabel || "None selected")}
                  {stepNum === 4 && (selectedEnrollmentLevel || "None selected")}
                </p>
              </div>
              {stepNum < (comparisonType === "contract" ? 4 : 2) && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          {step === 1 && comparisonType === "contract" && (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Select Contract</h3>
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                {CONTRACT_SERIES_OPTIONS.map((option) => {
                  const isSelected = selectedContractSeries === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setSelectedContractSeries(option.id)}
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

          {step === 1 && comparisonType === "organization" && (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Select Primary Parent Organization</h3>
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by organization name..."
                  value={organizationSearch}
                  onChange={(e) => setOrganizationSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                {filteredOrganizations.map((org) => {
                  const isSelected = selectedParentOrg === org.parent_organization;
                  return (
                    <button
                      key={org.parent_organization}
                      onClick={() => setSelectedParentOrg(org.parent_organization)}
                      className={`flex items-start justify-between rounded-lg px-4 py-3 text-left transition ${
                        isSelected ? "bg-primary/10 border border-primary/40" : "hover:bg-accent border border-transparent"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${
                            isSelected ? "text-primary" : "text-foreground"
                          }`}>
                            {org.parent_organization}
                          </p>
                          {org.has_snp_plans && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                              SNP
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {org.contract_count} contract{org.contract_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && comparisonType === "organization" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Select Peer Organizations</h3>
              <p className="mb-4 text-xs text-muted-foreground">Choose one or more peer organizations to compare against {selectedParentOrg}.</p>
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by organization name..."
                  value={organizationSearch}
                  onChange={(e) => setOrganizationSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                {filteredOrganizations
                  .filter(org => org.parent_organization !== selectedParentOrg)
                  .map((org) => {
                    const isSelected = selectedPeerOrgs.includes(org.parent_organization);
                    return (
                      <button
                        key={org.parent_organization}
                        onClick={() => {
                          setSelectedPeerOrgs(prev => 
                            isSelected 
                              ? prev.filter(o => o !== org.parent_organization)
                              : [...prev, org.parent_organization]
                          );
                        }}
                        className={`flex items-start justify-between rounded-lg px-4 py-3 text-left transition ${
                          isSelected ? "bg-primary/10 border border-primary/40" : "hover:bg-accent border border-transparent"
                        }`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium ${
                              isSelected ? "text-primary" : "text-foreground"
                            }`}>
                              {org.parent_organization}
                            </p>
                            {org.has_snp_plans && (
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                                SNP
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {org.contract_count} contract{org.contract_count !== 1 ? "s" : ""}
                          </p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {step === 2 && comparisonType === "contract" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Choose States (ranked by enrollment)</h3>
              <p className="mb-2 text-xs text-muted-foreground">Select one or more states to include in the peer comparison.</p>
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
                  const normalizedCode = state.state.toUpperCase();
                  const isSelected = selectedStates.includes(normalizedCode);
                  return (
                    <button
                      key={state.state}
                      onClick={() => {
                        setSelectedStates((previous) => {
                          const code = normalizedCode;
                          const alreadySelected = previous.includes(code);
                          if (alreadySelected) {
                            const next = previous.filter((value) => value !== code);
                            setSelectedPlanType(null);
                            if (next.length === 1) {
                              const remaining = states.find((row) => row.state.toUpperCase() === next[0]);
                              setSelectedEnrollmentLevel(remaining?.enrollmentLevel ?? null);
                            } else {
                              setSelectedEnrollmentLevel(null);
                            }
                            return next;
                          }

                          const next = [...previous, code];
                          setSelectedPlanType(null);
                          if (next.length === 1) {
                            setSelectedEnrollmentLevel(state.enrollmentLevel);
                          } else {
                            setSelectedEnrollmentLevel(null);
                          }
                          return next;
                        });
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
                  No plan types available for the selected states. Please adjust your selection.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
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
            {step < (comparisonType === "contract" ? 4 : 2) ? (
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
