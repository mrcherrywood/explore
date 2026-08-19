import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import * as XLSX from "xlsx";

import { parsePlanPreviewWorkbook } from "./workbook";
import { buildCaiExportWorkbook, buildMeasureDataExportWorkbook } from "./export-workbook";
import { buildPlanPreviewScenarios } from "./final-scores";
import { buildPlanPreviewPredictions } from "./predictions";
import { buildPriorYearCaiRows } from "./prior-year-cai";
import { buildPlanPreviewContractReport } from "./report-data";
import type { PlanPreviewCaiParseResult, PlanPreviewMeasureParseResult } from "./types";

function workbookFromAoa(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "PP1 data");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

const FIXTURE = workbookFromAoa([
  [" Contract", " Measure", " PP1 Rate"],
  ["H0907", "Breast Cancer Screening", 0.72],
  ["H0907", "Controlling Blood Pressure", 0.84],
  ["H0907", "Transitions of Care - Medication Reconciliation Post Discharge", 0.8735],
  ["H0907", "Transitions of Care - Average", 0.75],
  ["H0907", "Complaints About the Plan", 0.15],
  ["H0907", "Members Choosing to Leave the Plan", 0.21],
  ["H0907", "Health Plan Quality Improvement", 0.41],
  ["H0907", "Rating of Drug Plan", 0.870706],
  ["H0907", "Complaints About the Plan", 0.15],
  ["H0907", "Members Choosing to Leave the Plan", 0.21],
  ["H0907", "MPF Pricing Accuracy", 99],
  ["H0907", "Colorectal Cancer Screening ECDS", 0.63],
  ["H0907", "Part C Call Center - Foreign Language Interpreter and TTY Availability", 1],
  ["H4694", "Breast Cancer Screening", 0.7],
]);

test("parses a client Contract / Measure / Rate extract into measure_data", () => {
  const parsed = parsePlanPreviewWorkbook(FIXTURE);
  assert.equal(parsed.fileType, "measure_data");
  const result = parsed as PlanPreviewMeasureParseResult;

  assert.equal(result.summary.contractCount, 2);
  assert.equal(result.detectedStarsYear, null);

  const codes = new Set(result.rows.map((row) => row.measureCode));
  assert.equal(codes.has("C29"), false, "QI should be dropped");
  assert.equal(codes.has("C19"), true);
  assert.equal(
    result.rows.some((row) => row.measureName.toLowerCase().includes("medication reconciliation")),
    false
  );

  const c01 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "C01");
  assert.equal(c01?.score, 72);
  assert.equal(c01?.status, "scored");

  const c14 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "C14");
  assert.equal(c14?.score, 84);

  const c19 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "C19");
  assert.equal(c19?.score, 75);

  const c27 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "C27");
  const d02 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "D02");
  assert.equal(c27?.score, 0.15);
  assert.equal(d02?.score, 0.15);

  const c28 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "C28");
  const d03 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "D03");
  assert.equal(c28?.score, 21);
  assert.equal(d03?.score, 21);

  const d07 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "D07");
  assert.equal(d07?.score, 99);

  const c32 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "C32");
  assert.equal(c32?.score, 100);

  const c02 = result.rows.find((row) => row.contractId === "H0907" && row.measureCode === "C02");
  assert.equal(c02?.score, 63);
});

test("round-trips the long-format extract through the measure_data export", () => {
  const parsed = parsePlanPreviewWorkbook(FIXTURE) as PlanPreviewMeasureParseResult;
  const buffer = buildMeasureDataExportWorkbook(
    2027,
    parsed.rows.map((row) => ({
      contractId: row.contractId,
      organizationMarketingName: row.organizationMarketingName,
      contractName: row.contractName,
      parentOrganization: row.parentOrganization,
      measureCode: row.measureCode,
      measureDisplayName: row.measureDisplayName,
      rawValue: row.rawValue,
      score: row.score,
      status: row.status,
      decimalScore: row.score,
      decimalSource: null,
    }))
  );
  const reparsed = parsePlanPreviewWorkbook(buffer) as PlanPreviewMeasureParseResult;
  assert.equal(reparsed.fileType, "measure_data");
  assert.equal(reparsed.detectedStarsYear, 2027);
  const c01 = reparsed.rows.find((row) => row.contractId === "H0907" && row.measureCode === "C01");
  assert.equal(c01?.score, 72);
});

