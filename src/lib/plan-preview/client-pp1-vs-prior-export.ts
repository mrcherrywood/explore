/**
 * Client-only comparison of prior-year published finals vs Plan Preview 1 scores.
 * Same baseline join as the PP1 contract report (publishedBaselineScore / Star).
 */

import {
  getMeasureYearScoreSamples,
} from "@/lib/band-movement/analysis";
import { loadClientContractIds } from "@/lib/band-movement/cut-point-methodology";
import { loadMeasureStarsFromFile } from "@/lib/reward-factor/backtest";

import { toBaselineMeasureCode } from "./measure-resolve";
import type {
  PlanPreviewContractPrediction,
  PlanPreviewPredictionsResult,
  PlanPreviewStarSource,
} from "./predictions";

export type ScoreMovementLabel = "improved" | "held" | "declined";

export type ClientPp1VsPriorDetailRow = {
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  measureDisplayName: string;
  measureNormalized: string;
  measureCodePp1: string;
  measureCodePrior: string;
  priorYear: number;
  pp1StarsYear: number;
  priorFinalScore: number | null;
  priorFinalStar: number | null;
  pp1Score: number | null;
  pp1PredictedStar: number | null;
  starSource: PlanPreviewStarSource | null;
  scoreDelta: number | null;
  starDelta: number | null;
  movement: ScoreMovementLabel | null;
};

export type ClientPp1VsPriorSummaryRow = {
  measureDisplayName: string;
  measureNormalized: string;
  measureCodePp1: string;
  measureCodePrior: string;
  priorYear: number;
  pp1StarsYear: number;
  clientCount: number;
  withPriorScore: number;
  withPriorStar: number;
  withPredictedStar: number;
  improved: number;
  held: number;
  declined: number;
  improvedPct: number;
  heldPct: number;
  declinedPct: number;
  avgScoreDelta: number | null;
  avgStarDelta: number | null;
};

export type ClientPp1VsPriorExportBundle = {
  generatedAt: string;
  pp1StarsYear: number;
  priorYear: number | null;
  clientContractCount: number;
  accruedClientContractCount: number;
  missingFromPp1Count: number;
  detailRows: ClientPp1VsPriorDetailRow[];
  summaryRows: ClientPp1VsPriorSummaryRow[];
};

export function classifyStarMovement(starDelta: number): ScoreMovementLabel {
  if (starDelta > 0) return "improved";
  if (starDelta < 0) return "declined";
  return "held";
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function roundScoreDelta(value: number): number {
  return Number(value.toFixed(6));
}

function buildPriorScoreMaps(
  measureNormalizedList: string[],
  priorYear: number
): Map<string, Map<string, number>> {
  const byMeasure = new Map<string, Map<string, number>>();
  for (const measureNormalized of measureNormalizedList) {
    const map = new Map<string, number>();
    for (const sample of getMeasureYearScoreSamples(measureNormalized, priorYear)) {
      map.set(sample.contractId, sample.score);
    }
    byMeasure.set(measureNormalized, map);
  }
  return byMeasure;
}

function buildSummaryRows(detailRows: ClientPp1VsPriorDetailRow[]): ClientPp1VsPriorSummaryRow[] {
  type Agg = {
    measureDisplayName: string;
    measureNormalized: string;
    measureCodePp1: string;
    measureCodePrior: string;
    priorYear: number;
    pp1StarsYear: number;
    clientCount: number;
    withPriorScore: number;
    withPriorStar: number;
    withPredictedStar: number;
    improved: number;
    held: number;
    declined: number;
    scoreDeltaSum: number;
    scoreDeltaCount: number;
    starDeltaSum: number;
    starDeltaCount: number;
  };

  const map = new Map<string, Agg>();

  for (const row of detailRows) {
    const key = row.measureNormalized;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        measureDisplayName: row.measureDisplayName,
        measureNormalized: row.measureNormalized,
        measureCodePp1: row.measureCodePp1,
        measureCodePrior: row.measureCodePrior,
        priorYear: row.priorYear,
        pp1StarsYear: row.pp1StarsYear,
        clientCount: 0,
        withPriorScore: 0,
        withPriorStar: 0,
        withPredictedStar: 0,
        improved: 0,
        held: 0,
        declined: 0,
        scoreDeltaSum: 0,
        scoreDeltaCount: 0,
        starDeltaSum: 0,
        starDeltaCount: 0,
      };
      map.set(key, agg);
    }

    agg.clientCount += 1;
    if (row.priorFinalScore !== null) agg.withPriorScore += 1;
    if (row.priorFinalStar !== null) agg.withPriorStar += 1;
    if (row.pp1PredictedStar !== null) agg.withPredictedStar += 1;
    if (row.movement === "improved") agg.improved += 1;
    else if (row.movement === "held") agg.held += 1;
    else if (row.movement === "declined") agg.declined += 1;
    if (row.scoreDelta !== null) {
      agg.scoreDeltaSum += row.scoreDelta;
      agg.scoreDeltaCount += 1;
    }
    if (row.starDelta !== null) {
      agg.starDeltaSum += row.starDelta;
      agg.starDeltaCount += 1;
    }
  }

  return [...map.values()]
    .map((agg) => {
      const moved = agg.improved + agg.held + agg.declined;
      return {
        measureDisplayName: agg.measureDisplayName,
        measureNormalized: agg.measureNormalized,
        measureCodePp1: agg.measureCodePp1,
        measureCodePrior: agg.measureCodePrior,
        priorYear: agg.priorYear,
        pp1StarsYear: agg.pp1StarsYear,
        clientCount: agg.clientCount,
        withPriorScore: agg.withPriorScore,
        withPriorStar: agg.withPriorStar,
        withPredictedStar: agg.withPredictedStar,
        improved: agg.improved,
        held: agg.held,
        declined: agg.declined,
        improvedPct: moved === 0 ? 0 : round1((agg.improved / moved) * 100),
        heldPct: moved === 0 ? 0 : round1((agg.held / moved) * 100),
        declinedPct: moved === 0 ? 0 : round1((agg.declined / moved) * 100),
        avgScoreDelta:
          agg.scoreDeltaCount === 0 ? null : round3(agg.scoreDeltaSum / agg.scoreDeltaCount),
        avgStarDelta:
          agg.starDeltaCount === 0 ? null : round3(agg.starDeltaSum / agg.starDeltaCount),
      };
    })
    .sort((a, b) => a.measureDisplayName.localeCompare(b.measureDisplayName));
}

