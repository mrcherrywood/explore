import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_THIRTY_EXCLUSIONS,
  CLOVER_NOTICE_EXCLUSIONS,
  CLOVER_STATUTORY_EXCLUSIONS,
  CMS_RECALC_EXCLUSIONS,
  EXCLUSION_MODELS,
  exclusionCrosswalk,
  exclusionRemovalCodes,
  SCENARIO_3_MODEL,
  SCENARIO_4_MODEL,
} from "./exclusion-models";

test("exclusion lists match the CMS and Clover counts", () => {
  assert.equal(CMS_RECALC_EXCLUSIONS.length, 18);
  assert.equal(CLOVER_STATUTORY_EXCLUSIONS.length, 10);
  assert.equal(CLOVER_NOTICE_EXCLUSIONS.length, 10);
  assert.equal(new Set([...CLOVER_STATUTORY_EXCLUSIONS, ...CLOVER_NOTICE_EXCLUSIONS].map((row) => row.code)).size, 20);
  assert.ok(!CMS_RECALC_EXCLUSIONS.some((row) => row.code === "D13"));
});

test("exclusion crosswalk splits the overlap", () => {
  const rows = exclusionCrosswalk();
  const byCategory = new Map(rows.map((row) => [row.category, row.codes]));
  assert.deepEqual(byCategory.get("Excluded by both CMS and Clover"), [
    "C32", "C33", "D01", "D05", "D06", "D08", "D09", "D10", "D11", "D12",
  ]);
  assert.deepEqual(byCategory.get("Excluded by CMS, but not Clover"), [
    "C07", "C28", "C29", "C31", "D02", "D03", "D04", "D07",
  ]);
  assert.deepEqual(byCategory.get("Excluded by Clover, but not the CMS recalculation"), [
    "C03", "C04", "C05", "C15", "C16", "C22", "C23", "C24", "C25", "C27",
  ]);
  assert.equal(byCategory.get("Total CMS exclusions")?.length, 18);
  assert.equal(byCategory.get("Total Clover exclusions")?.length, 20);
  assert.equal(byCategory.get("CMS recalc and all Clover")?.length, 28);
});

test("All 30 drops the challenged measures, including both quality improvement measures", () => {
  const all30 = EXCLUSION_MODELS.find((model) => model.id === "all30");
  assert.ok(all30);
  assert.equal(ALL_THIRTY_EXCLUSIONS.length, 30);
  assert.equal(all30.measures.length, 30);
  assert.ok(all30.measures.every((measure) => measure.theory && measure.basis && measure.normalized));
  const codes = exclusionRemovalCodes(all30, 2026);
  assert.equal(codes.length, 30);
  assert.equal(new Set(codes).size, 30);
  const supd = ALL_THIRTY_EXCLUSIONS.find((measure) => measure.name.includes("SUPD"));
  const cob = ALL_THIRTY_EXCLUSIONS.find((measure) => measure.name.includes("COB"));
  assert.ok(supd && cob);
  assert.notEqual(supd.normalized, cob.normalized);
  const supdCode = codes.find((code) => code === "D12");
  assert.equal(supdCode, "D12");
  assert.ok(codes.some((code) => code.startsWith("D:") && code.includes("opioids")));
  assert.ok(!codes.includes("D11"));
  for (const code of ["C03", "C07", "C30", "D04", "D13"]) {
    assert.ok(codes.includes(code), code);
  }
});

test("the two extra scenarios drop the Stars 2027 measures, not the reused code numbers", () => {
  const five = EXCLUSION_MODELS.find((model) => model.id === "five-c");
  const plus = EXCLUSION_MODELS.find((model) => model.id === "five-c-plus-d");
  assert.ok(five && plus);
  assert.deepEqual(
    five.measures.map((measure) => [measure.code, measure.name]),
    [
      ["C15", "Reducing the Risk of Falling"],
      ["C32", "Call Center – Foreign Language Interpreter and TTY Availability (Part C)"],
      ["C16", "Improving Bladder Control"],
      ["C04", "Improving or Maintaining Physical Health"],
      ["C05", "Improving or Maintaining Mental Health"],
    ],
  );
  assert.equal(plus.measures.find((measure) => measure.code === "D11")?.name, "Statin Use in Persons with Diabetes (SUPD)");
  const removed = exclusionRemovalCodes(plus, 2026);
  assert.equal(removed.length, 9);
  assert.ok(removed.includes("C33"), removed.join(","));
  assert.ok(!removed.includes("C32"), removed.join(","));
  assert.ok(removed.includes("D12"), removed.join(","));
  assert.ok(!removed.includes("D11"), removed.join(","));
});

test("scenario 3 and 4 use Stars 2027 measure names", () => {
  assert.deepEqual(
    SCENARIO_3_MODEL.measures.map((measure) => measure.code),
    ["D01", "D06", "D08", "D11"],
  );
  assert.equal(SCENARIO_3_MODEL.measures.find((measure) => measure.code === "D11")?.name.includes("SUPD"), true);
  const scenario3 = exclusionRemovalCodes(SCENARIO_3_MODEL, 2026);
  assert.deepEqual(scenario3, ["D01", "D06", "D08", "D12"]);
  assert.ok(!scenario3.includes("D11"));

  const display = SCENARIO_4_MODEL.measures.map((measure) => measure.code);
  assert.deepEqual(display.slice(0, 13), ["D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13"]);
  assert.deepEqual(display.slice(13), ["C28", "C29", "C30", "C31", "C32"]);
  assert.ok(!display.includes("C33"));
  const scenario4 = exclusionRemovalCodes(SCENARIO_4_MODEL, 2026);
  assert.equal(scenario4.length, display.length);
  assert.ok(scenario4.includes("C29"), scenario4.join(","));
  assert.ok(scenario4.includes("C33"), scenario4.join(","));
  assert.ok(!scenario4.includes("C28"), scenario4.join(","));
  assert.ok(scenario4.includes("D12"), scenario4.join(","));
  assert.ok(!scenario4.includes("D11"), scenario4.join(","));
  assert.ok(scenario4.some((code) => code.startsWith("D:") && code.includes("opioids")), scenario4.join(","));
});

test("CMS and Clover together drops each list once", () => {
  const combined = EXCLUSION_MODELS.find((model) => model.id === "combined");
  assert.ok(combined);
  assert.equal(combined.codes.length, 28);
  assert.equal(new Set(combined.codes).size, 28);
  assert.ok(combined.codes.includes("C07"));
  assert.ok(combined.codes.includes("C03"));
  assert.ok(!combined.codes.includes("D13"));
});
