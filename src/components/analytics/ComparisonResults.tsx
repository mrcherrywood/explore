"use client";

import { useState, useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { ChartRenderer } from "@/components/chart/ChartRenderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ComparisonResultsProps = {
  contracts: string[];
  measures: string[];
  years: string[];
};

type ChartSpec = {
  type: "line" | "bar" | "area" | "pie";
  title?: string;
  xKey: string;
  series: Array<{ key: string; name: string }>;
  data: Array<Record<string, string | number | null>>;
};

type ComparisonData = {
  charts: ChartSpec[];
  summary: string;
};

export function ComparisonResults({ contracts, measures, years }: ComparisonResultsProps) {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchComparison = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/analytics/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contracts, measures, years }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate comparison");
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        console.error("Comparison error:", err);
        setError(err instanceof Error ? err.message : "Failed to generate comparison");
      } finally {
        setIsLoading(false);
      }
    };

    fetchComparison();
  }, [contracts, measures, years]);

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-white/5 bg-[#080808] p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">Analyzing data...</p>
            <p className="mt-1 text-xs text-slate-500">
              Comparing {measures.length} measure{measures.length !== 1 ? "s" : ""} across {contracts.length} contract{contracts.length !== 1 ? "s" : ""} and {years.length} year{years.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-500/20 bg-red-500/5 p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10">
            <X className="h-6 w-6 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-red-300">Error generating comparison</p>
            <p className="mt-1 text-xs text-red-400">{error}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      {/* AI Summary */}
      <div className="rounded-3xl border border-white/5 bg-[#080808] p-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0a0a0a]">
            <Sparkles className="h-5 w-5 text-sky-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">AI Insights</h2>
            <p className="text-xs text-slate-500">Generated analysis of the comparison</p>
          </div>
        </div>
        <div className="prose prose-invert prose-sm max-w-none rounded-2xl border border-white/5 bg-[#0a0a0a] p-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.summary}</ReactMarkdown>
        </div>
      </div>

      {/* Charts */}
      {data.charts.map((chart, index) => (
        <div key={index} className="rounded-3xl border border-white/5 bg-[#080808] p-8">
          {chart.title && (
            <h3 className="mb-6 text-lg font-semibold text-slate-100">{chart.title}</h3>
          )}
          <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-6">
            <ChartRenderer spec={chart} />
          </div>
        </div>
      ))}
    </section>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
