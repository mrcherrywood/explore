import { TrendingUp } from "lucide-react";
import { DataPageNav } from "@/components/navigation/DataPageNav";
import { ComparisonBuilder } from "@/components/analytics/ComparisonBuilder";
import { ComparisonResults } from "@/components/analytics/ComparisonResults";

export const metadata = {
  title: "AI Analytics • Program Insight Studio",
  description: "Compare any variables across your Medicare Advantage data.",
};
type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function AnalyticsPage({ searchParams }: PageProps) {
  // Parse selected filters from URL
  const contractsParam = searchParams.contracts;
  const measuresParam = searchParams.measures;
  const yearsParam = searchParams.years;

  const selectedContracts = typeof contractsParam === "string" ? contractsParam.split(",").filter(Boolean) : [];
  const selectedMeasures = typeof measuresParam === "string" ? measuresParam.split(",").filter(Boolean) : [];
  const selectedYears = typeof yearsParam === "string" ? yearsParam.split(",").filter(Boolean) : [];

  const hasSelections = selectedContracts.length > 0 && selectedMeasures.length > 0 && selectedYears.length > 0;

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/5 px-10 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#080808] text-lg font-semibold">
                <TrendingUp className="h-5 w-5 text-slate-200" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-slate-500">AI Studio</p>
                <h1 className="text-2xl font-semibold text-slate-100">Performance Comparisons</h1>
              </div>
            </div>
            <div className="text-xs text-slate-500">{new Date().toLocaleString()}</div>
          </header>

          <main className="flex flex-1 flex-col gap-6 px-10 pb-10 pt-8">
            <ComparisonBuilder
              selectedContracts={selectedContracts}
              selectedMeasures={selectedMeasures}
              selectedYears={selectedYears}
            />

            {hasSelections && (
              <ComparisonResults
                contracts={selectedContracts}
                measures={selectedMeasures}
                years={selectedYears}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
