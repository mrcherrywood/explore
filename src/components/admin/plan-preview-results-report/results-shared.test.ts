import assert from "node:assert/strict";
import test from "node:test";

import {
  isQualityImprovementMeasure,
  qualityImprovementMeasure,
} from "./results-shared";

test("isQualityImprovementMeasure matches CMS QI labels, not other measures", () => {
  assert.equal(isQualityImprovementMeasure("Health Plan Quality Improvement"), true);
  assert.equal(isQualityImprovementMeasure("C29: Health Plan Quality Improvement"), true);
  assert.equal(isQualityImprovementMeasure("Drug Plan Quality Improvement"), true);
  assert.equal(isQualityImprovementMeasure("Breast Cancer Screening"), false);
});

test("qualityImprovementMeasure finds 2027 C29 / D04 instead of the 2026 C30 code", () => {
  const measures = [
    { measureCode: "C30", measureDisplayName: "Plan Makes Timely Decisions about Appeals", star: 4 },
    { measureCode: "C29", measureDisplayName: "Health Plan Quality Improvement", star: 3 },
    { measureCode: "D04", measureDisplayName: "Drug Plan Quality Improvement", star: 4 },
  ];
  assert.equal(qualityImprovementMeasure(measures, "Part C")?.measureCode, "C29");
  assert.equal(qualityImprovementMeasure(measures, "Part C")?.star, 3);
  assert.equal(qualityImprovementMeasure(measures, "Part D")?.measureCode, "D04");
  assert.equal(qualityImprovementMeasure(measures, "Part D")?.star, 4);
});
