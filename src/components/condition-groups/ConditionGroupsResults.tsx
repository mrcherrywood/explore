"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { ChartRenderer } from "@/components/chart/ChartRenderer";
import type { ChartSpec } from "@/types/charts";
import { ConditionGroupTable } from "./ConditionGroupTable";

type Selection = {
  comparisonType: "contract" | "organization";
  contractId: string;
  parentOrganization: string;
  years: number[];
  stateCode?: string;
};

type GroupInfo = { id: string; label: string; color: string };

type MeasureDetail = {
  code: string;
  name: string;
  weight: number;
  yearData: Record<string, { avgStar: number | null; avgRate: number | null }>;
};

type GroupDetail = {
  groupId: string;
  groupLabel: string;
  groupColor: string;
  measures: MeasureDetail[];
  yearScores: Record<string, number | null>;
};

type StateInfo = {
  stateCode: string;
  stateName: string;
  contractCount: number;
};

type NationalComparison = {
  contractCount: number;
  groupDetails: GroupDetail[];
};

type StateComparison = {
  contractCount: number;
  groupDetails: GroupDetail[];
};

type ApiResponse = {
  years: number[];
  chartData: Record<string, string | number | null>[];
  groupDetails: GroupDetail[];
  groups: GroupInfo[];
  stateInfo: StateInfo | null;
  stateComparison: StateComparison | null;
  stateGroupCharts: ChartSpec[];
  stateMeasureChartsByGroup: Record<string, ChartSpec[]>;
  nationalComparison: NationalComparison | null;
  error?: string;
};

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";

const shortenLabel = (value: string, maxLength = 48) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

