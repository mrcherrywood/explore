import assert from "node:assert/strict";
import test from "node:test";

import { scoreForecastOnOfficialInputs } from "./forecast-official-score";
import {
  buildPlanPreviewResultsReport,
  buildupChecksOut,
  publishedScoreFromForecast,
  resolveRewardFactorThresholds,
} from "./results-report-data";
import type { OfficialStarRow, OfficialSummaryRow } from "./store-official";

function summary(overrides: Partial<OfficialSummaryRow> = {}): OfficialSummaryRow {
  return {
    contractId: "H1304",
    contractName: "REGENCE",
    organizationMarketingName: "Regence",
    parentOrganization: "Cambia Health Solutions, Inc.",
    ratingType: "overall",
    contractType: "CCP",
    snpPlans: "No",
    disasterYear1: 2023,
    disasterPct1: 0,
    disasterYear2: 2024,
    disasterPct2: 0,
    measuresRequired: "19 of 38",
    measuresMissing: 1,
    measuresRated: 39,
    calculatedMean: 3.356164,
    calculatedVariance: 1.219484,
    scorePercentileRank: 39,
    variancePercentileRank: 65,
    varianceCategory: "medium",
    rewardFactor: 0,
    interimSummary: 3.356164,
    fac: "2",
    caiValue: -0.040422,
    finalSummary: 3.315742,
    improvementUsage: "Yes",
    newMeasureUsage: "Yes",
    finalRating: 3.5,
    partCSummaryRating: 3.5,
    partDSummaryRating: 3.5,
    improvementScore: 0.28,
    ...overrides,
  };
}

test("publishedScoreFromForecast uses the without-QI PP1 report score, not a with-QI restatement", () => {
  const published = publishedScoreFromForecast({
    contractId: "H8928",
    contractName: null,
    parentOrganization: null,
    caiValue: 0.043,
    withQi: {
      measureCount: 43,
      baseMean: 3.5,
      weightedVariance: 1.1,
      rewardFactor: 0,
      meanCategory: "medium",
      varianceCategory: "medium",
      finalScoreRaw: 3.543,
    },
    withoutQi: {
      measureCount: 41,
      baseMean: 3.435,
      weightedVariance: 1.2,
      rewardFactor: 0.1,
      meanCategory: "medium",
      varianceCategory: "medium",
      finalScoreRaw: 3.578,
    },
    selectedLeg: "without_qi",
    finalScoreRaw: 3.578,
    finalRating: 3.5,
    partCFinalRating: 3.5,
    partDFinalRating: 4,
    qualifiesOverall: true,
    reason: null,
  });
  assert.equal(published?.finalScoreRaw, 3.578);
  assert.equal(published?.baseMean, 3.435);
  assert.equal(published?.rewardFactor, 0.1);
  assert.equal(published?.caiValue, 0.043);
  assert.equal(publishedScoreFromForecast(null), null);

  const evenIfWithQiSelected = publishedScoreFromForecast({
    ...{
      contractId: "H8928",
      contractName: null,
      parentOrganization: null,
      caiValue: 0.043,
      withQi: {
        measureCount: 43,
        baseMean: 3.5,
        weightedVariance: 1.1,
        rewardFactor: 0,
        meanCategory: "medium",
        varianceCategory: "medium",
        finalScoreRaw: 3.62,
      },
      withoutQi: {
        measureCount: 41,
        baseMean: 3.435,
        weightedVariance: 1.2,
        rewardFactor: 0.1,
        meanCategory: "medium",
        varianceCategory: "medium",
        finalScoreRaw: 3.578,
      },
      selectedLeg: "with_qi" as const,
      finalScoreRaw: 3.62,
      finalRating: 3.5,
      partCFinalRating: 3.5,
      partDFinalRating: 4,
      qualifiesOverall: true,
      reason: null,
    },
  });
  assert.equal(evenIfWithQiSelected?.finalScoreRaw, 3.578);
});

test("buildupChecksOut ties mean + RF + CAI to the published final summary", () => {
  assert.equal(buildupChecksOut(summary()), true);
  assert.equal(buildupChecksOut(summary({ finalSummary: 3.4 })), false);
});

