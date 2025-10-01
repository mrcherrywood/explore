"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { ChartRenderer, ChartSpec } from "@/components/chart/ChartRenderer";

type Selection = {
  comparisonType: "contract" | "organization";
  contractId: string;
  parentOrganization: string;
  years: number[];
};

type YoYComparisonResponse = {
  comparisonType?: "contract" | "organization";
  contractId?: string;
  parentOrganization?: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  years: number[];
  overallChart: ChartSpec | null;
  domainCharts: ChartSpec[];
  measureCharts: ChartSpec[];
};

export function YoYComparisonResults({ selection }: { selection: Selection }) {
  const [data, setData] = useState<YoYComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchComparison() {
      setIsLoading(true);
      setError(null);
      setData(null);
      try {
        const response = await fetch("/api/yoy/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selection),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to build year over year comparison");
        }

        const payload: YoYComparisonResponse = await response.json();
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to build year over year comparison");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchComparison();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center text-sm text-muted-foreground">
            Building year over year analysis for {selection.comparisonType === "contract" ? selection.contractId : selection.parentOrganization} across {selection.years.length} years
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-500/30 bg-red-500/5 p-8">
        <div className="flex flex-col items-center gap-3 py-14 text-red-200">
          <TriangleAlert className="h-8 w-8" />
          <div className="text-center text-sm font-medium">{error}</div>
        </div>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const headingLabel = selection.comparisonType === "organization"
    ? data.organizationMarketingName || selection.parentOrganization
    : data.contractName || data.organizationMarketingName || selection.contractId;
  const yearRange = `${Math.min(...data.years)} - ${Math.max(...data.years)}`;

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              {selection.comparisonType === "contract" ? "Selected Contract" : "Selected Organization"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">{headingLabel}</h2>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {selection.comparisonType === "contract" ? (
                <span className="rounded-full border border-border px-3 py-1">Contract {selection.contractId}</span>
              ) : (
                <span className="rounded-full border border-border px-3 py-1">Organization</span>
              )}
              <span className="rounded-full border border-border px-3 py-1">{data.years.length} years</span>
              <span className="rounded-full border border-border px-3 py-1">{yearRange}</span>
            </div>
          </div>
        </div>
      </div>

      {data.overallChart && (
        <div className="rounded-3xl border border-border bg-card p-8">
          <h3 className="mb-6 text-lg font-semibold text-foreground">
            {selection.comparisonType === "organization" ? "Average Overall Star Rating Trend" : "Overall Star Rating Trend"}
          </h3>
          <ChartRenderer spec={data.overallChart} />
        </div>
      )}

      {data.domainCharts && data.domainCharts.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-primary"></div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Domain Star Rating Trends</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selection.comparisonType === "organization"
                    ? "Average weighted star ratings by domain across all contracts over time"
                    : "Weighted average star ratings by domain over time"}
                </p>
              </div>
            </div>
          </div>
          {data.domainCharts.map((chart: ChartSpec, index: number) => (
            <div key={`${chart.title ?? "domain"}-${index}`} className="rounded-3xl border border-border bg-card p-8">
              {chart.title && <h3 className="mb-6 text-lg font-semibold text-foreground">{chart.title}</h3>}
              <ChartRenderer spec={chart} />
            </div>
          ))}
        </div>
      )}

      {data.measureCharts.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="rounded-3xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-primary"></div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Individual Measure Performance Trends</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selection.comparisonType === "organization"
                    ? "Average rate percentages and star ratings for individual measures across all contracts over time"
                    : "Rate percentages and star ratings for individual measures over time"}
                </p>
              </div>
            </div>
          </div>
          {data.measureCharts.map((chart: ChartSpec, index: number) => (
            <div key={`${chart.title ?? "measure"}-${index}`} className="rounded-3xl border border-border bg-card p-8">
              {chart.title && <h3 className="mb-6 text-lg font-semibold text-foreground">{chart.title}</h3>}
              <ChartRenderer spec={chart} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
