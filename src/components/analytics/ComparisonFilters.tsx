"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ComparisonFiltersProps = {
  availableYears: number[];
  availableContracts: string[];
  selectedYears: string[];
  selectedContracts: string[];
  selectedMeasures: string[];
};

type Measure = {
  code: string;
  name: string;
};

export function ComparisonFilters({
  availableYears,
  availableContracts,
  selectedYears: initialYears,
  selectedContracts: initialContracts,
  selectedMeasures: initialMeasures,
}: ComparisonFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set(initialYears));
  const [selectedContracts, setSelectedContracts] = useState<Set<string>>(new Set(initialContracts));
  const [selectedMeasures, setSelectedMeasures] = useState<Set<string>>(new Set(initialMeasures));
  
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [measureSearch, setMeasureSearch] = useState("");
  const [contractSearch, setContractSearch] = useState("");
  const [isLoadingMeasures, setIsLoadingMeasures] = useState(true);

  // Fetch available measures
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
          new Map((data as Measure[]).map((m) => [m.code, m])).values()
        );
        setMeasures(uniqueMeasures);
      }
      setIsLoadingMeasures(false);
    };

    fetchMeasures();
  }, []);

  const toggleYear = (year: string) => {
    const newSet = new Set(selectedYears);
    if (newSet.has(year)) {
      newSet.delete(year);
    } else {
      newSet.add(year);
    }
    setSelectedYears(newSet);
  };

  const toggleContract = (contract: string) => {
    const newSet = new Set(selectedContracts);
    if (newSet.has(contract)) {
      newSet.delete(contract);
    } else {
      newSet.add(contract);
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

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (selectedYears.size > 0) {
      params.set("years", Array.from(selectedYears).join(","));
    } else {
      params.delete("years");
    }
    
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

    router.push(`/analytics?${params.toString()}`);
  };

  const clearAll = () => {
    setSelectedYears(new Set());
    setSelectedContracts(new Set());
    setSelectedMeasures(new Set());
    router.push("/analytics");
  };

  const filteredContracts = availableContracts.filter((c) =>
    c.toLowerCase().includes(contractSearch.toLowerCase())
  );

  const filteredMeasures = measures.filter((m) =>
    m.name.toLowerCase().includes(measureSearch.toLowerCase()) ||
    m.code.toLowerCase().includes(measureSearch.toLowerCase())
  );

  const totalSelected = selectedYears.size + selectedContracts.size + selectedMeasures.size;
  const canCompare = selectedYears.size > 0 && selectedContracts.size > 0 && selectedMeasures.size > 0;

  return (
    <section className="rounded-3xl border border-white/5 bg-[#080808] p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Comparison Filters</h2>
          <p className="mt-1 text-sm text-slate-500">
            Select years, contracts, and measures to compare performance
          </p>
        </div>
        {totalSelected > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0a0a0a] px-4 py-2 text-xs text-slate-300 transition hover:border-red-400/60 hover:text-red-200"
          >
            <X className="h-3 w-3" />
            Clear All
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Years */}
        <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">
            Years ({selectedYears.size} selected)
          </h3>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {availableYears.map((year) => {
              const yearStr = String(year);
              const isSelected = selectedYears.has(yearStr);
              return (
                <button
                  key={year}
                  onClick={() => toggleYear(yearStr)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? "bg-sky-500/20 text-sky-200 border border-sky-400/40"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-300 border border-transparent"
                  }`}
                >
                  <span>{year}</span>
                  {isSelected && <Check className="h-4 w-4 text-sky-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Contracts */}
        <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">
            Contracts ({selectedContracts.size} selected)
          </h3>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-[#050505] px-3 py-2">
            <Search className="h-3 w-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search contracts..."
              value={contractSearch}
              onChange={(e) => setContractSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
            {filteredContracts.map((contract) => {
              const isSelected = selectedContracts.has(contract);
              return (
                <button
                  key={contract}
                  onClick={() => toggleContract(contract)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? "bg-sky-500/20 text-sky-200 border border-sky-400/40"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-300 border border-transparent"
                  }`}
                >
                  <span>{contract}</span>
                  {isSelected && <Check className="h-4 w-4 text-sky-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Measures */}
        <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">
            Measures ({selectedMeasures.size} selected)
          </h3>
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-[#050505] px-3 py-2">
            <Search className="h-3 w-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search measures..."
              value={measureSearch}
              onChange={(e) => setMeasureSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
            {isLoadingMeasures ? (
              <p className="text-xs text-slate-500">Loading measures...</p>
            ) : (
              filteredMeasures.map((measure) => {
                const isSelected = selectedMeasures.has(measure.code);
                return (
                  <button
                    key={measure.code}
                    onClick={() => toggleMeasure(measure.code)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition ${
                      isSelected
                        ? "bg-sky-500/20 text-sky-200 border border-sky-400/40"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-300 border border-transparent"
                    }`}
                  >
                    <span className="flex-1 truncate" title={measure.name}>
                      {measure.name}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-sky-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {totalSelected > 0 ? (
            <>
              <span className="font-semibold text-slate-300">{totalSelected} filter{totalSelected !== 1 ? "s" : ""} selected</span>
              {!canCompare && " • Select at least one from each category to compare"}
            </>
          ) : (
            "Select filters above to start comparing"
          )}
        </p>
        <button
          onClick={applyFilters}
          disabled={!canCompare}
          className="rounded-2xl border border-sky-500/70 bg-sky-500/10 px-6 py-3 text-sm font-medium text-sky-200 transition hover:border-sky-400/80 hover:bg-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate Comparison
        </button>
      </div>
    </section>
  );
}
