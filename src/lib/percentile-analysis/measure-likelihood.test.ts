import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildLikelihoodPoint,
  getMeasureLikelihoodData,
  getMeasureLikelihoodTableData,
  getMeasureStarPercentileData,
} from "@/lib/percentile-analysis/measure-likelihood";
import { deriveMeasureStarRating, loadMeasureCutPoints, matchCutPointToMeasureName } from "@/lib/percentile-analysis/measure-matching";
import type { MeasureCutPoint, MeasureObservation } from "@/lib/percentile-analysis/measure-likelihood-types";

const cutPointsPath = path.join(process.cwd(), "data", "Stars 2016-2028 Cut Points 12.2025_with_weights.xlsx");

function makeCutPoint(overrides: Partial<MeasureCutPoint> = {}): MeasureCutPoint {
  return {
    hlCode: "HL01",
    measureName: "Breast Cancer Screening",
    domain: "HEDIS",
    year: 2024,
    weight: 1,
    thresholds: {
      oneStarUpperBound: null,
      twoStar: 50,
      threeStar: 65,
      fourStar: 75,
      fiveStar: 85,
    },
    ...overrides,
  };
}

function makeObservation(percentile: number, starRating: MeasureObservation["starRating"]): MeasureObservation {
  return {
    year: 2024,
    contractId: `H${percentile}`,
    contractName: "Contract",
    orgName: "Org",
    measureCode: "C01",
    measureName: "Breast Cancer Screening",
    score: percentile,
    percentile,
    starRating,
    inverted: false,
    yearWeight: 1,
  };
}

test("loadMeasureCutPoints reads 2024-2026 cut points workbook", () => {
  const byYear = loadMeasureCutPoints(cutPointsPath, [2024, 2025, 2026]);

  assert.equal(byYear.get(2024)?.length, 40);
  assert.equal(byYear.get(2025)?.length, 40);
  assert.equal(byYear.get(2026)?.length, 45);
  assert.ok(byYear.get(2024)?.some((entry) => entry.measureName === "Breast Cancer Screening"));
});

test("matchCutPointToMeasureName supports stable-name matching", () => {
  const byYear = loadMeasureCutPoints(cutPointsPath, [2024]);
  const cutPoints = byYear.get(2024) ?? [];

  const breastCancer = matchCutPointToMeasureName("Breast Cancer Screening", "C", cutPoints);
  const callCenterPartC = matchCutPointToMeasureName(
    "Call Center Foreign Language Interpreter and TTY Availability Part C",
    "C",
    cutPoints
  );

  assert.equal(breastCancer?.measureName, "Breast Cancer Screening");
  assert.equal(callCenterPartC?.measureName, "Call Center - FFI / TTY (Part C)");
});

test("matchCutPointToMeasureName distinguishes Call Center Part C from Part D", () => {
  const byYear = loadMeasureCutPoints(cutPointsPath, [2024]);
  const cutPoints = byYear.get(2024) ?? [];

  const partC = matchCutPointToMeasureName(
    "Call Center Foreign Language Interpreter and TTY Availability",
    "C",
    cutPoints
  );
  const partD = matchCutPointToMeasureName(
    "Call Center Foreign Language Interpreter and TTY Availability",
    "D",
    cutPoints
  );

  assert.equal(partC?.measureName, "Call Center - FFI / TTY (Part C)");
  assert.equal(partD?.measureName, "Call Center - FFI / TTY (Part D)");
});

test("deriveMeasureStarRating handles normal and inverted cut points", () => {
  const normalCutPoint = makeCutPoint();
  const invertedCutPoint = makeCutPoint({
    measureName: "Members Choosing to Leave",
    thresholds: {
      oneStarUpperBound: null,
      twoStar: 18,
      threeStar: 12,
      fourStar: 8,
      fiveStar: 5,
    },
  });

  assert.equal(deriveMeasureStarRating(90, normalCutPoint, false), 5);
  assert.equal(deriveMeasureStarRating(76, normalCutPoint, false), 4);
  assert.equal(deriveMeasureStarRating(40, normalCutPoint, false), 1);

  assert.equal(deriveMeasureStarRating(4, invertedCutPoint, true), 5);
  assert.equal(deriveMeasureStarRating(9, invertedCutPoint, true), 3);
  assert.equal(deriveMeasureStarRating(20, invertedCutPoint, true), 1);
});

test("buildLikelihoodPoint expands the percentile window when samples are sparse", () => {
  const observations = [
    ...Array.from({ length: 10 }, (_, index) => makeObservation(79 + index * 0.1, 4)),
    ...Array.from({ length: 10 }, (_, index) => makeObservation(84 + index * 0.1, 5)),
  ];

  const point = buildLikelihoodPoint(observations, 80);

  assert.equal(point.sampleSize, 20);
  assert.equal(point.windowStart, 75);
  assert.equal(point.windowEnd, 85);
  assert.equal(point.distribution.fourStar, 50);
  assert.equal(point.distribution.fiveStar, 50);
  assert.equal(point.distribution.fourPlus, 100);
});

test("getMeasureLikelihoodData returns pooled and yearly results for a real measure", async () => {
  const payload = await getMeasureLikelihoodData({
    method: "percentrank_inc",
    measure: "Breast Cancer Screening",
    percentile: "80",
  });

  assert.equal(payload.status, "ready");
  assert.equal(payload.selectedMeasure, "Breast Cancer Screening");
  assert.ok(payload.availableMeasures.length > 0);
  assert.ok(payload.metadataByYear.some((metadata) => metadata.year === 2024));
  assert.ok(payload.series.some((series) => series.key === "pooled"));
  assert.ok(payload.series.some((series) => series.key === "2024"));
});

test("getMeasureLikelihoodTableData returns all-measure rows for pooled and 2026 views", async () => {
  const payload = await getMeasureLikelihoodTableData({
    method: "percentrank_inc",
    targetStar: "4",
  });

  assert.equal(payload.status, "ready");
  assert.equal(payload.targetStar, 4);
  assert.equal(payload.percentileColumns.length, 101);
  assert.equal(payload.views.length, 2);
  assert.equal(payload.views[0]?.key, "pooled_2024_2026");
  assert.equal(payload.views[1]?.key, "year_2026");
  assert.ok(payload.views[0]?.rows.some((row) => row.measureName === "Breast Cancer Screening"));
  assert.equal(payload.views[0]?.rows[0]?.cells.length, 101);
});

test("getMeasureStarPercentileData returns selected star percentile equivalents", async () => {
  const payload = await getMeasureStarPercentileData({
    method: "percentrank_inc",
    measure: "Breast Cancer Screening",
    star: "4",
  });

  assert.equal(payload.status, "ready");
  assert.equal(payload.selectedMeasure, "Breast Cancer Screening");
  assert.equal(payload.selectedStar, 4);
  assert.ok(payload.yearlyResults.some((result) => result.year === 2026));
  assert.equal(typeof payload.year2026Result?.percentileEquivalent, "number");
});
