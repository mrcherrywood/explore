/**
 * Client-only measure year-over-year movement export.
 * One detail row per client contract × measure × transition (2023→2024 … 2025→2026).
 * Dropped contracts (no to-year star) are excluded, matching band-movement rules.
 */

import {
  analyzeBandMovement,
  getAvailableOptions,
  type ContractMovementRow,
  type UnifiedMeasure,
} from "@/lib/band-movement/analysis";
import { loadClientContractIds } from "@/lib/band-movement/cut-point-methodology";

type StarRating = 1 | 2 | 3 | 4 | 5;

const STAR_RATINGS: StarRating[] = [1, 2, 3, 4, 5];

export type MovementLabel = "improved" | "held" | "declined";

export type ClientMeasureYoyDetailRow = {
  contractId: string;
  contractName: string;
  orgName: string;
  parentOrg: string;
  measureNormalized: string;
  measureDisplayName: string;
  measureCodeFrom: string | null;
  measureCodeTo: string | null;
  fromYear: number;
  toYear: number;
  fromScore: number | null;
  toScore: number | null;
  fromStar: StarRating;
  toStar: StarRating;
  scoreDelta: number | null;
  starDelta: number;
  movement: MovementLabel;
  fractionalFrom: number | null;
  fractionalTo: number | null;
  fractionalChange: number | null;
};

export type ClientMeasureYoySummaryRow = {
  measureNormalized: string;
  measureDisplayName: string;
  measureCodeFrom: string | null;
  measureCodeTo: string | null;
  fromYear: number;
  toYear: number;
  clientCount: number;
  improved: number;
  held: number;
  declined: number;
  improvedPct: number;
  heldPct: number;
  declinedPct: number;
  avgStarDelta: number | null;
  avgScoreDelta: number | null;
  scoreDeltaCount: number;
};

export type ClientMeasureYoyExportBundle = {
  generatedAt: string;
  clientContractCount: number;
  transitions: number[];
  detailRows: ClientMeasureYoyDetailRow[];
  summaryRows: ClientMeasureYoySummaryRow[];
};

