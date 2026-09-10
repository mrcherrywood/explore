import assert from "node:assert/strict";
import test from "node:test";

import { CLOVER_COMPUTED_SCENARIOS, OFFICIAL_RECALC_REMOVED_CODES } from "@/lib/clover-impact/scenarios";

import {
  buildOfficialRemovalScenarios,
  caiFromOfficialSummaries,
  overlayOfficialStarsOnPredictions,
} from "./official-scenarios";
import type { PlanPreviewPredictionsResult } from "./predictions";
import type { OfficialStarRow, OfficialSummaryRow } from "./store-official";

function star(overrides: Partial<OfficialStarRow>): OfficialStarRow {
  return {
    contractId: "H8928",
    contractName: "Fallon",
    organizationMarketingName: "Fallon",
    parentOrganization: "Fallon",
    measureCode: "C01",
    measureDisplayName: "Breast Cancer Screening",
    measureNormalized: "breast cancer screening partc",
    metricCategory: "Part C",
    star: 4,
    status: "scored",
    qiSignificance: null,
    ...overrides,
  };
}

function summary(overrides: Partial<OfficialSummaryRow>): OfficialSummaryRow {
  return {
    contractId: "H8928",
    contractName: "Fallon",
    organizationMarketingName: "Fallon",
    parentOrganization: "Fallon",
    ratingType: "overall",
    contractType: "CCP",
    snpPlans: "Yes",
    disasterYear1: null,
    disasterPct1: null,
    disasterYear2: null,
    disasterPct2: null,
    measuresRequired: null,
    measuresMissing: 0,
    measuresRated: 40,
    calculatedMean: 3.5,
    calculatedVariance: 1,
    scorePercentileRank: 50,
    variancePercentileRank: 50,
    varianceCategory: "medium",
    rewardFactor: 0.1,
    interimSummary: 3.5,
    fac: "2",
    caiValue: 0.043,
    finalSummary: 3.573,
    improvementUsage: "Yes",
    newMeasureUsage: "Yes",
    finalRating: 3.5,
    partCSummaryRating: 3.5,
    partDSummaryRating: 4,
    improvementScore: 0.11,
    ...overrides,
  };
}

const emptyPredictions: PlanPreviewPredictionsResult = {
  starsYear: 2027,
  baselineYear: 2026,
  generatedAt: "2026-01-01T00:00:00.000Z",
  summary: {
    measureCount: 0,
    readyCount: 0,
    unavailableCount: 0,
    unsupportedCount: 0,
    warningCount: 0,
    accruedContractCount: 0,
    forecastFillCount: 0,
    cahpsPlanStarCount: 0,
  },
  cutPoints: [],
  contracts: [
    {
      contractId: "H8928",
      contractName: "PP1 name",
      parentOrganization: "PP1 org",
      scoredMeasureCount: 1,
      ratedMeasureCount: 1,
      weightedMeanStar: 3,
      measures: [
        {
          measureNormalized: "breast cancer screening partc",
          displayName: "Breast Cancer Screening",
          measureCode: "C01",
          score: 70,
          weight: 1,
          inverted: false,
          predictedStar: 3,
          starSource: "cut_points",
          baseGroupStar: null,
          baselineOfficialStar: 3,
          forecastStar: 3,
          predictionStatus: "ready",
        },
      ],
    },
  ],
};

test("overlayOfficialStarsOnPredictions uses official Tech Notes weights over prior-year fallbacks", () => {
  const overlaid = overlayOfficialStarsOnPredictions(
    emptyPredictions,
    [
      star({
        measureCode: "C04",
        measureDisplayName: "Improving or Maintaining Physical Health",
        measureNormalized: "improving or maintaining physical health partc",
        star: 2,
      }),
    ],
    new Map([["C04", 1]]),
    2027,
  );
  const contract = overlaid.contracts.find((row) => row.contractId === "H8928");
  assert.equal(contract?.measures.find((row) => row.measureCode === "C04")?.weight, 3);
});

test("overlayOfficialStarsOnPredictions replaces PP1 stars with official PP2 stars", () => {
  const overlaid = overlayOfficialStarsOnPredictions(
    emptyPredictions,
    [
      star({ star: 5 }),
      star({
        measureCode: "C29",
        measureDisplayName: "Health Plan Quality Improvement",
        measureNormalized: "health plan quality improvement partc",
        star: 3,
      }),
    ],
    new Map([["C01", 1], ["C30", 5]]),
    2027,
  );
  const contract = overlaid.contracts.find((row) => row.contractId === "H8928");
  assert.equal(contract?.measures.find((row) => row.measureCode === "C01")?.predictedStar, 5);
  const qi = contract?.measures.find((row) => row.measureCode === "C29");
  assert.equal(qi?.predictedStar, 3);
  assert.equal(qi?.weight, 5);
});

test("buildOfficialRemovalScenarios uses official Technical Notes reward-factor thresholds", () => {
  const scenarios = buildOfficialRemovalScenarios(
    2027,
    emptyPredictions,
    [star()],
    [summary()],
    new Map([["C01", 1]]),
  );
  const baseline = scenarios.find((scenario) => scenario.id === "baseline");
  assert.ok(baseline?.notes.some((note) => /Technical Notes/.test(note)));
  assert.equal(baseline?.thresholds.withQi?.mean65th, 3.545455);
});

test("official recalc and Model 2 drop Stars 2027 Poly-ACH (D13)", () => {
  assert.ok(OFFICIAL_RECALC_REMOVED_CODES.has("D13"));
  const model2 = CLOVER_COMPUTED_SCENARIOS.find((scenario) => scenario.id === "model2");
  const model1 = CLOVER_COMPUTED_SCENARIOS.find((scenario) => scenario.id === "model1");
  assert.ok(model2?.removedCodes.has("D13"));
  assert.equal(model1?.removedCodes.has("D13"), false);
});

test("caiFromOfficialSummaries splits Overall / Part C / Part D CAI", () => {
  const cai = caiFromOfficialSummaries([
    summary({ caiValue: 0.043 }),
    summary({ ratingType: "part_c", caiValue: -0.01 }),
    summary({ ratingType: "part_d", caiValue: 0.02 }),
  ]);
  assert.equal(cai.overall.H8928, 0.043);
  assert.equal(cai.partC.H8928, -0.01);
  assert.equal(cai.partD.H8928, 0.02);
});