/**
 * Join accrued PP1 predictions to prior-year published finals for client contracts.
 */
export function buildClientPp1VsPriorExport(
  predictions: PlanPreviewPredictionsResult,
  clientIds: Set<string> = loadClientContractIds()
): ClientPp1VsPriorExportBundle {
  const priorYear = predictions.baselineYear;
  const pp1StarsYear = predictions.starsYear;

  const clientContracts = predictions.contracts.filter((contract) =>
    clientIds.has(contract.contractId)
  );
  const accruedClientIds = new Set(clientContracts.map((c) => c.contractId));
  const missingFromPp1Count = [...clientIds].filter((id) => !accruedClientIds.has(id)).length;

  if (priorYear === null) {
    return {
      generatedAt: new Date().toISOString(),
      pp1StarsYear,
      priorYear: null,
      clientContractCount: clientIds.size,
      accruedClientContractCount: clientContracts.length,
      missingFromPp1Count,
      detailRows: [],
      summaryRows: [],
    };
  }

  const measureNormalizedList = [
    ...new Set(
      clientContracts.flatMap((contract) =>
        contract.measures.map((measure) => measure.measureNormalized)
      )
    ),
  ];
  const priorScoresByMeasure = buildPriorScoreMaps(measureNormalizedList, priorYear);
  const priorStarsByContract = loadMeasureStarsFromFile(priorYear);

  const detailRows: ClientPp1VsPriorDetailRow[] = [];

  for (const contract of clientContracts) {
    const priorStars = priorStarsByContract.get(contract.contractId) ?? [];
    const priorStarByCode = new Map(
      priorStars.map((measure) => [measure.code.toUpperCase(), measure.starValue])
    );

    for (const measure of contract.measures) {
      const measureCodePrior = toBaselineMeasureCode(
        measure.measureNormalized,
        measure.measureCode,
        priorYear
      );
      const priorFinalScore =
        priorScoresByMeasure.get(measure.measureNormalized)?.get(contract.contractId) ?? null;
      const priorFinalStar = priorStarByCode.get(measureCodePrior) ?? null;
      const scoreDelta =
        priorFinalScore !== null && measure.score !== null
          ? roundScoreDelta(measure.score - priorFinalScore)
          : null;
      const starDelta =
        priorFinalStar !== null && measure.predictedStar !== null
          ? measure.predictedStar - priorFinalStar
          : null;

      detailRows.push({
        contractId: contract.contractId,
        contractName: contract.contractName,
        parentOrganization: contract.parentOrganization,
        measureDisplayName: measure.displayName,
        measureNormalized: measure.measureNormalized,
        measureCodePp1: measure.measureCode,
        measureCodePrior,
        priorYear,
        pp1StarsYear,
        priorFinalScore,
        priorFinalStar,
        pp1Score: measure.score,
        pp1PredictedStar: measure.predictedStar,
        starSource: measure.starSource,
        scoreDelta,
        starDelta,
        movement: starDelta === null ? null : classifyStarMovement(starDelta),
      });
    }
  }

  detailRows.sort(
    (a, b) =>
      a.measureDisplayName.localeCompare(b.measureDisplayName) ||
      (a.parentOrganization ?? "").localeCompare(b.parentOrganization ?? "") ||
      a.contractId.localeCompare(b.contractId)
  );

  return {
    generatedAt: new Date().toISOString(),
    pp1StarsYear,
    priorYear,
    clientContractCount: clientIds.size,
    accruedClientContractCount: clientContracts.length,
    missingFromPp1Count,
    detailRows,
    summaryRows: buildSummaryRows(detailRows),
  };
}

