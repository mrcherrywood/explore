import assert from "node:assert/strict";
import test from "node:test";

import {
  alignNormalizedPartToCode,
  isCompatibleUniverseMatch,
  resolveMeasureForPlanPreview,
  toBaselineMeasureCode,
} from "./measure-resolve";

test("toBaselineMeasureCode translates shifted 2027 codes to 2026 equivalents", () => {
  // Stars 2027 renumbered the C-codes after C16 (Medication Reconciliation retired).
  assert.equal(
    toBaselineMeasureCode("members choosing to leave the plan partc", "C28", 2026),
    "C29"
  );
  assert.equal(
    toBaselineMeasureCode("health plan quality improvement partc", "C29", 2026),
    "C30"
  );
  assert.equal(
    toBaselineMeasureCode("complaints about the health plan partc", "C27", 2026),
    "C28"
  );
});

test("toBaselineMeasureCode keeps the C/D prefix for shared-name twins", () => {
  // The 2027 file's D03 rows resolve to the Part C variant name; translation
  // must not cross to C29 or the twin would be double counted.
  assert.equal(
    toBaselineMeasureCode("members choosing to leave the plan partc", "D03", 2026),
    "D03"
  );
  assert.equal(
    toBaselineMeasureCode("complaints about the drug plan partd", "D02", 2026),
    "D02"
  );
});

test("toBaselineMeasureCode falls back to the file code for new measures", () => {
  assert.equal(
    toBaselineMeasureCode("polypharmacy use of multiple anticholinergic medications", "D13", 2026),
    "D13"
  );
});

test("alignNormalizedPartToCode corrects Part C/D twins mistitled in the PP1 file", () => {
  assert.equal(
    alignNormalizedPartToCode(
      "call center foreign language interpreter and tty availability partc",
      "D01"
    ),
    "call center foreign language interpreter and tty availability partd"
  );
  assert.equal(
    alignNormalizedPartToCode("members choosing to leave the plan partc", "D03"),
    "members choosing to leave the plan partd"
  );
  assert.equal(
    alignNormalizedPartToCode("members choosing to leave the plan partc", "C28"),
    "members choosing to leave the plan partc"
  );
});

test("PP1 file names win over prior-year code fallbacks for replaced measures", () => {
  const functional = resolveMeasureForPlanPreview(
    "C09",
    "Care for Older Adults - Functional Status Assessment"
  );
  assert.match(functional.displayName, /Functional Status Assessment/i);
  assert.doesNotMatch(functional.displayName, /Pain Assessment/i);
  assert.match(functional.normalizedName, /functional status/);

  const cob = resolveMeasureForPlanPreview(
    "D12",
    "Concurrent Use of Opioids and Benzodiazepines (COB)"
  );
  assert.match(cob.displayName, /Opioids and Benzodiazepines|COB/i);
  assert.doesNotMatch(cob.displayName, /Statin Use/i);
  assert.match(cob.normalizedName, /opioid|benzo|cob/);
});

test("isCompatibleUniverseMatch rejects Pain vs Functional Status and SUPD vs COB", () => {
  assert.equal(
    isCompatibleUniverseMatch(
      "Care for Older Adults - Functional Status Assessment",
      "care for older adults pain assessment partc"
    ),
    false
  );
  assert.equal(
    isCompatibleUniverseMatch(
      "Concurrent Use of Opioids and Benzodiazepines (COB)",
      "statin use in persons with diabetes supd partd"
    ),
    false
  );
  assert.equal(
    isCompatibleUniverseMatch("Breast Cancer Screening", "breast cancer screening partc"),
    true
  );
});