test("buildPlanPreviewResultsReport computes YoY and PP1 accuracy diffs", () => {
  const officialStars: OfficialStarRow[] = [
    {
      contractId: "H1304",
      contractName: "REGENCE",
      organizationMarketingName: "Regence",
      parentOrganization: "Cambia",
      measureCode: "C01",
      measureDisplayName: "Breast Cancer Screening",
      measureNormalized: "breast cancer screening",
      metricCategory: "Part C",
      star: 4,
      status: "scored",
      qiSignificance: "Significant improvement",
    },
    {
      contractId: "H1304",
      contractName: "REGENCE",
      organizationMarketingName: "Regence",
      parentOrganization: "Cambia",
      measureCode: "C02",
      measureDisplayName: "Colorectal Cancer Screening",
      measureNormalized: "colorectal cancer screening",
      metricCategory: "Part C",
      star: 5,
      status: "scored",
      qiSignificance: null,
    },
    {
      contractId: "H1304",
      contractName: "REGENCE",
      organizationMarketingName: "Regence",
      parentOrganization: "Cambia",
      measureCode: "C30",
      measureDisplayName: "Health Plan Quality Improvement",
      measureNormalized: "health plan quality improvement",
      metricCategory: "Part C",
      star: 2,
      status: "scored",
      qiSignificance: null,
    },
  ];

  const report = buildPlanPreviewResultsReport({
    starsYear: 2026,
    contractId: "H1304",
    officialStars,
    officialSummaries: [summary(), summary({ ratingType: "part_c", finalRating: 3.5 })],
    domainByCode: new Map([
      ["C01", "Staying Healthy"],
      ["C02", "Staying Healthy"],
    ]),
    weightByCode: new Map([
      ["C01", 1],
      ["C02", 1],
    ]),
    predictions: {
      starsYear: 2026,
      baselineYear: 2025,
      generatedAt: "2026-01-01T00:00:00.000Z",
      summary: {
        measureCount: 2,
        readyCount: 2,
        unavailableCount: 0,
        unsupportedCount: 0,
        warningCount: 0,
        accruedContractCount: 1,
        forecastFillCount: 0,
        cahpsPlanStarCount: 0,
      },
      cutPoints: [],
      contracts: [
        {
          contractId: "H1304",
          contractName: "REGENCE",
          parentOrganization: "Cambia",
          scoredMeasureCount: 2,
          ratedMeasureCount: 2,
          weightedMeanStar: 4,
          measures: [
            {
              measureNormalized: "breast cancer screening",
              displayName: "Breast Cancer Screening",
              measureCode: "C01",
              score: 80,
              weight: 1,
              inverted: false,
              predictedStar: 4,
              starSource: "cut_points",
              baseGroupStar: null,
              baselineOfficialStar: 3,
              forecastStar: 4,
              predictionStatus: "ready",
            },
            {
              measureNormalized: "colorectal cancer screening",
              displayName: "Colorectal Cancer Screening",
              measureCode: "C02",
              score: 90,
              weight: 1,
              inverted: false,
              // Applied star re-banded on the official Tech Notes (matches
              // PP2); the PP1 forecast on workbook cut points was a star lower.
              predictedStar: 5,
              starSource: "cut_points",
              baseGroupStar: null,
              baselineOfficialStar: 4,
              forecastStar: 4,
              predictionStatus: "ready",
            },
          ],
        },
      ],
    },
    overallPredicted: 3.5,
    overallUpside: 4,
    pp1Published: {
      measureCount: 38,
      baseMean: 3.478,
      weightedVariance: 1.2,
      rewardFactor: 0.1,
      caiValue: 0,
      finalScoreRaw: 3.578,
      finalRating: 3.5,
    },
  });

  assert.equal(report.overall?.finalRating, 3.5);
  assert.equal(report.accuracySummary.compared, 2);
  assert.equal(report.accuracySummary.exact, 1);
  assert.equal(report.accuracy.find((row) => row.measureCode === "C02")?.delta, 1);

  assert.equal(report.accuracySummary.pp1Published?.finalScoreRaw, 3.578);
  assert.equal(report.accuracySummary.overallPredicted, 3.5);
  assert.ok(report.scenarios.some((scenario) => scenario.id === "baseline"));
  assert.ok(report.scenarios.some((scenario) => scenario.id === "s26NoQI"));
  assert.ok(report.scenarios.some((scenario) => scenario.id === "removal2028"));
  assert.equal(report.accuracySummary.overallInEnvelope, true);

  // Official-input restatement is still computed for diagnostics.
  const buildup = report.accuracySummary.predictedBuildup;
  assert.ok(buildup);
  assert.equal(buildup.qiIncluded, true);
  assert.deepEqual(buildup.qiMeasures, [{ measureCode: "C30", star: 2 }]);
  assert.equal(buildup.withoutQi?.baseMean, 4);
  assert.equal(buildup.measureCount, 3);
  assert.equal(Math.round(buildup.baseMean * 1000) / 1000, 2.571);
  assert.equal(buildup.rewardFactor, 0);
  assert.equal(buildup.caiValue, -0.040422);
  assert.equal(buildup.finalRating, 2.5);

  assert.equal(
    report.domains.find((domain) => domain.domain === "Staying Healthy")?.officialMean,
    4.5
  );
  assert.ok(Array.isArray(report.risk));
  assert.ok(Array.isArray(report.opportunity));
});

