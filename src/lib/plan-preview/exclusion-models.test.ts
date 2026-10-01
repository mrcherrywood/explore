import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOVER_NOTICE_EXCLUSIONS,
  CLOVER_STATUTORY_EXCLUSIONS,
  CMS_RECALC_EXCLUSIONS,
  EXCLUSION_MODELS,
  exclusionCrosswalk,
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

test("CMS and Clover together drops each list once", () => {
  const combined = EXCLUSION_MODELS.find((model) => model.id === "combined");
  assert.ok(combined);
  assert.equal(combined.codes.length, 28);
  assert.equal(new Set(combined.codes).size, 28);
  assert.ok(combined.codes.includes("C07"));
  assert.ok(combined.codes.includes("C03"));
  assert.ok(!combined.codes.includes("D13"));
});
