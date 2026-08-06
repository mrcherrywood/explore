import assert from "node:assert/strict";
import test from "node:test";

import { getMarketingSamplePlanPreviewReport } from "./marketing-sample-report";

const REAL_DOMAINS = new Set([
  "CAHPS",
  "HEDIS",
  "HOS",
  "Operations",
  "Pharmacy",
  "Quality Improvement",
]);

test("marketing sample matches live report structure and real domains", () => {
  const report = getMarketingSamplePlanPreviewReport();

  assert.equal(report.contract.contractId, "H4721");
  assert.equal(report.starsYear, 2027);
  assert.equal(report.baselineYear, 2026);
  assert.ok(report.measures.length >= 30);
  assert.ok(report.scenarios.length >= 6);
  assert.ok(report.history.length >= 3);
  assert.ok(report.qiSensitivity?.length === 5);
  assert.ok(
    report.domains.every((domain) => "recalculatedMean" in domain),
    "domains should include Stars recalculated means"
  );

  for (const domain of report.domains) {
    assert.ok(
      REAL_DOMAINS.has(domain.domain),
      `unexpected domain label: ${domain.domain}`
    );
  }
  for (const measure of report.measures) {
    assert.ok(measure.domain, `${measure.measureCode} missing domain`);
    assert.ok(
      REAL_DOMAINS.has(measure.domain!),
      `${measure.measureCode} has non-production domain ${measure.domain}`
    );
    assert.ok(
      measure.predictedStar === null || Number.isInteger(measure.predictedStar)
    );
  }

  const baseline = report.scenarios.find((s) => s.id === "baseline");
  assert.ok(baseline?.score);
  assert.equal(baseline?.score?.selectedLeg, "without_qi");
  assert.ok(baseline?.score?.qualifiesOverall);

  const yoy =
    report.yoySummary.declined +
    report.yoySummary.held +
    report.yoySummary.improved +
    report.yoySummary.newOrUnrated;
  assert.equal(yoy, report.measures.length);
});