export function ConditionGroupsResults({ selection }: { selection: Selection }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchData() {
      try {
        const response = await fetch("/api/condition-groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractId: selection.contractId || undefined,
            parentOrganization: selection.parentOrganization || undefined,
            years: selection.years,
            stateCode: selection.stateCode || undefined,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to load condition group data");
        }

        const result: ApiResponse = await response.json();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const chartData = data?.chartData ?? [];
  const groupDetails = data?.groupDetails ?? [];
  const groups = data?.groups ?? [];
  const years = data?.years ?? [];
  const stateInfo = data?.stateInfo ?? null;
  const stateComparison = data?.stateComparison ?? null;
  const stateGroupCharts = data?.stateGroupCharts ?? [];
  const stateMeasureChartsByGroup = data?.stateMeasureChartsByGroup ?? {};
  const nationalComparison = data?.nationalComparison ?? null;

  const stateGroupMap = useMemo(() => {
    if (!stateComparison) return null;
    const map = new Map<string, GroupDetail>();
    for (const gd of stateComparison.groupDetails) {
      map.set(gd.groupId, gd);
    }
    return map;
  }, [stateComparison]);

  const nationalGroupMap = useMemo(() => {
    if (!nationalComparison) return null;
    const map = new Map<string, GroupDetail>();
    for (const gd of nationalComparison.groupDetails) {
      map.set(gd.groupId, gd);
    }
    return map;
  }, [nationalComparison]);

  const hasChartData = useMemo(
    () => chartData.some((row) => groups.some((g) => row[g.id] !== null && row[g.id] !== undefined)),
    [chartData, groups]
  );

  const sectionAnchors = useMemo(() => {
    if (!data) return [];
    const anchors: { id: string; label: string }[] = [];

    if (hasChartData) {
      anchors.push({ id: "cg-yoy-chart", label: "Year-over-Year Overview" });
    }

    for (const group of groupDetails) {
      anchors.push({ id: `cg-table-${slugify(group.groupId)}`, label: `${group.groupLabel} — Table` });

      const hasGroupChart = stateGroupCharts.some((c) =>
        c.title?.toLowerCase().includes(group.groupLabel.toLowerCase())
      );
      if (hasGroupChart) {
        anchors.push({ id: `cg-state-${slugify(group.groupId)}`, label: `${group.groupLabel} — State Comparison` });
      }

      const measureCharts = stateMeasureChartsByGroup[group.groupId] ?? [];
      for (const chart of measureCharts) {
        const title = chart.title ?? "Measure";
        anchors.push({ id: `cg-measure-${slugify(group.groupId)}-${slugify(title)}`, label: title });
      }
    }

    return anchors;
  }, [data, hasChartData, groupDetails, stateGroupCharts, stateMeasureChartsByGroup]);

  useEffect(() => {
    if (sectionAnchors.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]) {
          setActiveSectionId(visible[0].target.id);
          return;
        }

        const nearest = entries
          .slice()
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))[0];
        if (nearest) setActiveSectionId(nearest.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0.1, 0.5, 0.75] }
    );

    sectionAnchors.forEach((a) => {
      const el = document.getElementById(a.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sectionAnchors]);

  useEffect(() => {
    if (sectionAnchors.length > 0) {
      setActiveSectionId((prev) => prev ?? sectionAnchors[0].id);
    }
  }, [sectionAnchors]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawerOpen]);

  const handleJump = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSectionId(id);
    setIsDrawerOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Analyzing condition group performance...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-400/30 bg-red-500/5 p-8 text-center">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="flex flex-col gap-8">
        {stateInfo && (
          <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 px-5 py-3">
            <p className="text-sm text-foreground">
              Comparing against{" "}
              <span className="font-semibold text-primary">
                {stateInfo.contractCount.toLocaleString()} contracts
              </span>{" "}
              in {stateInfo.stateName} ({stateInfo.stateCode}).
            </p>
            {sectionAnchors.length > 1 && (
              <button
                type="button"
                onClick={() => setIsDrawerOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-primary/10 px-4 py-2 text-xs font-medium text-primary shadow-sm transition hover:border-primary/70 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Jump to section
              </button>
            )}
          </div>
        )}

        {!stateInfo && sectionAnchors.length > 1 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-primary/10 px-4 py-2 text-xs font-medium text-primary shadow-sm transition hover:border-primary/70 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Jump to section
            </button>
          </div>
        )}

        {hasChartData && (
          <section id="cg-yoy-chart" className="rounded-3xl border border-border bg-card p-8">
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              Weighted Star Scores by Condition Group
            </h3>
            <p className="mb-6 text-xs text-muted-foreground">
              Weighted average star rating per group across years
            </p>
            <div className="w-full overflow-visible rounded-3xl border border-border/30 bg-slate-50/50 dark:bg-slate-900/40 px-5 pb-2 pt-5 shadow-sm">
              <ResponsiveContainer width="100%" height={420}>
                <BarChart data={chartData} margin={{ top: 30, right: 20, left: 10, bottom: 5 }}>
                  <XAxis
                    dataKey="year"
                    stroke="#64748b"
                    tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fill: "#475569", fontSize: 13, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 5]}
                    ticks={[0, 1, 2, 3, 4, 5]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(255,255,255,0.98)",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.3)",
                      color: "#1e293b",
                      padding: 12,
                    }}
                    labelStyle={{ color: "#1e293b", fontWeight: 600, fontSize: 14, marginBottom: 6 }}
                    itemStyle={{ color: "#475569", fontSize: 13 }}
                    formatter={(value: number) => value?.toFixed(2) ?? "N/A"}
                    cursor={false}
                  />
                  <Legend wrapperStyle={{ color: "#475569" }} />
                  {groups.map((group) => (
                    <Bar
                      key={group.id}
                      dataKey={group.id}
                      name={group.label}
                      fill={group.color}
                      isAnimationActive={false}
                      cursor="default"
                    >
                      <LabelList
                        dataKey={group.id}
                        position="top"
                        style={{ fill: "#facc15", fontSize: 12, fontWeight: 700 }}
                        formatter={(v: React.ReactNode) => {
                          const num = typeof v === "number" ? v : null;
                          return num != null ? `★ ${num.toFixed(2)}` : "";
                        }}
                      />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {groupDetails.map((group) => {
          const groupChart = stateGroupCharts.find((c) =>
            c.title?.toLowerCase().includes(group.groupLabel.toLowerCase())
          );
          const measureCharts = stateMeasureChartsByGroup[group.groupId] ?? [];

          return (
            <div key={group.groupId} className="flex flex-col gap-6">
              <div id={`cg-table-${slugify(group.groupId)}`}>
                <ConditionGroupTable
                  group={group}
                  years={years}
                  stateGroup={stateGroupMap?.get(group.groupId)}
                  stateComparison={stateComparison}
                  nationalGroup={nationalGroupMap?.get(group.groupId)}
                  nationalComparison={nationalComparison}
                />
              </div>

              {groupChart && (
                <section
                  id={`cg-state-${slugify(group.groupId)}`}
                  className="rounded-3xl border border-border bg-card p-8"
                >
                  <h3 className="mb-1 text-lg font-semibold text-foreground">
                    {group.groupLabel} — State Comparison
                  </h3>
                  <p className="mb-6 text-xs text-muted-foreground">
                    Individual contract weighted scores in {stateInfo?.stateName ?? "selected state"}
                  </p>
                  <ChartRenderer spec={groupChart} />
                </section>
              )}

              {measureCharts.length > 0 && (
                <div className="flex flex-col gap-6">
                  <div className="rounded-2xl border border-border/60 bg-muted/30 px-6 py-4">
                    <h4 className="text-sm font-semibold text-foreground">
                      {group.groupLabel} — Individual Measures
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Per-measure performance across contracts in {stateInfo?.stateName ?? "selected state"}
                    </p>
                  </div>
                  {measureCharts.map((chart, idx) => (
                    <section
                      key={`${group.groupId}-measure-${idx}`}
                      id={`cg-measure-${slugify(group.groupId)}-${slugify(chart.title ?? `measure-${idx}`)}`}
                      className="rounded-3xl border border-border bg-card p-8"
                    >
                      {chart.title && (
                        <h3 className="mb-4 text-lg font-semibold text-foreground">
                          {chart.title}
                        </h3>
                      )}
                      <ChartRenderer spec={chart} />
                    </section>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sectionAnchors.length > 1 && isDrawerOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Quick jump</p>
                <h3 className="text-lg font-semibold text-foreground">Navigate to a section</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-full border border-border bg-card p-2 text-muted-foreground transition hover:text-foreground"
                aria-label="Close navigation drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-2">
              {sectionAnchors.map((anchor) => {
                const isActive = activeSectionId === anchor.id;
                return (
                  <button
                    key={anchor.id}
                    type="button"
                    onClick={() => handleJump(anchor.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-2 text-sm transition ${
                      isActive
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-foreground hover:border-border/70"
                    }`}
                    title={anchor.label}
                  >
                    <span className="max-w-xs truncate text-left md:max-w-sm">{shortenLabel(anchor.label)}</span>
                    {isActive && <Check className="ml-3 h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
