"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X, Search, ChevronRight, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ComparisonBuilderProps = {
  selectedContracts: string[];
  selectedMeasures: string[];
  selectedYears: string[];
};

type Measure = {
  code: string;
  name: string;
};

type Contract = {
  contract_id: string;
  contract_name: string | null;
  organization_marketing_name: string | null;
};

export function ComparisonBuilder({
  selectedContracts: initialContracts,
  selectedMeasures: initialMeasures,
  selectedYears: initialYears,
}: ComparisonBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(1);
  const [selectedContracts, setSelectedContracts] = useState<Set<string>>(new Set(initialContracts));
  const [selectedMeasures, setSelectedMeasures] = useState<Set<string>>(new Set(initialMeasures));
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set(initialYears));
  
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [years, setYears] = useState<number[]>([]);
  
  const [contractSearch, setContractSearch] = useState("");
  const [measureSearch, setMeasureSearch] = useState("");
  
  const [isLoadingContracts, setIsLoadingContracts] = useState(true);
  const [isLoadingMeasures, setIsLoadingMeasures] = useState(true);
  const [isLoadingYears, setIsLoadingYears] = useState(true);

  // Fetch contracts
  useEffect(() => {
    const fetchContracts = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ma_contracts")
        .select("contract_id, contract_name, organization_marketing_name")
        .order("contract_id");

      if (!error && data) {
        // Deduplicate by contract_id
        const uniqueContracts = Array.from(
          new Map(data.map((c) => [c.contract_id, c])).values()
        );
        setContracts(uniqueContracts);
      }
      setIsLoadingContracts(false);
    };

    fetchContracts();
  }, []);

  // Fetch measures
  useEffect(() => {
    const fetchMeasures = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ma_measures")
        .select("code, name")
        .order("name");

      if (!error && data) {
        // Deduplicate by code
        const uniqueMeasures = Array.from(
          new Map(data.map((m) => [m.code, m])).values()
        );
        setMeasures(uniqueMeasures);
      }
      setIsLoadingMeasures(false);
    };

    fetchMeasures();
  }, []);

  // Fetch years
  useEffect(() => {
    const fetchYears = async () => {
      const supabase = createClient();
      
      // Get distinct years from ma_contracts which has more complete year data
      const { data, error } = await supabase
        .from("ma_contracts")
        .select("year")
        .order("year", { ascending: false });

      if (!error && data) {
        const uniqueYears = Array.from(new Set(data.map((d) => d.year).filter(Boolean))).sort((a, b) => b - a);
        setYears(uniqueYears);
      }
      setIsLoadingYears(false);
    };

    fetchYears();
  }, []);

  const toggleContract = (contractId: string) => {
    const newSet = new Set(selectedContracts);
    if (newSet.has(contractId)) {
      newSet.delete(contractId);
    } else {
      newSet.add(contractId);
    }
    setSelectedContracts(newSet);
  };

  const toggleMeasure = (code: string) => {
    const newSet = new Set(selectedMeasures);
    if (newSet.has(code)) {
      newSet.delete(code);
    } else {
      newSet.add(code);
    }
    setSelectedMeasures(newSet);
  };

  const toggleYear = (year: string) => {
    const newSet = new Set(selectedYears);
    if (newSet.has(year)) {
      newSet.delete(year);
    } else {
      newSet.add(year);
    }
    setSelectedYears(newSet);
  };

  const applyComparison = () => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (selectedContracts.size > 0) {
      params.set("contracts", Array.from(selectedContracts).join(","));
    } else {
      params.delete("contracts");
    }
    
    if (selectedMeasures.size > 0) {
      params.set("measures", Array.from(selectedMeasures).join(","));
    } else {
      params.delete("measures");
    }
    
    if (selectedYears.size > 0) {
      params.set("years", Array.from(selectedYears).join(","));
    } else {
      params.delete("years");
    }

    router.push(`/analytics?${params.toString()}`);
  };

  const clearAll = () => {
    setSelectedContracts(new Set());
    setSelectedMeasures(new Set());
    setSelectedYears(new Set());
    setStep(1);
    router.push("/analytics");
  };

  const filteredContracts = contracts.filter((c) =>
    c.contract_id.toLowerCase().includes(contractSearch.toLowerCase()) ||
    c.contract_name?.toLowerCase().includes(contractSearch.toLowerCase()) ||
    c.organization_marketing_name?.toLowerCase().includes(contractSearch.toLowerCase())
  );

  const filteredMeasures = measures.filter((m) =>
    m.name.toLowerCase().includes(measureSearch.toLowerCase()) ||
    m.code.toLowerCase().includes(measureSearch.toLowerCase())
  );

  const canProceed = 
    (step === 1 && selectedContracts.size > 0) ||
    (step === 2 && selectedMeasures.size > 0) ||
    (step === 3 && selectedYears.size > 0);

  const canGenerate = selectedContracts.size > 0 && selectedMeasures.size > 0 && selectedYears.size > 0;

  return (
    <section className="rounded-3xl border border-border bg-card p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Build Comparison</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow the steps to select contracts, measures, and time periods
          </p>
        </div>
        {(selectedContracts.size > 0 || selectedMeasures.size > 0 || selectedYears.size > 0) && (
          <button
            onClick={clearAll}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition hover:border-red-400/60 hover:text-red-200"
          >
            <X className="h-3 w-3" />
            Clear All
          </button>
        )}
      </div>

      {/* Stepper */}
      <div className="mb-8 flex items-center gap-4">
        {[1, 2, 3].map((stepNum) => (
          <div key={stepNum} className="flex flex-1 items-center gap-3">
            <button
              onClick={() => setStep(stepNum)}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition ${
                step === stepNum
                  ? "border-primary bg-primary/10 text-primary"
                  : stepNum < step || (stepNum === 1 && selectedContracts.size > 0) || (stepNum === 2 && selectedMeasures.size > 0) || (stepNum === 3 && selectedYears.size > 0)
                  ? "border-primary/40 bg-primary/5 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {stepNum}
            </button>
            <div className="flex-1">
              <p className={`text-xs font-medium ${step === stepNum ? "text-foreground" : "text-muted-foreground"}`}>
                {stepNum === 1 && "Select Contracts"}
                {stepNum === 2 && "Choose Measures"}
                {stepNum === 3 && "Pick Years"}
              </p>
              <p className="text-[0.65rem] text-muted-foreground">
                {stepNum === 1 && `${selectedContracts.size} selected`}
                {stepNum === 2 && `${selectedMeasures.size} selected`}
                {stepNum === 3 && `${selectedYears.size} selected`}
              </p>
            </div>
            {stepNum < 3 && (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-2xl border border-border bg-card p-6">
        {/* Step 1: Contracts */}
        {step === 1 && (
          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Select Contracts to Compare ({selectedContracts.size} selected)
            </h3>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by contract ID, name, or organization..."
                value={contractSearch}
                onChange={(e) => setContractSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {isLoadingContracts ? (
                <p className="text-xs text-muted-foreground">Loading contracts...</p>
              ) : (
                filteredContracts.map((contract) => {
                  const isSelected = selectedContracts.has(contract.contract_id);
                  return (
                    <button
                      key={contract.contract_id}
                      onClick={() => toggleContract(contract.contract_id)}
                      className={`flex items-start justify-between rounded-lg px-4 py-3 text-left transition ${
                        isSelected
                          ? "bg-primary/10 border border-primary/40"
                          : "hover:bg-accent border border-transparent"
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
                })
              )}
            </div>
          </div>
        )}

        {/* Step 2: Measures */}
        {step === 2 && (
          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Choose Measures to Analyze ({selectedMeasures.size} selected)
            </h3>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search measures by name or code..."
                value={measureSearch}
                onChange={(e) => setMeasureSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {isLoadingMeasures ? (
                <p className="text-xs text-muted-foreground">Loading measures...</p>
              ) : (
                filteredMeasures.map((measure) => {
                  const isSelected = selectedMeasures.has(measure.code);
                  return (
                    <button
                      key={measure.code}
                      onClick={() => toggleMeasure(measure.code)}
                      className={`flex items-start justify-between rounded-lg px-4 py-3 text-left transition ${
                        isSelected
                          ? "bg-primary/10 border border-primary/40"
                          : "hover:bg-accent border border-transparent"
                      }`}
                    >
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {measure.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Code: {measure.code}
                        </p>
                      </div>
                      {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Step 3: Years */}
        {step === 3 && (
          <div>
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              Select Years ({selectedYears.size} selected)
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {isLoadingYears ? (
                <p className="text-xs text-muted-foreground">Loading years...</p>
              ) : (
                years.map((year) => {
                  const yearStr = String(year);
                  const isSelected = selectedYears.has(yearStr);
                  return (
                    <button
                      key={year}
                      onClick={() => toggleYear(yearStr)}
                      className={`flex items-center justify-center rounded-lg px-4 py-3 text-sm font-medium transition ${
                        isSelected
                          ? "bg-primary/10 text-primary border border-primary/40"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent"
                      }`}
                    >
                      {year}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
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
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed}
              className="flex items-center gap-2 rounded-2xl border border-primary/70 bg-primary/10 px-6 py-2 text-sm font-medium text-primary transition hover:border-primary/80 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={applyComparison}
              disabled={!canGenerate}
              className="rounded-2xl border border-primary/70 bg-primary/10 px-6 py-2 text-sm font-medium text-primary transition hover:border-primary/80 hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Comparison
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
