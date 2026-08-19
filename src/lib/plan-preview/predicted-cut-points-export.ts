import type { CsvData } from "@/lib/export/csv";

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
  workbook_forecast: "Workbook forecast",
  model: "Model",
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
    `${STAR_LABELS[key]} Model`,
    `${STAR_LABELS[key]} Delta`,
  ]),
  "Warnings",
  "Notes",
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
): CsvData {
  const rows = cutPoints.map((cutPoint) => {
    const thresholdByKey = new Map(
      (cutPoint.thresholds ?? []).map((item) => [item.key, item] as const),
    );
    const modelByKey = new Map(
      (cutPoint.modelThresholds ?? []).map((item) => [item.key, item] as const),
    );

    const thresholdCells = THRESHOLD_ORDER.flatMap((key) => {
      const threshold = thresholdByKey.get(key);
      const model = modelByKey.get(key);
      return [
        cell(threshold?.projected),
        cell(model?.projected),
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
    ];
  });

  return {
    headers: [...PREDICTED_CUT_POINTS_CSV_HEADERS],
    rows,
  };
}
