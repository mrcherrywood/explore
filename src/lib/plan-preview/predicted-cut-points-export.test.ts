import assert from "node:assert/strict";
import test from "node:test";

import type { MethodologyForecastThreshold } from "@/lib/band-movement/cut-point-methodology";
import { generateCsvString } from "@/lib/export/csv";

import {
  PREDICTED_CUT_POINTS_CSV_HEADERS,
  buildPredictedCutPointsCsv,
} from "./predicted-cut-points-export";
import type { PlanPreviewCutPointPrediction } from "./predictions";

function threshold(
  key: MethodologyForecastThreshold["key"],
  projected: number,
  deltaVsComparison: number | null,
): MethodologyForecastThreshold {
  return {
    key,
    label: key,
    projected,
    comparisonActual: null,
    deltaVsComparison,
    absDeltaVsComparison: deltaVsComparison === null ? null : Math.abs(deltaVsComparison),
    rawSimulated: null,
    baselineSimulated: null,
    anchoredMovement: null,
    movementCap: null,
    movementWasCapped: false,
  };
}

function cutPoint(
  overrides: Partial<PlanPreviewCutPointPrediction> &
    Pick<PlanPreviewCutPointPrediction, "displayName" | "status">,
): PlanPreviewCutPointPrediction {
  return {
    measureNormalized: overrides.displayName.toLowerCase(),
    measureCode: null,
    reason: null,
    method: null,
    source: "model",
    inverted: false,
    accruedContractCount: 0,
    matchedBaselineCount: 0,
    appendedContractCount: 0,
    baselineMarketCount: 0,
    sampleSize: null,
    thresholds: null,
    modelThresholds: null,
    warningCount: 0,
    forecastFillCount: 0,
    notes: [],
    ...overrides,
  };
}

test("buildPredictedCutPointsCsv splits star value, change, and model columns", () => {
  const data = buildPredictedCutPointsCsv([
    cutPoint({
      displayName: "Breast Cancer Screening",
      measureCode: "C01",
      status: "ready",
      source: "workbook_forecast",
      accruedContractCount: 102,
      baselineMarketCount: 499,
      warningCount: 4,
      notes: ["Model prediction diverges from the workbook forecast."],
      thresholds: [
        threshold("fiveStar", 85, 1),
        threshold("fourStar", 78, 2),
        threshold("threeStar", 73, 2),
        threshold("twoStar", 63, 5),
      ],
      modelThresholds: [
        threshold("fiveStar", 84, null),
        threshold("fourStar", 76, null),
        threshold("threeStar", 72, null),
        threshold("twoStar", 59, null),
      ],
    }),
  ]);

  assert.deepEqual(data.headers, [...PREDICTED_CUT_POINTS_CSV_HEADERS]);
  assert.ok(
    data.headers.every((header) => /^[\x20-\x7E]+$/.test(header)),
    "CSV headers should stay ASCII so Excel does not show star glyphs as mojibake",
  );
  assert.ok(data.headers.includes("5 Star"));
  assert.ok(data.headers.includes("5 Star Change"));
  assert.ok(data.headers.includes("5 Star Model"));
  assert.deepEqual(data.rows, [
    [
      "C01",
      "Breast Cancer Screening",
      "",
      "Workbook forecast",
      "Ready",
      "102",
      "499",
      "85",
      "1",
      "84",
      "78",
      "2",
      "76",
      "73",
      "2",
      "72",
      "63",
      "5",
      "59",
      "4",
      "Model prediction diverges from the workbook forecast.",
    ],
  ]);
});

test("buildPredictedCutPointsCsv marks inverted measures and official sources", () => {
  const data = buildPredictedCutPointsCsv([
    cutPoint({
      displayName: "Complaints about the Drug Plan",
      measureCode: "D02",
      status: "ready",
      source: "official",
      inverted: true,
      accruedContractCount: 99,
      baselineMarketCount: 526,
      thresholds: [
        threshold("fiveStar", 0.1, -0.01),
        threshold("fourStar", 0.32, 0),
        threshold("threeStar", 0.71, 0),
        threshold("twoStar", 1.26, -0.08),
      ],
    }),
  ]);

  assert.equal(data.rows[0][2], "Yes");
  assert.equal(data.rows[0][3], "Official");
  assert.equal(data.rows[0][7], "0.1");
  assert.equal(data.rows[0][8], "-0.01");
  assert.equal(data.rows[0][9], "");
  assert.equal(data.rows[0][19], "");
});

test("buildPredictedCutPointsCsv keeps unavailable rows with reason notes", () => {
  const data = buildPredictedCutPointsCsv([
    cutPoint({
      displayName: "Quality Improvement",
      measureCode: "C30",
      status: "unsupported",
      reason: "Quality Improvement is excluded from cut-point prediction.",
    }),
  ]);

  assert.equal(data.rows[0][3], "");
  assert.equal(data.rows[0][4], "Excluded");
  assert.equal(data.rows[0][7], "");
  assert.equal(
    data.rows[0][20],
    "Quality Improvement is excluded from cut-point prediction.",
  );
});

test("generateCsvString quotes measure names that contain commas", () => {
  const csv = generateCsvString(
    buildPredictedCutPointsCsv([
      cutPoint({
        displayName: "Getting Needed Care, Getting Appointments",
        measureCode: "C22",
        status: "ready",
        source: "official",
        accruedContractCount: 80,
        baselineMarketCount: 400,
      }),
    ]),
  );

  assert.match(csv, /"Getting Needed Care, Getting Appointments"/);
  assert.match(csv, /Official/);
});
