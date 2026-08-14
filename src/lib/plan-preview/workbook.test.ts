import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { classifyMeasureValue, parsePlanPreviewWorkbook } from "./workbook";
import type {
  PlanPreviewCaiParseResult,
  PlanPreviewMeasureParseResult,
} from "./types";

const MEASURE_PATH = path.join(process.cwd(), "data/2027/SR_2027_FPP/SR_2027_measure_data.xlsx");
const CAI_PATH = path.join(process.cwd(), "data/2027/SR_2027_FPP/SR_2027_cai.xlsx");

test("classifyMeasureValue handles percent, decimal, and sentinel values", () => {
  assert.deepEqual(classifyMeasureValue("77%"), { score: 77, status: "scored" });
  assert.deepEqual(classifyMeasureValue("0.09"), { score: 0.09, status: "scored" });
  assert.deepEqual(classifyMeasureValue("83"), { score: 83, status: "scored" });
  assert.equal(classifyMeasureValue("Plan not required to report measure").status, "not_required");
  assert.equal(classifyMeasureValue("Not Applicable").status, "not_applicable");
  assert.equal(classifyMeasureValue("Not enough data available").status, "insufficient_data");
  assert.equal(
    classifyMeasureValue("CMS identified issues with this plan's data").status,
    "cms_data_issue"
  );
  assert.equal(classifyMeasureValue("CMS identified issues with this plan's data").score, null);
  assert.equal(classifyMeasureValue("Plan too new to be measured").status, "other");
});

test("parses the official 2027 measure data workbook", { skip: !existsSync(MEASURE_PATH) }, () => {
  const parsed = parsePlanPreviewWorkbook(readFileSync(MEASURE_PATH));
  assert.equal(parsed.fileType, "measure_data");
  const result = parsed as PlanPreviewMeasureParseResult;

  assert.equal(result.detectedStarsYear, 2027);
  assert.equal(result.summary.contractCount, 3);
  assert.ok(result.summary.measureCount >= 40, "expected the full C01-D13 measure set");

  const h0885C01 = result.rows.find(
    (row) => row.contractId === "H0885" && row.measureCode === "C01"
  );
  assert.ok(h0885C01);
  assert.equal(h0885C01.score, 76);
  assert.equal(h0885C01.status, "scored");
  assert.equal(h0885C01.metricCategory, "Part C");
  assert.equal(h0885C01.parentOrganization, "Horizon Mutual Holdings, Inc");

  const h0885C27 = result.rows.find(
    (row) => row.contractId === "H0885" && row.measureCode === "C27"
  );
  assert.equal(h0885C27?.score, 0.18);

  const s5993C01 = result.rows.find(
    (row) => row.contractId === "S5993" && row.measureCode === "C01"
  );
  assert.equal(s5993C01?.status, "not_required");
  assert.equal(s5993C01?.score, null);

  const h0885D04 = result.rows.find(
    (row) => row.contractId === "H0885" && row.measureCode === "D04"
  );
  assert.equal(h0885D04?.status, "not_applicable");

  const h8298C04 = result.rows.find(
    (row) => row.contractId === "H8298" && row.measureCode === "C04"
  );
  assert.equal(h8298C04?.status, "insufficient_data");

  for (const row of result.rows) {
    assert.ok(row.rawValue.length > 0, "empty cells should be skipped");
  }
});

test("parses the official 2027 CAI workbook", { skip: !existsSync(CAI_PATH) }, () => {
  const parsed = parsePlanPreviewWorkbook(readFileSync(CAI_PATH));
  assert.equal(parsed.fileType, "cai");
  const result = parsed as PlanPreviewCaiParseResult;

  assert.equal(result.detectedStarsYear, 2027);
  assert.equal(result.summary.contractCount, 3);

  const h0885 = result.rows.find((row) => row.contractId === "H0885");
  assert.ok(h0885);
  assert.equal(h0885.puertoRicoOnly, false);
  assert.equal(h0885.contractType, "CCP");
  assert.equal(h0885.partDOffered, true);
  assert.equal(h0885.enrolled, 58258);
  assert.equal(h0885.pctLisDe, 10.594253);
  assert.equal(h0885.partCFac, "2");
  assert.equal(h0885.partCCai, -0.026685);
  assert.equal(h0885.overallCai, -0.036054);

  // PDP contracts have no Part C / Overall CAI, only the PDP leg.
  const s5993 = result.rows.find((row) => row.contractId === "S5993");
  assert.ok(s5993);
  assert.equal(s5993.contractType, "PDP");
  assert.equal(s5993.overallCai, null);
  assert.equal(s5993.partCCai, null);
  assert.equal(s5993.partDPdpCai, -0.106015);
});