/** Convenience when you already have the filtered contract list. */
export function listClientContractsInPredictions(
  predictions: PlanPreviewPredictionsResult,
  clientIds: Set<string>
): PlanPreviewContractPrediction[] {
  return predictions.contracts.filter((contract) => clientIds.has(contract.contractId));
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function clientPp1VsPriorDetailToCsv(bundle: ClientPp1VsPriorExportBundle): string {
  const headers = [
    "contract_id",
    "contract_name",
    "parent_organization",
    "measure_display_name",
    "measure_normalized",
    "measure_code_pp1",
    "measure_code_prior",
    "prior_year",
    "pp1_stars_year",
    "prior_final_score",
    "prior_final_star",
    "pp1_score",
    "pp1_predicted_star",
    "star_source",
    "score_delta",
    "star_delta",
    "movement",
  ];

  const lines = [headers.join(",")];
  for (const row of bundle.detailRows) {
    lines.push(
      [
        csvEscape(row.contractId),
        csvEscape(row.contractName),
        csvEscape(row.parentOrganization),
        csvEscape(row.measureDisplayName),
        csvEscape(row.measureNormalized),
        csvEscape(row.measureCodePp1),
        csvEscape(row.measureCodePrior),
        csvEscape(row.priorYear),
        csvEscape(row.pp1StarsYear),
        row.priorFinalScore === null ? "" : csvEscape(row.priorFinalScore),
        row.priorFinalStar === null ? "" : csvEscape(row.priorFinalStar),
        csvEscape(row.pp1Score),
        row.pp1PredictedStar === null ? "" : csvEscape(row.pp1PredictedStar),
        csvEscape(row.starSource),
        row.scoreDelta === null ? "" : csvEscape(row.scoreDelta),
        row.starDelta === null ? "" : csvEscape(row.starDelta),
        csvEscape(row.movement),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function clientPp1VsPriorSummaryToCsv(bundle: ClientPp1VsPriorExportBundle): string {
  const headers = [
    "measure_display_name",
    "measure_normalized",
    "measure_code_pp1",
    "measure_code_prior",
    "prior_year",
    "pp1_stars_year",
    "client_count",
    "with_prior_score",
    "with_prior_star",
    "with_predicted_star",
    "declined",
    "held",
    "improved",
    "declined_pct",
    "held_pct",
    "improved_pct",
    "avg_score_delta",
    "avg_star_delta",
  ];

  const lines = [headers.join(",")];
  for (const row of bundle.summaryRows) {
    lines.push(
      [
        csvEscape(row.measureDisplayName),
        csvEscape(row.measureNormalized),
        csvEscape(row.measureCodePp1),
        csvEscape(row.measureCodePrior),
        csvEscape(row.priorYear),
        csvEscape(row.pp1StarsYear),
        csvEscape(row.clientCount),
        csvEscape(row.withPriorScore),
        csvEscape(row.withPriorStar),
        csvEscape(row.withPredictedStar),
        csvEscape(row.declined),
        csvEscape(row.held),
        csvEscape(row.improved),
        csvEscape(row.declinedPct),
        csvEscape(row.heldPct),
        csvEscape(row.improvedPct),
        row.avgScoreDelta === null ? "" : csvEscape(row.avgScoreDelta),
        row.avgStarDelta === null ? "" : csvEscape(row.avgStarDelta),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}
