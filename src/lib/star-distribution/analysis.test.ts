import assert from "node:assert/strict";
import test from "node:test";

import { getMeasureYearScoreSamples, getMeasureYearStarSamples } from "@/lib/band-movement/analysis";
import { isEligibleOverlayContract } from "@/lib/cutpoint-forecast/pp1-overlay";

import { analyzeStarDistribution } from "./analysis";
import { sliceForPeriod } from "./stats";

const BCS = "breast cancer screening partc";
const EMPTY_INVENTORY = { forecast: 0, pp1: 0, combined: 0, both: 0 };

test("when the book is the full eligible market, 4-star shares match CMS", () => {
  const market = new Set(
    getMeasureYearStarSamples(BCS, 2026)
      .filter((sample) => isEligibleOverlayContract(sample.contractId))
      .map((sample) => sample.contractId)
  );
  assert.ok(market.size > 100);

  const result = analyzeStarDistribution(market, "combined", {
    ...EMPTY_INVENTORY,
    combined: market.size,
  });
  const measure = result.measures.find((row) => row.normalizedName === BCS);
  assert.ok(measure);
  const y2026 = measure.years.find((row) => row.year === 2026);
  assert.ok(y2026);
  assert.equal(y2026.book.pct[3], y2026.cms.pct[3]);
  assert.equal(y2026.book.fourPlus, y2026.cms.fourPlus);
  assert.equal(y2026.fourStarDelta, 0);
  assert.equal(y2026.book.n, y2026.cms.n);
});

test("an empty book reports zero 4-star share against a real CMS market", () => {
  const result = analyzeStarDistribution(new Set(), "combined", EMPTY_INVENTORY);
  const measure = result.measures.find((row) => row.normalizedName === BCS);
  assert.ok(measure);
  const y2026 = measure.years.find((row) => row.year === 2026);
  assert.ok(y2026);
  assert.equal(y2026.book.n, 0);
  assert.equal(y2026.book.pct[3], 0);
  assert.ok(y2026.cms.n > 0);
  assert.ok(y2026.cms.pct[3] > 0);
});

test("Quality Improvement measures are excluded from the measure list", () => {
  const result = analyzeStarDistribution(new Set(), "combined", EMPTY_INVENTORY);
  assert.equal(
    result.measures.some((row) => /quality improvement/i.test(row.name)),
    false
  );
  assert.ok(result.measures.some((row) => row.normalizedName === BCS));
});

test("measures are listed Part C first, then Part D", () => {
  const result = analyzeStarDistribution(new Set(), "combined", EMPTY_INVENTORY);
  const parts = result.measures.map((row) =>
    row.normalizedName.endsWith(" partd") ? "D" : "C"
  );
  assert.ok(parts.includes("C"));
  assert.ok(parts.includes("D"));
  assert.deepEqual(
    parts,
    [...parts].sort((left, right) => left.localeCompare(right))
  );
  assert.equal(result.measures[0].normalizedName.endsWith(" partd"), false);
  assert.equal(
    result.measures[result.measures.length - 1].normalizedName.endsWith(" partd"),
    true
  );
});

test("recency-weighted window matches CMS when the book is the full last-3 market", () => {
  const market = new Set<string>();
  for (const year of [2024, 2025, 2026]) {
    for (const sample of getMeasureYearStarSamples(BCS, year)) {
      if (isEligibleOverlayContract(sample.contractId)) {
        market.add(sample.contractId);
      }
    }
  }
  const result = analyzeStarDistribution(market, "combined", EMPTY_INVENTORY);
  const measure = result.measures.find((row) => row.normalizedName === BCS);
  assert.ok(measure);
  const slice = sliceForPeriod(result, "last3W", measure);
  assert.ok(slice.cms.n > measure.last3.cms.n);
  assert.equal(slice.fourStarDelta, 0);
  assert.equal(slice.book.fourPlus, slice.cms.fourPlus);
});

test("when the book is the full eligible market, average scores match CMS", () => {
  const market = new Set(
    getMeasureYearScoreSamples(BCS, 2026)
      .filter((sample) => isEligibleOverlayContract(sample.contractId))
      .map((sample) => sample.contractId)
  );
  const result = analyzeStarDistribution(market, "combined", {
    ...EMPTY_INVENTORY,
    combined: market.size,
  });
  const measure = result.measures.find((row) => row.normalizedName === BCS);
  assert.ok(measure);
  const y2026 = measure.years.find((row) => row.year === 2026);
  assert.ok(y2026);
  assert.equal(y2026.score.book.mean, y2026.score.cms.mean);
  assert.equal(y2026.score.meanDelta, 0);
  assert.equal(y2026.score.book.n, y2026.score.cms.n);
  assert.ok(y2026.score.cms.n > 0);
});

test("an empty book reports no average score against a real CMS market", () => {
  const result = analyzeStarDistribution(new Set(), "combined", EMPTY_INVENTORY);
  const measure = result.measures.find((row) => row.normalizedName === BCS);
  assert.ok(measure);
  const y2026 = measure.years.find((row) => row.year === 2026);
  assert.ok(y2026);
  assert.equal(y2026.score.book.n, 0);
  assert.equal(y2026.score.meanDelta, 0);
  assert.ok(y2026.score.cms.n > 0);
  assert.ok(y2026.score.cms.mean > 0);
});

test("Complaints is flagged inverted; Breast Cancer Screening is not", () => {
  const result = analyzeStarDistribution(new Set(), "combined", EMPTY_INVENTORY);
  const bcs = result.measures.find((row) => row.normalizedName === BCS);
  const complaints = result.measures.find((row) =>
    /complaint/i.test(row.name)
  );
  assert.ok(bcs);
  assert.equal(bcs.inverted, false);
  assert.ok(complaints);
  assert.equal(complaints.inverted, true);
});