test("builds Stars 2026 CAI for contracts that have a FAC and skips too-new plans", () => {
  const caiPath = path.join(process.cwd(), "data/2026/cai_2026.json");
  if (!existsSync(caiPath)) {
    return;
  }

  const rows = buildPriorYearCaiRows(["H0907", "H4694", "H1607"]);
  const ids = rows.map((row) => row.contractId);
  assert.ok(ids.includes("H0907"));
  assert.ok(ids.includes("H1607"));
  assert.equal(ids.includes("H4694"), false, "H4694 was too new in 2026 and has no FAC");

  const h0907 = rows.find((row) => row.contractId === "H0907");
  assert.equal(h0907?.overallFac, "9");
  assert.equal(h0907?.overallCai, 0.145515);
  assert.equal(h0907?.partCFac, "8");
  assert.equal(h0907?.partCCai, 0.10237);
  assert.equal(h0907?.parentOrganization, "Elevance Health, Inc.");

  const buffer = buildCaiExportWorkbook(2027, rows);
  const parsed = parsePlanPreviewWorkbook(buffer);
  assert.equal(parsed.fileType, "cai");
  const result = parsed as PlanPreviewCaiParseResult;
  const reparsed = result.rows.find((row) => row.contractId === "H0907");
  assert.equal(reparsed?.overallCai, 0.145515);
  assert.equal(reparsed?.partCCai, 0.10237);
});

test("builds a serializable H0907 contract report from the long-format extract", () => {
  const parsed = parsePlanPreviewWorkbook(FIXTURE) as PlanPreviewMeasureParseResult;
  const rows = parsed.rows
    .filter((row) => row.status === "scored" && row.score !== null)
    .map((row) => ({
      contractId: row.contractId,
      contractName: row.contractName,
      organizationMarketingName: row.organizationMarketingName,
      parentOrganization: row.parentOrganization,
      measureCode: row.measureCode,
      measureDisplayName: row.measureDisplayName,
      measureNormalized: row.measureNormalized,
      score: row.score,
      wholeScore: row.score,
    }));
  const predictions = buildPlanPreviewPredictions(rows, 2027);
  const contract = predictions.contracts.find((entry) => entry.contractId === "H0907");
  assert.ok(contract);

  const caiRows = buildPriorYearCaiRows(["H0907"]);
  const cai = { overall: {} as Record<string, number>, partC: {} as Record<string, number>, partD: {} as Record<string, number> };
  for (const row of caiRows) {
    if (row.overallCai !== null) cai.overall[row.contractId] = row.overallCai;
    if (row.partCCai !== null) cai.partC[row.contractId] = row.partCCai;
    if (row.partDMapdCai !== null) cai.partD[row.contractId] = row.partDMapdCai;
  }

  const scenarios = buildPlanPreviewScenarios(predictions, cai);
  const report = buildPlanPreviewContractReport({
    predictions,
    scenarios,
    contract,
    domainByCode: new Map(),
    cai,
  });
  assert.equal(report.contract.contractId, "H0907");
  assert.ok(report.measures.length > 0);
  assert.doesNotThrow(() => JSON.stringify(report));
});

test("rejects unknown client measure names", () => {
  const bad = workbookFromAoa([
    ["Contract", "Measure", "PP1 Rate"],
    ["H0907", "Not A Real Stars Measure", 0.5],
  ]);
  assert.throws(() => parsePlanPreviewWorkbook(bad), /Unrecognized client PP1 measure name/);
});
