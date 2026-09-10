import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { classifyOfficialStarValue } from "./pp2-workbook";
import { parsePlanPreviewWorkbook } from "./workbook";
import type {
  PlanPreviewImprovementParseResult,
  PlanPreviewMeasureParseResult,
  PlanPreviewOfficialStarParseResult,
  PlanPreviewOfficialSummaryParseResult,
} from "./types";

function workbookBuffer(sheetName: string, rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("classifyOfficialStarValue maps stars and PP2 sentinels", () => {
  assert.deepEqual(classifyOfficialStarValue("4"), { star: 4, status: "scored" });
  assert.deepEqual(classifyOfficialStarValue("5.0"), { star: 5, status: "scored" });
  assert.equal(classifyOfficialStarValue("Plan too small to be measured").status, "too_small");
  assert.equal(classifyOfficialStarValue("Plan not required to report measure").status, "not_required");
  assert.equal(classifyOfficialStarValue("Not enough data available").status, "insufficient_data");
  assert.deepEqual(classifyOfficialStarValue("5%"), { star: null, status: "other" });
  assert.deepEqual(classifyOfficialStarValue("95"), { star: null, status: "other" });
});

test("parses measure_star workbooks including too-small sentinels", () => {
  const buffer = workbookBuffer("SR_2026_measure_star", [
    ["Star Ratings and Display Measures - CY 2026 Star Ratings"],
    [],
    ["Medicare Part C and D Report Card Master Table"],
    ["Contract Number", "Organization Marketing Name", "Contract Name", "Parent Organization"],
    [null, null, null, null, "C01: Breast Cancer Screening", "C30: Health Plan Quality Improvement", "D04: Drug Plan Quality Improvement"],
    ["H1304", "Regence", "REGENCE", "Cambia Health Solutions, Inc.", "4", "3", "2"],
    ["H1969", "Regence", "REGENCE", "Cambia Health Solutions, Inc.", "Plan too small to be measured", "4", "4"],
    [],
    ["Star Rating Legend"],
    ["5 = Excellent"],
  ]);

  const parsed = parsePlanPreviewWorkbook(buffer);
  assert.equal(parsed.fileType, "measure_star");
  const result = parsed as PlanPreviewOfficialStarParseResult;
  assert.equal(result.detectedStarsYear, 2026);
  assert.equal(result.summary.contractCount, 2);
  const scored = result.rows.find((row) => row.contractId === "H1304" && row.measureCode === "C01");
  assert.equal(scored?.star, 4);
  const small = result.rows.find((row) => row.contractId === "H1969" && row.measureCode === "C01");
  assert.equal(small?.status, "too_small");
  assert.equal(small?.star, null);
});

test("parses improve files and the trailing QI score", () => {
  const buffer = workbookBuffer("SR_2026_improve_c", [
    ["Star Ratings and Display Measures - CY 2026 Star Ratings"],
    [],
    ["Medicare Part C and D Report Card Master Table"],
    ["Contract Number", "Organization Marketing Name", "Contract Name", "Parent Organization", "HD1", null, "Part C Improvement"],
    [null, null, null, null, "C01: Breast Cancer Screening", "C02: Colorectal Cancer Screening"],
    [null, null, null, null, "Included", "Included"],
    ["H1304", "Regence", "REGENCE", "Cambia Health Solutions, Inc.", "Significant improvement", "Hold Harmless", 0.28],
  ]);

  const parsed = parsePlanPreviewWorkbook(buffer);
  assert.equal(parsed.fileType, "improvement");
  const result = parsed as PlanPreviewImprovementParseResult;
  assert.equal(result.rows[0]?.qiSignificance, "Significant improvement");
  assert.equal(result.rows[0]?.improvementScore, 0.28);
  assert.equal(result.rows[0]?.ratingType, "part_c");
});

test("filename measure_data wins even when the sheet name is generic", () => {
  const buffer = workbookBuffer("Sheet1", [
    ["Star Ratings and Display Measures - CY 2027 Star Ratings"],
    ["Contract Number", "Organization Marketing Name", "Contract Name", "Parent Organization"],
    [null, null, null, null, "C01: Breast Cancer Screening"],
    ["H3668", "MediGold", "MEDIGOLD", "Trinity Health Corporation", "75%"],
    ["Plan too small to be measured"],
  ]);
  const parsed = parsePlanPreviewWorkbook(buffer, "fwq_pgmedigoldproductdiscussion/SR_2027_measure_data (2).xlsx");
  assert.equal(parsed.fileType, "measure_data");
});

test("measure_data files with the shared too-small legend stay measure scores", () => {
  const buffer = workbookBuffer("SR_2027_measure_data", [
    ["Star Ratings and Display Measures - CY 2027 Star Ratings"],
    [],
    ["Medicare Part C and D Report Card Master Table"],
    ["Contract Number", "Organization Marketing Name", "Contract Name", "Parent Organization"],
    [null, null, null, null, "C01: Breast Cancer Screening", "D01: Call Center - Foreign Language Interpreter and TTY Availability"],
    ["H3668", "MediGold", "MEDIGOLD", "Trinity Health Corporation", "75%", "95"],
    [],
    ["Star Rating Legend"],
    ["Plan too small to be measured"],
  ]);

  const parsed = parsePlanPreviewWorkbook(buffer, "SR_2027_measure_data (2).xlsx");
  assert.equal(parsed.fileType, "measure_data");
  const result = parsed as PlanPreviewMeasureParseResult;
  const breast = result.rows.find((row) => row.contractId === "H3668" && row.measureCode === "C01");
  assert.equal(breast?.score, 75);
  assert.equal(breast?.status, "scored");
});

test("parses overall summary from headers, not the sheet name", () => {
  const buffer = workbookBuffer("SR_2025_summary_c", [
    ["Star Ratings and Display Measures - CY 2026 Star Ratings"],
    [],
    ["Medicare Part C and D Report Card Master Table"],
    [
      "Contract Number",
      "Organization Marketing Name",
      "Contract Name",
      "Parent Organization",
      "Contract Type",
      "Major Disaster Percentage 2023",
      "Major Disaster Percentage 2024",
      "Calculated Summary Mean",
      "Reward Factor",
      "CAI Value",
      "Final Summary",
      "Improvement Measure Usage",
      "2026 Part C Summary Rating",
    ],
    ["H1304", "Regence", "REGENCE", "Cambia Health Solutions, Inc.", "CCP", "0", "0", "3.46", "0", "-0.036927", "3.423073", "Yes", "3.5"],
  ]);

  const parsed = parsePlanPreviewWorkbook(buffer);
  assert.equal(parsed.fileType, "summary_rating");
  const result = parsed as PlanPreviewOfficialSummaryParseResult;
  assert.equal(result.rows[0]?.ratingType, "part_c");
  assert.equal(result.rows[0]?.finalRating, 3.5);
  assert.equal(result.rows[0]?.calculatedMean, 3.46);
  assert.equal(result.rows[0]?.disasterYear1, 2023);
  assert.equal(result.rows[0]?.caiValue, -0.036927);
});
