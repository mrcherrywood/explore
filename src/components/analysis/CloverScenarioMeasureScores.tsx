"use client";

import { useMemo, useRef, useState } from "react";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import type { CloverContractImpact, CloverImpactResult } from "@/lib/clover-impact/analysis";
import type { CloverComputedScenarioId } from "@/lib/clover-impact/scenarios";

const SCENARIO_IDS: CloverComputedScenarioId[] = ["officialRecalc", "s29Removal", "model1", "model2"];

type MeasureFilter = "all" | "removed" | "kept";

const MEASURE_FILTERS: Array<{ id: MeasureFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "removed", label: "Removed" },
  { id: "kept", label: "Kept" },
];

type Props = {
  contract: CloverContractImpact;
  scenarios: CloverImpactResult["computedScenarios"];
};

function formatStar(value: number): string {
  return value.toFixed(0);
}

function weightedStars(measures: Array<{ starValue: number; weight: number }>): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const measure of measures) {
    if (measure.weight > 0) {
      weightedSum += measure.starValue * measure.weight;
      totalWeight += measure.weight;
    }
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function formatStarScore(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(2)}★`;
}

function formatNumber(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function formatSigned(value: number | null): string {
  return value === null ? "-" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function formatMeasureValue(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.includes("%")) return value;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : value;
}

export function CloverScenarioMeasureScores({ contract, scenarios }: Props) {
  const [activeScenarioId, setActiveScenarioId] = useState<CloverComputedScenarioId>("officialRecalc");
  const [measureFilter, setMeasureFilter] = useState<MeasureFilter>("all");
  const tableRef = useRef<HTMLTableElement>(null);

  const scenarioOptions = useMemo(
    () => scenarios.filter((scenario) => SCENARIO_IDS.includes(scenario.id)),
    [scenarios],
  );
  const activeScenario = scenarioOptions.find((scenario) => scenario.id === activeScenarioId) ?? scenarioOptions[0];
  const measureScores = contract.scenarioMeasureScores ?? {};
  const allMeasures = activeScenario ? measureScores[activeScenario.id] ?? [] : [];
  const removedMeasures = useMemo(() => allMeasures.filter((measure) => measure.removed), [allMeasures]);
  const keptMeasures = useMemo(() => allMeasures.filter((measure) => !measure.removed), [allMeasures]);
  const removedCount = removedMeasures.length;
  const keptCount = keptMeasures.length;
  const scoreByFilter = useMemo<Record<MeasureFilter, number | null>>(
    () => ({
      all: weightedStars(allMeasures),
      removed: weightedStars(removedMeasures),
      kept: weightedStars(keptMeasures),
    }),
    [allMeasures, removedMeasures, keptMeasures],
  );
  const measures = useMemo(
    () =>
      measureFilter === "all" ? allMeasures : measureFilter === "removed" ? removedMeasures : keptMeasures,
    [allMeasures, removedMeasures, keptMeasures, measureFilter],
  );
  const detail = activeScenario ? contract.scenarioDetails[activeScenario.id] ?? null : null;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Scenario Measure Scores</h3>
          <p className="text-xs text-muted-foreground">
            {contract.contractId} - measures removed from and kept in each scenario&apos;s calculation
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted p-1">
            {scenarioOptions.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => setActiveScenarioId(scenario.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeScenario?.id === scenario.id
                    ? "border border-primary/40 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {scenario.shortLabel}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted p-1">
            {MEASURE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setMeasureFilter(filter.id)}
                title={`Weighted mean star score across ${filter.label.toLowerCase()} measures`}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  measureFilter === filter.id
                    ? "border border-primary/40 bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {filter.label}{" "}
                <span className="font-mono">{formatStarScore(scoreByFilter[filter.id])}</span>
              </button>
            ))}
          </div>
          <ExportCsvButton
            tableRef={tableRef}
            fileName={`clover-measures-${contract.contractId}-${activeScenario?.id ?? "scenario"}-${measureFilter}`}
          />
        </div>
      </div>

      <div className="border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        {activeScenario ? (
          <>
            <span className="font-medium text-foreground">{activeScenario.label}</span>
            <span className="mx-2">-</span>
            <span className="text-rose-500">
              {removedCount} removed (<span className="font-mono">{formatStarScore(scoreByFilter.removed)}</span>)
            </span>
            <span className="mx-2">/</span>
            <span className="text-emerald-500">
              {keptCount} kept (<span className="font-mono">{formatStarScore(scoreByFilter.kept)}</span>)
            </span>
            <span className="mx-2">-</span>
            <span>
              {allMeasures.length} total (<span className="font-mono">{formatStarScore(scoreByFilter.all)}</span>)
            </span>
          </>
        ) : null}
      </div>

      {detail && detail.score !== null ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Score buildup:</span>
          <span title="Weighted mean of the kept measures' stars (the base mean used in the rating).">
            Base mean <span className="font-mono text-foreground">{formatNumber(detail.baseMean)}</span>
          </span>
          <span>+</span>
          <span title="Reward factor (+0.1 to +0.4) from the mean/variance percentile thresholds.">
            Reward factor <span className="font-mono text-foreground">{formatSigned(detail.rewardFactor)}</span>
          </span>
          <span>+</span>
          <span title="Categorical Adjustment Index applied after the reward factor.">
            CAI <span className="font-mono text-foreground">{formatSigned(detail.caiValue)}</span>
          </span>
          <span>=</span>
          <span className="font-semibold text-foreground" title="Calculated scenario score before hold-harmless rounding.">
            <span className="font-mono">{formatNumber(detail.score)}</span>
            <span className="ml-1 font-mono text-muted-foreground">({roundToHalf(detail.score).toFixed(1)}★)</span>
          </span>
          {detail.holdHarmlessApplied ? (
            <span className="ml-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500" title="The base mean uses the without-QI calculation because dropping the QI measure lifts this contract to 4+ stars.">
              QI hold-harmless
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-left" title="Whether the measure is removed from or kept in this scenario's calculation">Status</th>
              <th className="px-4 py-3 text-left" title="CMS measure code">Code</th>
              <th className="px-4 py-3 text-left" title="CMS measure name">Measure</th>
              <th className="px-4 py-3 text-left" title="Part C or Part D">Part</th>
              <th className="px-4 py-3 text-right" title="Underlying measure score/rate from CMS measure data">Score</th>
              <th className="px-4 py-3 text-right" title="Measure-level star rating used in the scenario calculation">Stars</th>
              <th className="px-4 py-3 text-right" title="CMS weight used in the weighted score calculation">Weight</th>
            </tr>
          </thead>
          <tbody>
            {measures.map((measure, index) => (
              <tr
                key={`${activeScenario?.id}-${measure.code}`}
                className={`border-b border-border/50 ${index % 2 === 0 ? "" : "bg-muted/10"}`}
              >
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      measure.removed ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                    }`}
                  >
                    {measure.removed ? "Removed" : "Kept"}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-primary">{measure.code}</td>
                <td className="px-4 py-3 text-foreground">{measure.name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{measure.category}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatMeasureValue(measure.measureValue)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatStar(measure.starValue)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{measure.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {measures.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No {measureFilter === "all" ? "" : `${measureFilter} `}measures found for this scenario.
        </div>
      ) : null}
    </section>
  );
}
