"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { LeaderboardResults } from "./LeaderboardResults";
import type {
  ContractLeaderboardSelection,
  LeaderboardMode,
  LeaderboardRequest,
  LeaderboardResponse,
  OrganizationBucket,
} from "@/lib/leaderboard/types";
import { ENROLLMENT_LEVELS, type EnrollmentLevelId } from "@/lib/peer/enrollment-levels";

const PLAN_TYPE_OPTIONS: Array<{ id: ContractLeaderboardSelection["planTypeGroup"]; label: string; description: string }> = [
  { id: "ALL", label: "All Plan Types", description: "Include both SNP and non-SNP plans" },
  { id: "SNP", label: "Special Needs (SNP)", description: "Plans focused on special needs populations" },
  { id: "NOT", label: "Non-SNP Plans", description: "General population plans" },
];

const ORGANIZATION_BUCKETS: Array<{ id: OrganizationBucket; label: string; description: string }> = [
  { id: "all", label: "All Parent Orgs", description: "Organizations with more than one contract" },
  { id: "lt5", label: "Less than 5 contracts", description: "Smaller parent organizations" },
  { id: "5to10", label: "5 - 10 contracts", description: "Mid-sized organizations" },
  { id: "10to20", label: "11 - 20 contracts", description: "Large organizations" },
  { id: "20plus", label: "21+ contracts", description: "Mega parents" },
];

const DEFAULT_TOP_LIMIT = 10;

type LeaderboardStateResponse = {
  states: Array<{
    code: string;
    name: string;
    totalEnrollment: number | null;
    formattedEnrollment: string;
    contractCount: number;
  }>;
};

