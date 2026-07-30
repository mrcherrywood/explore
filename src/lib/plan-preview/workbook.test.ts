import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { classifyMeasureValue, parsePlanPreviewWorkbook } from "./workbook";
import type {
  PlanPreviewCaiParseResult,
  PlanPreviewMeasureParseResult,
} from "./types";

const SAMPLE_MEASURE_PATH = path.join(process.cwd(), "data/2027/SAMPLE_SR_2026_measure_data_v2.xlsx");
const SAMPLE_CAI_PATH = path.join(process.cwd(), "data/2027/SAMPLE_SR_2026_cai (1).xlsx");

test("classifyMeasureValue handles percent, decimal, and sentinel values", () => {
  assert.deepEqual(classifyMeasureValue("77%"), { score: 77, status: "scored" });
  assert.deepEqual(classifyMeasureValue("0.09"), { score: 0.09, status: "scored" });
  assert.deepEqual(classifyMeasureValue("83"), { score: 83, status: "scored" });
  assert.equal(classifyMeasureValue("Plan not required to report measure").status, "not_required");
  assert.equal(classifyMeasureValue("Not Applicable").status, "not_applicable");
  assert.equal(classifyMeasureValue("Not enough data available").status, "insufficient_data");
  assert.equal(classifyMeasureValue("Plan too new to be measured").status, "other");
});

test("parses the sample measure data workbook", { skip: !existsSync(SAMPLE_MEASURE_PATH) }, () => {
  const parsed = parsePlanPreviewWorkbook(readFileSync(SAMPLE_MEASURE_PATH));
  assert.equal(parsed.fileType, "measure_data");
  const result = parsed as PlanPreviewMeasureParseResult;

  assert.equal(result.detectedStarsYear, 2026);
  assert.equal(result.summary.contractCount, 2);
  assert.ok(result.summary.measureCount >= 40, "expected the full C01-D12 measure set");

  const h8003C01 = result.rows.find(
    (row) => row.contractId === "H8003" && row.measureCode === "C01"
  );
  assert.ok(h8003C01);
  assert.equal(h8003C01.score, 77);
  assert.equal(h8003C01.status, "scored");
  assert.equal(h8003C01.metricCategory, "Part C");
  assert.equal(h8003C01.parentOrganization, "BlueCross BlueShield of South Carolina (BCBSSC)");

  const h8003C28 = result.rows.find(
    (row) => row.contractId === "H8003" && row.measureCode === "C28"
  );
  assert.equal(h8003C28?.score, 0.09);

  const s5953C01 = result.rows.find(
    (row) => row.contractId === "S5953" && row.measureCode === "C01"
  );
  assert.equal(s5953C01?.status, "not_required");
  assert.equal(s5953C01?.score, null);

  const h8003D04 = result.rows.find(
    (row) => row.contractId === "H8003" && row.measureCode === "D04"
  );
  assert.equal(h8003D04?.status, "not_applicable");

  for (const row of result.rows) {
    assert.ok(row.rawValue.length > 0, "empty cells should be skipped");
  }
});

test("parses the sample CAI workbook", { skip: !existsSync(SAMPLE_CAI_PATH) }, () => {
  const parsed = parsePlanPreviewWorkbook(readFileSync(SAMPLE_CAI_PATH));
  assert.equal(parsed.fileType, "cai");
  const result = parsed as PlanPreviewCaiParseResult;

  assert.equal(result.detectedStarsYear, 2026);
  assert.equal(result.summary.contractCount, 2);

  const h8003 = result.rows.find((row) => row.contractId === "H8003");
  assert.ok(h8003);
  assert.equal(h8003.puertoRicoOnly, false);
  assert.equal(h8003.contractType, "CCP");
  assert.equal(h8003.partDOffered, true);
  assert.equal(h8003.enrolled, 26129);
  assert.equal(h8003.pctLisDe, 7.753837);
  assert.equal(h8003.partCFac, "2");
  assert.equal(h8003.partCCai, -0.036927);
  assert.equal(h8003.overallCai, -0.040422);

  const s5953 = result.rows.find((row) => row.contractId === "S5953");
  assert.ok(s5953);
  assert.equal(s5953.contractType, "PDP");
  assert.equal(s5953.partCFac, null);
  assert.equal(s5953.partCCai, null);
  assert.equal(s5953.partDPdpCai, -0.227881);
  assert.equal(s5953.overallCai, null);
});
