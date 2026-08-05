"use client";

import { useState } from "react";

import type {
  PlanPreviewFinalScore,
  PlanPreviewFinalScoresResult,
  PlanPreviewScenarioId,
} from "@/lib/plan-preview/final-scores";

function formatNumber(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

function formatCai(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(6)}`;
}

function ThresholdPill({ label, thresholds }: {
  label: string;
  thresholds: PlanPreviewFinalScoresResult["thresholds"]["withQi"];
}) {
  if (!thresholds) return null;
  return (
    <span className="fep-pill">
      {label}: mean P65 {thresholds.mean65th.toFixed(3)} / P85 {thresholds.mean85th.toFixed(3)} · var
      P30 {thresholds.variance30th.toFixed(3)} / P70 {thresholds.variance70th.toFixed(3)}
    </span>
  );
}

function ScoreRow({ contract }: { contract: PlanPreviewFinalScore }) {
  const selected =
    contract.selectedLeg === "with_qi" ? contract.withQi
    : contract.selectedLeg === "without_qi" ? contract.withoutQi
    : null;

  return (
    <tr>
      <td className="l" style={{ maxWidth: 280, whiteSpace: "normal", lineHeight: 1.35 }}>
        <span style={{ fontWeight: 600, color: "var(--fep-ink)" }}>{contract.contractId}</span>
        {contract.contractName ? (
          <span style={{ color: "var(--fep-faint)" }}> — {contract.contractName}</span>
        ) : null}
      </td>
      {contract.qualifiesOverall && selected ? (
        <>
          <td>{selected.measureCount}</td>
          <td style={{ fontWeight: 700, color: "var(--fep-ink)" }}>
            {formatNumber(selected.baseMean)}
          </td>
          <td>
            {selected.rewardFactor > 0 ? (
              <span className="fep-pill">+{selected.rewardFactor.toFixed(1)}</span>
            ) : (
              "0"
            )}
          </td>
          <td>{formatCai(contract.caiValue)}</td>
          <td style={{ fontWeight: 700, color: "var(--fep-ink)" }}>
            {formatNumber(contract.finalScoreRaw)}
          </td>
          <td>
            {contract.finalRating !== null ? (
              <span className="fep-pill">{contract.finalRating.toFixed(1)}★</span>
            ) : (
              "—"
            )}
          </td>
        </>
      ) : (
        <td className="l" colSpan={6} style={{ color: "var(--fep-faint)", whiteSpace: "normal" }}>
          {contract.reason}
        </td>
      )}
    </tr>
  );
}

export function PlanPreviewFinalScores({
  scenarios,
}: {
  scenarios: PlanPreviewFinalScoresResult[];
}) {
  const [scenarioId, setScenarioId] = useState<PlanPreviewScenarioId>("baseline");
  const data = scenarios.find((scenario) => scenario.id === scenarioId) ?? scenarios[0];
  if (!data) return null;

  return (
    <div className="border-t" style={{ borderColor: "var(--fep-row-border)" }}>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-5">
        <p className="fep-label" style={{ marginRight: 6 }}>
          Predicted final scores
        </p>
        <select
          className="fep-select"
          value={data.id}
          onChange={(event) => setScenarioId(event.target.value as PlanPreviewScenarioId)}
        >
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.label}
            </option>
          ))}
        </select>
        <ThresholdPill label="No QI" thresholds={data.thresholds.withoutQi} />
        {data.populationSize > 0 ? (
          <span className="fep-pill">{data.populationSize.toLocaleString()} contracts in population</span>
        ) : null}
      </div>
      <p className="px-5 pb-4 text-xs" style={{ color: "var(--fep-faint)", maxWidth: 720 }}>
        {data.description}
      </p>

      <div className="overflow-x-auto">
        <table className="fep-table">
          <thead>
            <tr>
              <th className="l">Contract</th>
              <th>Measures</th>
              <th>Base mean</th>
              <th>Reward factor</th>
              <th>CAI</th>
              <th>Final score (no QI)</th>
              <th>Predicted rating</th>
            </tr>
          </thead>
          <tbody>
            {data.contracts.map((contract) => (
              <ScoreRow key={contract.contractId} contract={contract} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 pb-5 pt-3">
        {data.notes.map((note) => (
          <p key={note} className="text-xs" style={{ color: "var(--fep-faint)", marginTop: 4 }}>
            {note}
          </p>
        ))}
      </div>
    </div>
  );
}