test("scoreForecastOnOfficialInputs drops QI when CMS did not use improvement measures", () => {
  const predicted = {
    measureNormalized: "breast cancer screening",
    displayName: "Breast Cancer Screening",
    measureCode: "C01",
    score: 80,
    weight: 1,
    inverted: false,
    predictedStar: 4,
    starSource: "cut_points" as const,
    baseGroupStar: null,
    baselineOfficialStar: 3,
    forecastStar: 4,
    predictionStatus: "ready" as const,
  };
  const partD = { ...predicted, measureNormalized: "rating of drug plan", displayName: "Rating of Drug Plan", measureCode: "D07" };
  const qi: OfficialStarRow = {
    contractId: "H1304",
    contractName: null,
    organizationMarketingName: null,
    parentOrganization: null,
    measureCode: "C30",
    measureDisplayName: "Health Plan Quality Improvement",
    measureNormalized: "health plan quality improvement",
    metricCategory: "Part C",
    star: 1,
    status: "scored",
    qiSignificance: null,
  };
  const thresholds = { mean65th: 3.5, mean85th: 3.9, variance30th: 0.9, variance70th: 1.3 };
  const base = {
    contractId: "H1304",
    baselineYear: 2025,
    predictedMeasures: [predicted, partD],
    officialStars: [qi],
    thresholds,
    caiValue: 0.1,
  };

  const withQi = scoreForecastOnOfficialInputs({ ...base, improvementIncluded: true });
  assert.ok(withQi);
  assert.equal(withQi.qiIncluded, true);
  assert.equal(withQi.measureCount, 3);
  assert.deepEqual(withQi.qiMeasures, [{ measureCode: "C30", star: 1 }]);
  assert.equal(withQi.withoutQi?.baseMean, 4);
  assert.equal(withQi.withoutQi?.finalRating, 4.5);

  const withoutQi = scoreForecastOnOfficialInputs({ ...base, improvementIncluded: false });
  assert.ok(withoutQi);
  assert.equal(withoutQi.qiIncluded, false);
  assert.equal(withoutQi.measureCount, 2);
  assert.equal(withoutQi.baseMean, 4);
  assert.equal(withoutQi.rewardFactor, 0.4);
  assert.equal(Math.round(withoutQi.finalScoreRaw * 1000) / 1000, 4.5);
  assert.equal(withoutQi.finalRating, 4.5);

  assert.equal(scoreForecastOnOfficialInputs({ ...base, thresholds: null, improvementIncluded: true }), null);
});

test("resolveRewardFactorThresholds picks the contract's improvement/new-measure variant", () => {
  const withBoth = resolveRewardFactorThresholds(2026, summary());
  assert.equal(withBoth?.improvementIncluded, true);
  assert.equal(withBoth?.newMeasuresIncluded, true);
  assert.equal(withBoth?.mean65th, 3.649351);
  assert.equal(withBoth?.variance30th, 0.91485);

  const withoutImprovement = resolveRewardFactorThresholds(
    2026,
    summary({ improvementUsage: "No", newMeasureUsage: "No" })
  );
  assert.equal(withoutImprovement?.improvementIncluded, false);
  assert.equal(withoutImprovement?.mean65th, 3.7);

  assert.equal(resolveRewardFactorThresholds(2099, summary()), null);
});
