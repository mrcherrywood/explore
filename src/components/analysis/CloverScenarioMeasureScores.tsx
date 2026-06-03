"use client";

import { useMemo, useState } from "react";
import type { CloverContractImpact, CloverImpactResult } from "@/lib/clover-impact/analysis";
import type { CloverComputedScenarioId } from "@/lib/clover-impact/scenarios";

const SCENARIO_IDS: CloverComputedScenarioId[] = ["s29Removal", "model1", "model2"];

type Props = {
  contract: CloverContractImpact;
  scenarios: CloverImpactResult["computedScenarios"];
};

function formatStar(value: number): string {
  return value.toFixed(0);
}

function formatMeasureValue(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.includes("%")) return value;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed.toFixed(2) : value;
}

export function CloverScenarioMeasureScores({ contract, scenarios }: Props) {
  const [activeScenarioId, setActiveScenarioId] = useState<CloverComputedScenarioId>("s29Removal");

  const scenarioOptions = useMemo(
    () => scenarios.filter((scenario) => SCENARIO_IDS.includes(scenario.id)),
    [scenarios],
  );
  const activeScenario = scenarioOptions.find((scenario) => scenario.id === activeScenarioId) ?? scenarioOptions[0];
  const measureScores = contract.scenarioMeasureScores ?? {};
  const measures = activeScenario ? measureScores[activeScenario.id] ?? [] : [];
  const detail = activeScenario ? contract.scenarioDetails[activeScenario.id] : null;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Removed Measure Scores</h3>
          <p className="text-xs text-muted-foreground">
            {contract.contractId} - measures removed from each scenario&apos;s calculation
          </p>
        </div>
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
      </div>

      <div className="border-b border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        {activeScenario ? (
          <>
            <span className="font-medium text-foreground">{activeScenario.label}</span>
            <span className="mx-2">-</span>
            <span>{measures.length} removed measures</span>
            {detail ? (
              <>
                <span className="mx-2">-</span>
                <span>{detail.measureCount} measures remain in the calculation</span>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
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
          No removed measures found for this scenario.
        </div>
      ) : null}
    </section>
  );
}
