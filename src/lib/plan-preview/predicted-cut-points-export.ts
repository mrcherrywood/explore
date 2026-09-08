import type { CsvData } from "@/lib/export/csv";
import { generateCsvString } from "@/lib/export/csv";

import type {
  CutPointAdditionDetailRow,
  CutPointAdditionSummary,
} from "./cut-point-drivers";
import type { PlanPreviewCutPointPrediction } from "./predictions";

const THRESHOLD_ORDER = [
  "fiveStar",
  "fourStar",
  "threeStar",
  "twoStar",
] as const;

const STAR_LABELS: Record<(typeof THRESHOLD_ORDER)[number], string> = {
  fiveStar: "5 Star",
  fourStar: "4 Star",
  threeStar: "3 Star",
  twoStar: "2 Star",
};

const SOURCE_LABELS: Record<PlanPreviewCutPointPrediction["source"], string> = {
  official: "Official",
  workbook_forecast: "Manual",
  model: "Full Market",
};

const STATUS_LABELS: Record<PlanPreviewCutPointPrediction["status"], string> = {
  ready: "Ready",
  unavailable: "Unavailable",
  unsupported: "Excluded",
};

export const PREDICTED_CUT_POINTS_CSV_HEADERS = [
  "Measure Code",
  "Measure",
  "Lower is Better",
  "Source",
  "Status",
  "Accrued",
  "Market",
  ...THRESHOLD_ORDER.flatMap((key) => [
    STAR_LABELS[key],
    `${STAR_LABELS[key]} Full Market`,
    `${STAR_LABELS[key]} Client Only`,
    `${STAR_LABELS[key]} Delta`,
  ]),
  "Warnings",
  "Notes",
] as const;

export const PREDICTED_CUT_POINTS_ADDITION_SUMMARY_HEADERS = [
  "Added since last run",
  ...THRESHOLD_ORDER.flatMap((key) => [
    `${STAR_LABELS[key]} Full Market prior`,
    `${STAR_LABELS[key]} Full Market delta`,
    `${STAR_LABELS[key]} Client Only prior`,
    `${STAR_LABELS[key]} Client Only delta`,
  ]),
  "Driver parents",
  "Addition notes",
] as const;

const ROLE_LABELS: Record<CutPointAdditionDetailRow["role"], string> = {
  forecast: "forecast",
  pp1_fill: "Plan Preview fill",
  pp1_override: "Plan Preview override",
};

export const PREDICTED_CUT_POINTS_ADDITIONS_HEADERS = [
  "Measure Code",
  "Measure",
  "Contract",
  "Contract Name",
  "Parent Organization",
  "Role",
  "New to market",
  "Current score",
  "Prior score",
  "Score delta",
  "Manual star",
  "Full Market star",
] as const;

function cell(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function notesFor(cutPoint: PlanPreviewCutPointPrediction): string {
  const parts = [cutPoint.reason, ...cutPoint.notes].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  return parts.join("; ");
}

export function buildPredictedCutPointsCsv(
  cutPoints: PlanPreviewCutPointPrediction[],
  additionsByMeasure?: Map<string, CutPointAdditionSummary>,
): CsvData {
  const rows = cutPoints.map((cutPoint) => {
    const thresholdByKey = new Map(
      (cutPoint.thresholds ?? []).map((item) => [item.key, item] as const),
    );
    const fullMarketByKey = new Map(
      (cutPoint.fullMarketThresholds ?? cutPoint.modelThresholds ?? []).map(
        (item) => [item.key, item] as const,
      ),
    );
    const clientOnlyByKey = new Map(
      (cutPoint.clientOnlyThresholds ?? []).map(
        (item) => [item.key, item] as const,
      ),
    );

    const thresholdCells = THRESHOLD_ORDER.flatMap((key) => {
      const threshold = thresholdByKey.get(key);
      const fullMarket = fullMarketByKey.get(key);
      const clientOnly = clientOnlyByKey.get(key);
      return [
        cell(threshold?.projected),
        cell(fullMarket?.projected),
        cell(clientOnly?.projected),
        cell(threshold?.deltaVsComparison),
      ];
    });

    return [
      cell(cutPoint.measureCode),
      cutPoint.displayName,
      cutPoint.inverted ? "Yes" : "",
      cutPoint.status === "ready" ? SOURCE_LABELS[cutPoint.source] : "",
      STATUS_LABELS[cutPoint.status],
      cell(cutPoint.accruedContractCount),
      cell(cutPoint.baselineMarketCount),
      ...thresholdCells,
      cutPoint.warningCount > 0 ? String(cutPoint.warningCount) : "",
      notesFor(cutPoint),
      ...(additionsByMeasure
        ? additionCells(additionsByMeasure.get(cutPoint.measureNormalized))
        : []),
    ];
  });

  return {
    headers: additionsByMeasure
      ? [
          ...PREDICTED_CUT_POINTS_CSV_HEADERS,
          ...PREDICTED_CUT_POINTS_ADDITION_SUMMARY_HEADERS,
        ]
      : [...PREDICTED_CUT_POINTS_CSV_HEADERS],
    rows,
  };
}

function snapshotCells(
  prior: CutPointAdditionSummary["fullMarketPrior"],
  delta: CutPointAdditionSummary["fullMarketDelta"],
  clientPrior: CutPointAdditionSummary["clientOnlyPrior"],
  clientDelta: CutPointAdditionSummary["clientOnlyDelta"],
): string[] {
  return THRESHOLD_ORDER.flatMap((key) => [
    cell(prior[key]),
    cell(delta[key]),
    cell(clientPrior[key]),
    cell(clientDelta[key]),
  ]);
}

function additionCells(summary: CutPointAdditionSummary | undefined): string[] {
  if (!summary) {
    return PREDICTED_CUT_POINTS_ADDITION_SUMMARY_HEADERS.map(() => "");
  }
  return [
    cell(summary.addedSinceLastRun),
    ...snapshotCells(
      summary.fullMarketPrior,
      summary.fullMarketDelta,
      summary.clientOnlyPrior,
      summary.clientOnlyDelta,
    ),
    summary.driverParents,
    summary.additionNotes,
  ];
}

export function buildPredictedCutPointAdditionsCsv(
  detailRows: CutPointAdditionDetailRow[],
): CsvData {
  return {
    headers: [...PREDICTED_CUT_POINTS_ADDITIONS_HEADERS],
    rows: detailRows.map((row) => [
      cell(row.measureCode),
      row.measureDisplayName,
      row.contractId,
      row.contractName ?? "",
      row.parentOrganization ?? "",
      ROLE_LABELS[row.role],
      row.newToMarket ? "Yes" : "",
      cell(row.currentScore),
      cell(row.priorScore),
      cell(row.scoreDelta),
      cell(row.manualStar),
      cell(row.fullMarketStar),
    ]),
  };
}

export function predictedCutPointsCsvString(
  cutPoints: PlanPreviewCutPointPrediction[],
  additionsByMeasure?: Map<string, CutPointAdditionSummary>,
): string {
  return generateCsvString(buildPredictedCutPointsCsv(cutPoints, additionsByMeasure));
}

export function predictedCutPointAdditionsCsvString(
  detailRows: CutPointAdditionDetailRow[],
): string {
  return generateCsvString(buildPredictedCutPointAdditionsCsv(detailRows));
}
