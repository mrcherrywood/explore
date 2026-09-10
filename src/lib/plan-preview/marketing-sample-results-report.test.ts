import assert from "node:assert/strict";
import test from "node:test";

import { getMarketingSampleResultsReport } from "./marketing-sample-results-report";
import { buildupChecksOut } from "./results-report-data";
import { OFFICIAL_STARS, SAMPLE_CONTRACT_ID } from "./synthetic-pp2-catalog";

const REAL_DOMAINS = new Set([
  "CAHPS",
  "HEDIS",
  "HOS",
  "Operations",
  "Pharmacy",
  "Quality Improvement",
]);

const LIVE_CONTRACT_IDS = ["H8928", "H5549", "H3668", "H1846", "H6910"];

/** Stars 2027 Fallon H8928 fingerprint the sample must not reproduce. */
const FALLON_H8928: Record<string, number> = {
  C03: 5,
  C04: 2,
  C07: 5,
  C31: 2,
  D08: 2,
  D12: 1,
  D13: 2,
};

test("PP2 marketing sample matches official-report structure on synthetic Northstar", () => {
  const report = getMarketingSampleResultsReport();

  assert.equal(report.contract.contractId, SAMPLE_CONTRACT_ID);
  assert.equal(report.contract.contractName, "Northstar Advantage (HMO)");
  assert.equal(report.starsYear, 2027);
  assert.equal(report.baselineYear, 2026);
  assert.ok(report.measures.length >= 30);
  assert.ok(report.scenarios.length >= 5);
  assert.ok(report.history.length >= 3);
  assert.ok(report.bookCompare.rows.length >= 20);
  assert.ok(report.bookCompare.bookContractCount >= 6);
  assert.ok(report.bookCompare.leads >= 10);
  assert.ok(report.bookCompare.trails >= 10);
  const bookMovers = report.bookCompare.rows.filter((row) => Math.abs(row.advantage) > 1);
  assert.ok(bookMovers.length >= 20);
  for (const row of bookMovers) {
    const printed = Math.abs(row.advantage).toFixed(1);
    assert.ok(
      !printed.endsWith(".0"),
      `${row.measureCode} advantage ${row.advantage} should print as a decimal, not ${printed}`,
    );
  }

  const blob = JSON.stringify(report);
  for (const contractId of LIVE_CONTRACT_IDS) {
    assert.equal(blob.includes(contractId), false, `sample leaked ${contractId}`);
  }

  for (const domain of report.domains) {
    assert.ok(REAL_DOMAINS.has(domain.domain), `unexpected domain: ${domain.domain}`);
  }
  for (const measure of report.measures) {
    assert.ok(measure.domain, `${measure.measureCode} missing domain`);
    assert.ok(
      REAL_DOMAINS.has(measure.domain!),
      `${measure.measureCode} has non-production domain ${measure.domain}`,
    );
    assert.ok(measure.star === null || Number.isInteger(measure.star));
    assert.ok(
      measure.pp1PredictedStar === null || Number.isInteger(measure.pp1PredictedStar),
    );
  }

  const yoy =
    report.yoySummary.declined +
    report.yoySummary.held +
    report.yoySummary.improved +
    report.yoySummary.newOrUnrated;
  assert.equal(yoy, report.measures.length);
  assert.ok(report.yoySummary.improved > 0);
  assert.ok(report.yoySummary.declined > 0);

  for (const name of ["CAHPS", "HOS", "Quality Improvement"]) {
    const domain = report.domains.find((row) => row.domain === name);
    assert.ok(domain, `missing ${name} domain`);
    assert.ok(domain?.officialMean != null && domain.baselineMean != null);
    assert.notEqual(
      domain?.officialMean,
      domain?.baselineMean,
      `${name} official and prior-year means should differ`,
    );
  }
});

test("PP2 marketing sample is not a relabeled live contract", () => {
  for (const [code, star] of Object.entries(FALLON_H8928)) {
    assert.notEqual(OFFICIAL_STARS[code], star, `${code} still matches Fallon H8928`);
  }
  assert.equal(OFFICIAL_STARS.C07, null);
  assert.equal(OFFICIAL_STARS.C08, null);
  assert.equal(OFFICIAL_STARS.C09, null);
});

test("PP2 marketing sample official buildup and PP1 accuracy hold together", () => {
  const report = getMarketingSampleResultsReport();
  const { accuracySummary, overall, rewardFactorThresholds } = report;

  assert.ok(overall);
  assert.equal(buildupChecksOut(overall), true);
  assert.ok(overall?.finalRating === 3.5 || overall?.finalRating === 4);
  assert.equal(accuracySummary.overallOfficial, overall?.finalRating);
  assert.ok(accuracySummary.overallPredicted);
  assert.ok(accuracySummary.compared >= 30);
  assert.equal(accuracySummary.withinOne, accuracySummary.compared);
  assert.ok(
    accuracySummary.exact / accuracySummary.compared >= 0.8,
    `exact rate ${accuracySummary.exact}/${accuracySummary.compared} should stay high`,
  );
  assert.ok(accuracySummary.pp1Published);
  assert.ok(
    Math.abs((accuracySummary.pp1Published?.finalScoreRaw ?? 0) - (overall?.finalSummary ?? 0)) < 0.03,
    `PP1 final ${accuracySummary.pp1Published?.finalScoreRaw} should sit close to official ${overall?.finalSummary}`,
  );
  const qiMovers = report.measures.filter((measure) => {
    const text = (measure.qiSignificance ?? "").toLowerCase();
    return text.includes("improv") || text.includes("declin");
  });
  assert.ok(qiMovers.length >= 10, "sample should have enough significant QI movers to fill the table");
  assert.ok(report.partC?.improvementScore != null, "Part C QI score should be listed");
  assert.ok(report.partD?.improvementScore != null, "Part D QI score should be listed");
  assert.ok(rewardFactorThresholds);
  assert.equal(rewardFactorThresholds?.improvementIncluded, true);
  assert.equal(rewardFactorThresholds?.newMeasuresIncluded, true);

  const baseline = report.scenarios.find((scenario) => scenario.id === "baseline");
  assert.ok(baseline?.score);
  assert.equal(baseline?.score?.contractId, SAMPLE_CONTRACT_ID);
  assert.ok(baseline?.score?.finalScoreRaw);
  assert.ok(
    Math.abs((baseline?.score?.finalScoreRaw ?? 0) - (overall?.finalSummary ?? 0)) < 0.01,
    "All-measures scenario should match the published official final summary",
  );
});
