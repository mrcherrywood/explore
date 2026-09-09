import assert from "node:assert/strict";
import test from "node:test";

import type {
  PlanPreviewContractMeasurePrediction,
  PlanPreviewPredictionsResult,
} from "./predictions";
import {
  buildResultsBookCompare,
  splitBookCompareRows,
} from "./results-book-compare";

function measure(
  measureCode: string,
  score: number | null,
  inverted = false,
): PlanPreviewContractMeasurePrediction {
  return {
    measureNormalized: measureCode.toLowerCase(),
    displayName: measureCode,
    measureCode,
    score,
    weight: 1,
    inverted,
    predictedStar: null,
    starSource: null,
    baseGroupStar: null,
    baselineOfficialStar: null,
    forecastStar: null,
    predictionStatus: "ready",
  };
}

function predictions(
  contracts: { contractId: string; measures: PlanPreviewContractMeasurePrediction[] }[],
): PlanPreviewPredictionsResult {
  return {
    starsYear: 2027,
    baselineYear: 2026,
    generatedAt: "2026-09-01T00:00:00.000Z",
    summary: {
      measureCount: 3,
      readyCount: 3,
      unavailableCount: 0,
      unsupportedCount: 0,
      warningCount: 0,
      accruedContractCount: contracts.length,
      forecastFillCount: 0,
      cahpsPlanStarCount: 0,
    },
    cutPoints: [],
    contracts: contracts.map((contract) => ({
      ...contract,
      contractName: null,
      parentOrganization: null,
      scoredMeasureCount: contract.measures.length,
      ratedMeasureCount: 0,
      weightedMeanStar: null,
    })),
  };
}

const reportMeasures = [
  { measureCode: "C01", measureDisplayName: "Breast Cancer Screening", weight: 1, pp1Score: 80, inverted: false },
  { measureCode: "C28", measureDisplayName: "Complaints about the Health Plan", weight: 2, pp1Score: 0.1, inverted: true },
  { measureCode: "C30", measureDisplayName: "Health Plan Quality Improvement", weight: 5, pp1Score: null },
  { measureCode: "D08", measureDisplayName: "Diabetes Meds", weight: 3, pp1Score: 88, inverted: false },
];

test("compares the contract to the mean of the other book contracts and flips inverted measures", () => {
  const compare = buildResultsBookCompare({
    contractId: "H1234",
    measures: reportMeasures,
    predictions: predictions([
      { contractId: "H1234", measures: [measure("C01", 80), measure("C28", 0.1, true), measure("D08", 88)] },
      { contractId: "H5678", measures: [measure("C01", 70), measure("C28", 0.3, true), measure("D08", 88)] },
      { contractId: "H9012", measures: [measure("C01", 74), measure("C28", 0.5, true), measure("D08", null)] },
    ]),
  });

  assert.equal(compare.bookContractCount, 2);
  assert.equal(compare.rows.length, 3);

  const breast = compare.rows.find((row) => row.measureCode === "C01");
  assert.equal(breast?.bookMean, 72);
  assert.equal(breast?.bookContracts, 2);
  assert.equal(breast?.delta, 8);
  assert.equal(breast?.advantage, 8);

  const complaints = compare.rows.find((row) => row.measureCode === "C28");
  assert.equal(complaints?.bookMean, 0.4);
  assert.equal(complaints?.delta, -0.3);
  assert.equal(complaints?.advantage, 0.3);

  const diabetes = compare.rows.find((row) => row.measureCode === "D08");
  assert.equal(diabetes?.bookContracts, 1);
  assert.equal(diabetes?.advantage, 0);

  assert.equal(compare.leads, 1);
  assert.equal(compare.even, 2);
  assert.equal(compare.trails, 0);
  assert.deepEqual(
    compare.rows.map((row) => row.measureCode),
    ["C01", "C28", "D08"],
  );
});

test("treats an advantage within 1 point as even", () => {
  const compare = buildResultsBookCompare({
    contractId: "H1234",
    measures: [
      { measureCode: "C01", measureDisplayName: "A", weight: 1, pp1Score: 51 },
      { measureCode: "C02", measureDisplayName: "B", weight: 1, pp1Score: 51.01 },
      { measureCode: "C03", measureDisplayName: "C", weight: 1, pp1Score: 49 },
      { measureCode: "C04", measureDisplayName: "D", weight: 1, pp1Score: 48.99 },
    ],
    predictions: predictions([
      {
        contractId: "H5678",
        measures: [
          measure("C01", 50),
          measure("C02", 50),
          measure("C03", 50),
          measure("C04", 50),
        ],
      },
    ]),
  });
  const { leads, trails, even } = splitBookCompareRows(compare);
  assert.deepEqual(even.map((row) => row.measureCode), ["C01", "C03"]);
  assert.deepEqual(leads.map((row) => row.measureCode), ["C02"]);
  assert.deepEqual(trails.map((row) => row.measureCode), ["C04"]);
});

test("splits leads and trails with trails ordered most-negative first", () => {
  const compare = buildResultsBookCompare({
    contractId: "H1234",
    measures: [
      { measureCode: "C01", measureDisplayName: "A", weight: 1, pp1Score: 50 },
      { measureCode: "C02", measureDisplayName: "B", weight: 1, pp1Score: 50 },
      { measureCode: "C03", measureDisplayName: "C", weight: 1, pp1Score: 50 },
    ],
    predictions: predictions([
      { contractId: "H5678", measures: [measure("C01", 60), measure("C02", 45), measure("C03", 70)] },
    ]),
  });
  const { leads, trails, even } = splitBookCompareRows(compare);
  assert.deepEqual(leads.map((row) => row.measureCode), ["C02"]);
  assert.deepEqual(trails.map((row) => row.measureCode), ["C03", "C01"]);
  assert.equal(even.length, 0);
});

test("returns an empty comparison without predictions or without other book contracts", () => {
  assert.equal(
    buildResultsBookCompare({ contractId: "H1234", measures: reportMeasures, predictions: null }).rows.length,
    0,
  );
  const solo = buildResultsBookCompare({
    contractId: "H1234",
    measures: reportMeasures,
    predictions: predictions([{ contractId: "H1234", measures: [measure("C01", 80)] }]),
  });
  assert.equal(solo.bookContractCount, 0);
  assert.equal(solo.rows.length, 0);
});