export function classifyStarMovement(starDelta: number): MovementLabel {
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

function toDetailRow(
  measure: UnifiedMeasure,
  fromYear: number,
  toYear: number,
  row: ContractMovementRow
): ClientMeasureYoyDetailRow {
  const starDelta = row.starChange;
  const scoreDelta =
    row.fromScore !== null && row.toScore !== null ? row.toScore - row.fromScore : null;

  return {
    contractId: row.contractId,
    contractName: row.contractName,
    orgName: row.orgName,
    parentOrg: row.parentOrg,
    measureNormalized: measure.normalizedName,
    measureDisplayName: measure.displayName,
    measureCodeFrom: measure.codesByYear[fromYear] ?? null,
    measureCodeTo: measure.codesByYear[toYear] ?? null,
    fromYear,
    toYear,
    fromScore: row.fromScore,
    toScore: row.toScore,
    fromStar: row.fromStar,
    toStar: row.toStar,
    scoreDelta,
    starDelta,
    movement: classifyStarMovement(starDelta),
    fractionalFrom: row.fractionalFrom,
    fractionalTo: row.fractionalTo,
    fractionalChange: row.fractionalChange,
  };
}

function buildSummaryRows(detailRows: ClientMeasureYoyDetailRow[]): ClientMeasureYoySummaryRow[] {
  type Agg = {
    measureNormalized: string;
    measureDisplayName: string;
    measureCodeFrom: string | null;
    measureCodeTo: string | null;
    fromYear: number;
    toYear: number;
    improved: number;
    held: number;
    declined: number;
    starDeltaSum: number;
    scoreDeltaSum: number;
    scoreDeltaCount: number;
  };

  const map = new Map<string, Agg>();

  for (const row of detailRows) {
    const key = `${row.measureNormalized}|${row.fromYear}`;
    let agg = map.get(key);
    if (!agg) {
      agg = {
        measureNormalized: row.measureNormalized,
        measureDisplayName: row.measureDisplayName,
        measureCodeFrom: row.measureCodeFrom,
        measureCodeTo: row.measureCodeTo,
        fromYear: row.fromYear,
        toYear: row.toYear,
        improved: 0,
        held: 0,
        declined: 0,
        starDeltaSum: 0,
        scoreDeltaSum: 0,
        scoreDeltaCount: 0,
      };
      map.set(key, agg);
    }

    if (row.movement === "improved") agg.improved += 1;
    else if (row.movement === "declined") agg.declined += 1;
    else agg.held += 1;

    agg.starDeltaSum += row.starDelta;
    if (row.scoreDelta !== null) {
      agg.scoreDeltaSum += row.scoreDelta;
      agg.scoreDeltaCount += 1;
    }
  }

  return [...map.values()]
    .map((agg) => {
      const clientCount = agg.improved + agg.held + agg.declined;
      return {
        measureNormalized: agg.measureNormalized,
        measureDisplayName: agg.measureDisplayName,
        measureCodeFrom: agg.measureCodeFrom,
        measureCodeTo: agg.measureCodeTo,
        fromYear: agg.fromYear,
        toYear: agg.toYear,
        clientCount,
        improved: agg.improved,
        held: agg.held,
        declined: agg.declined,
        improvedPct: clientCount === 0 ? 0 : round1((agg.improved / clientCount) * 100),
        heldPct: clientCount === 0 ? 0 : round1((agg.held / clientCount) * 100),
        declinedPct: clientCount === 0 ? 0 : round1((agg.declined / clientCount) * 100),
        avgStarDelta: clientCount === 0 ? null : round3(agg.starDeltaSum / clientCount),
        avgScoreDelta:
          agg.scoreDeltaCount === 0 ? null : round3(agg.scoreDeltaSum / agg.scoreDeltaCount),
        scoreDeltaCount: agg.scoreDeltaCount,
      };
    })
    .sort(
      (a, b) =>
        a.fromYear - b.fromYear ||
        a.measureDisplayName.localeCompare(b.measureDisplayName)
    );
}

export function buildClientMeasureYoyExport(
  clientIds: Set<string> = loadClientContractIds()
): ClientMeasureYoyExportBundle {
  const { measures, transitions } = getAvailableOptions();
  const detailRows: ClientMeasureYoyDetailRow[] = [];

  for (const measure of measures) {
    for (const fromYear of transitions) {
      const toYear = fromYear + 1;
      for (const star of STAR_RATINGS) {
        const result = analyzeBandMovement(measure.normalizedName, star, fromYear);
        for (const row of result.contracts) {
          if (!clientIds.has(row.contractId)) continue;
          detailRows.push(toDetailRow(measure, fromYear, toYear, row));
        }
      }
    }
  }

  detailRows.sort(
    (a, b) =>
      a.fromYear - b.fromYear ||
      a.measureDisplayName.localeCompare(b.measureDisplayName) ||
      a.parentOrg.localeCompare(b.parentOrg) ||
      a.contractId.localeCompare(b.contractId)
  );

  return {
    generatedAt: new Date().toISOString(),
    clientContractCount: clientIds.size,
    transitions: [...transitions],
    detailRows,
    summaryRows: buildSummaryRows(detailRows),
  };
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Per-contract client measure movement (one row per contract × measure × transition). */
export function clientMeasureYoyDetailToCsv(bundle: ClientMeasureYoyExportBundle): string {
  const headers = [
    "contract_id",
    "contract_name",
    "organization",
    "parent_organization",
    "measure_display_name",
    "measure_normalized",
    "measure_code_from",
    "measure_code_to",
    "from_year",
    "to_year",
    "from_score",
    "to_score",
    "from_star",
    "to_star",
    "score_delta",
    "star_delta",
    "movement",
    "fractional_from",
    "fractional_to",
    "fractional_change",
  ];

  const lines = [headers.join(",")];
  for (const row of bundle.detailRows) {
    lines.push(
      [
        csvEscape(row.contractId),
        csvEscape(row.contractName),
        csvEscape(row.orgName),
        csvEscape(row.parentOrg),
        csvEscape(row.measureDisplayName),
        csvEscape(row.measureNormalized),
        csvEscape(row.measureCodeFrom),
        csvEscape(row.measureCodeTo),
        csvEscape(row.fromYear),
        csvEscape(row.toYear),
        row.fromScore === null ? "" : csvEscape(row.fromScore),
        row.toScore === null ? "" : csvEscape(row.toScore),
        csvEscape(row.fromStar),
        csvEscape(row.toStar),
        row.scoreDelta === null ? "" : csvEscape(row.scoreDelta),
        csvEscape(row.starDelta),
        csvEscape(row.movement),
        row.fractionalFrom === null ? "" : csvEscape(row.fractionalFrom),
        row.fractionalTo === null ? "" : csvEscape(row.fractionalTo),
        row.fractionalChange === null ? "" : csvEscape(row.fractionalChange),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Measure-level client rollup (Declined / Held / Improved counts and averages). */
export function clientMeasureYoySummaryToCsv(bundle: ClientMeasureYoyExportBundle): string {
  const headers = [
    "measure_display_name",
    "measure_normalized",
    "measure_code_from",
    "measure_code_to",
    "from_year",
    "to_year",
    "client_count",
    "declined",
    "held",
    "improved",
    "declined_pct",
    "held_pct",
    "improved_pct",
    "avg_star_delta",
    "avg_score_delta",
    "score_delta_count",
  ];

  const lines = [headers.join(",")];
  for (const row of bundle.summaryRows) {
    lines.push(
      [
        csvEscape(row.measureDisplayName),
        csvEscape(row.measureNormalized),
        csvEscape(row.measureCodeFrom),
        csvEscape(row.measureCodeTo),
        csvEscape(row.fromYear),
        csvEscape(row.toYear),
        csvEscape(row.clientCount),
        csvEscape(row.declined),
        csvEscape(row.held),
        csvEscape(row.improved),
        csvEscape(row.declinedPct),
        csvEscape(row.heldPct),
        csvEscape(row.improvedPct),
        row.avgStarDelta === null ? "" : csvEscape(row.avgStarDelta),
        row.avgScoreDelta === null ? "" : csvEscape(row.avgScoreDelta),
        csvEscape(row.scoreDeltaCount),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}