export function LeaderboardBuilder() {
  const [mode, setMode] = useState<LeaderboardMode>("contract");
  const [stateOption, setStateOption] = useState<ContractLeaderboardSelection["stateOption"]>("all");
  const [states, setStates] = useState<LeaderboardStateResponse["states"]>([]);
  const [stateSearch, setStateSearch] = useState("");
  const [selectedState, setSelectedState] = useState<string>("");
  const [planTypeGroup, setPlanTypeGroup] = useState<ContractLeaderboardSelection["planTypeGroup"]>("ALL");
  const [enrollmentLevel, setEnrollmentLevel] = useState<EnrollmentLevelId>("all");
  const [orgBucket, setOrgBucket] = useState<OrganizationBucket>("all");
  const [topLimit, setTopLimit] = useState<number>(DEFAULT_TOP_LIMIT);
  const [includeMeasures, setIncludeMeasures] = useState<boolean>(true);

  const [results, setResults] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isFetchingStates, setIsFetchingStates] = useState(false);
  const [stateFetchError, setStateFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStates() {
      setIsFetchingStates(true);
      setStateFetchError(null);
      try {
        const response = await fetch("/api/leaderboard/states");
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to fetch states");
        }
        const payload: LeaderboardStateResponse = await response.json();
        setStates(payload.states || []);
      } catch (err) {
        console.error("Leaderboard states fetch failed", err);
        setStates([]);
        setStateFetchError(err instanceof Error ? err.message : "Failed to fetch states");
      } finally {
        setIsFetchingStates(false);
      }
    }

    loadStates();
  }, []);

  const filteredStates = useMemo(() => {
    if (!stateSearch) {
      return states;
    }
    const term = stateSearch.toLowerCase();
    return states.filter((state) => state.name.toLowerCase().includes(term) || state.code.toLowerCase().includes(term));
  }, [states, stateSearch]);

  const [step, setStep] = useState(1);

  useEffect(() => {
    // Reset step when mode changes
    setStep(1);
    setResults(null);
    setError(null);
  }, [mode]);

  const canProceed = (currentStep: number) => {
    if (mode === "contract") {
      if (currentStep === 1) {
        return stateOption === "all" || Boolean(selectedState);
      }
      if (currentStep === 2) {
        return Boolean(planTypeGroup);
      }
      if (currentStep === 3) {
        return Boolean(enrollmentLevel);
      }
      return false;
    }

    // organization mode
    if (currentStep === 1) {
      return Boolean(orgBucket);
    }
    return false;
  };

  const canGenerate = mode === "contract"
    ? (stateOption === "all" || Boolean(selectedState)) && Boolean(planTypeGroup) && Boolean(enrollmentLevel)
    : Boolean(orgBucket);

  const resetSelections = () => {
    setStateOption("all");
    setSelectedState("");
    setPlanTypeGroup("ALL");
    setEnrollmentLevel("all");
    setOrgBucket("all");
    setTopLimit(DEFAULT_TOP_LIMIT);
    setResults(null);
    setError(null);
    setStep(1);
  };

  const submitSelection = async () => {
    if (!canGenerate || isSubmitting) {
      return;
    }

    const payload: LeaderboardRequest =
      mode === "contract"
        ? {
            mode,
            selection: {
              stateOption,
              state: stateOption === "state" ? selectedState : undefined,
              planTypeGroup,
              enrollmentLevel,
              topLimit,
            },
            topLimit,
            includeMeasures,
          }
        : {
            mode,
            selection: {
              bucket: orgBucket,
              topLimit,
            },
            topLimit,
            includeMeasures,
          };

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate leaderboard");
      }

      const data: LeaderboardResponse = await response.json();
      setResults(data);
    } catch (err) {
      console.error("Leaderboard generation failed", err);
      setResults(null);
      setError(err instanceof Error ? err.message : "Failed to generate leaderboard");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Configure Leaderboard</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "contract"
                ? "Rank Medicare Advantage contracts by state, plan type, and enrollment cohort."
                : "Rank parent organizations by contract footprint and year-over-year momentum."}
            </p>
          </div>
          {(stateOption !== "all" || selectedState || planTypeGroup !== "ALL" || enrollmentLevel !== "all" || orgBucket !== "all" || topLimit !== DEFAULT_TOP_LIMIT) && (
            <button
              onClick={resetSelections}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition hover:border-red-400/60 hover:text-red-200"
            >
              <X className="h-3 w-3" />
              Clear All
            </button>
          )}
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-border bg-muted p-2">
          <button
            onClick={() => setMode("contract")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
              mode === "contract" ? "bg-primary/10 text-primary border border-primary/40" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Individual Contracts
          </button>
          <button
            onClick={() => setMode("organization")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
              mode === "organization" ? "bg-primary/10 text-primary border border-primary/40" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Parent Organizations
          </button>
        </div>

        <div className="mb-8 flex items-center gap-4">
          {(mode === "contract" ? [1, 2, 3] : [1]).map((stepNumber) => (
            <div key={stepNumber} className="flex flex-1 items-center gap-3">
              <button
                onClick={() => setStep(stepNumber)}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition ${
                  step === stepNumber
                    ? "border-primary bg-primary/10 text-primary"
                    : stepNumber < step || canProceed(stepNumber)
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {stepNumber}
              </button>
              <div className="flex-1">
                <p className={`text-xs font-medium ${step === stepNumber ? "text-foreground" : "text-muted-foreground"}`}>
                  {mode === "contract" && stepNumber === 1 && "Select Geography"}
                  {mode === "contract" && stepNumber === 2 && "Plan Type Group"}
                  {mode === "contract" && stepNumber === 3 && "Enrollment Level"}
                  {mode === "organization" && stepNumber === 1 && "Organization Size"}
                </p>
                <p className="text-[0.65rem] text-muted-foreground">
                  {mode === "contract" && stepNumber === 1 && (stateOption === "all" ? "All Contracts" : selectedState || "Select a state")}
                  {mode === "contract" && stepNumber === 2 && PLAN_TYPE_OPTIONS.find((option) => option.id === planTypeGroup)?.label}
                  {mode === "contract" && stepNumber === 3 && ENROLLMENT_LEVELS.find((bucket) => bucket.id === enrollmentLevel)?.label}
                  {mode === "organization" && stepNumber === 1 && ORGANIZATION_BUCKETS.find((option) => option.id === orgBucket)?.label}
                </p>
              </div>
              {stepNumber < (mode === "contract" ? 3 : 1) && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          {mode === "contract" && step === 1 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Select Geography</h3>
              <div className="mb-4 flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="leaderboard-geography"
                    value="all"
                    checked={stateOption === "all"}
                    onChange={() => {
                      setStateOption("all");
                      setSelectedState("");
                    }}
                  />
                  All Contracts (National)
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="leaderboard-geography"
                    value="state"
                    checked={stateOption === "state"}
                    onChange={() => setStateOption("state")}
                  />
                  Select State
                </label>
              </div>

              {stateOption === "state" && (
                <div>
                  <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search states..."
                      value={stateSearch}
                      onChange={(event) => setStateSearch(event.target.value)}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                  </div>
                  {isFetchingStates && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading states...
                    </div>
                  )}
                  {stateFetchError && <p className="text-xs text-red-400">{stateFetchError}</p>}
                  {!isFetchingStates && !stateFetchError && filteredStates.length === 0 && (
                    <p className="text-xs text-muted-foreground">No states found.</p>
                  )}
                  <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto md:grid-cols-2">
                    {filteredStates.map((state) => {
                      const isSelected = selectedState === state.code;
                      return (
                        <button
                          key={state.code}
                          onClick={() => setSelectedState(state.code)}
                          className={`flex items-center justify-between rounded-lg px-4 py-3 text-left transition ${
                            isSelected ? "bg-primary/10 border border-primary/40" : "hover:bg-accent border border-transparent"
                          }`}
                        >
                          <div>
                            <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                              {state.name}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {state.code} • {state.contractCount.toLocaleString()} contracts • {state.formattedEnrollment}
                            </p>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "contract" && step === 2 && (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Plan Type Group</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {PLAN_TYPE_OPTIONS.map((option) => {
                  const isSelected = planTypeGroup === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setPlanTypeGroup(option.id)}
                      className={`flex h-full flex-col gap-2 rounded-xl border px-4 py-3 text-left transition ${
                        isSelected ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted hover:border-border/70"
                      }`}
                    >
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mode === "contract" && step === 3 && (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Enrollment Level</h3>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {ENROLLMENT_LEVELS.filter((bucket) => bucket.id !== "null").map((bucket) => {
                  const isSelected = enrollmentLevel === bucket.id;
                  return (
                    <button
                      key={bucket.id}
                      onClick={() => setEnrollmentLevel(bucket.id)}
                      className={`flex h-full flex-col gap-2 rounded-xl border px-4 py-3 text-left transition ${
                        isSelected ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted hover:border-border/70"
                      }`}
                    >
                      <span className="text-sm font-semibold">{bucket.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {bucket.id === "all"
                          ? "Include contracts of all enrollment sizes"
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

          {mode === "organization" && step === 1 && (
            <div>
              <h3 className="mb-4 text-sm font-semibold text-foreground">Organization Size</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {ORGANIZATION_BUCKETS.map((option) => {
                  const isSelected = orgBucket === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setOrgBucket(option.id)}
                      className={`flex h-full flex-col gap-2 rounded-xl border px-4 py-3 text-left transition ${
                        isSelected ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted hover:border-border/70"
                      }`}
                    >
                      <span className="text-sm font-semibold">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Leaderboard size</span>
            <span className="text-sm text-foreground">Top {topLimit}</span>
          </div>
          <input
            type="range"
            min={5}
            max={20}
            step={1}
            value={topLimit}
            onChange={(event) => setTopLimit(Number(event.target.value))}
          />
          <p className="text-[0.65rem] text-muted-foreground">Adjust the number of entries returned for each leaderboard.</p>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Include Domain & Measure Statistics</span>
            <p className="text-[0.65rem] text-muted-foreground">Show detailed performance breakdowns by domain and individual measures</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={includeMeasures}
              onChange={(event) => setIncludeMeasures(event.target.checked)}
              className="peer sr-only"
            />
            <div className="peer h-6 w-11 rounded-full bg-muted border border-border after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-border after:bg-card after:transition-all after:content-[''] peer-checked:bg-primary/20 peer-checked:after:translate-x-full peer-checked:after:border-primary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20"></div>
          </label>
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
            {step < (mode === "contract" ? 3 : 1) ? (
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
                  "Generate Leaderboard"
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {error && (
        <section className="rounded-3xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-200">
          {error}
        </section>
      )}

      {results && <LeaderboardResults data={results} />}
    </div>
  );
}
