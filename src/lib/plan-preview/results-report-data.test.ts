import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlanPreviewResultsReport,
  buildupChecksOut,
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
              predictionStatus: "ready",
            },
            {
              measureNormalized: "colorectal cancer screening",
              displayName: "Colorectal Cancer Screening",
              measureCode: "C02",
              score: 90,
              weight: 1,
              inverted: false,
              predictedStar: 4,
              starSource: "cut_points",
              baseGroupStar: null,
              baselineOfficialStar: 4,
              predictionStatus: "ready",
            },
          ],
        },
      ],
    },
    overallPredicted: 3.5,
    overallUpside: 4,
  });

  assert.equal(report.overall?.finalRating, 3.5);
  assert.equal(report.accuracySummary.compared, 2);
  assert.equal(report.accuracySummary.exact, 1);
  assert.equal(report.accuracy.find((row) => row.measureCode === "C02")?.delta, 1);
  assert.equal(report.accuracySummary.overallInEnvelope, true);
  assert.equal(report.domains[0]?.officialMean, 4.5);
  assert.ok(Array.isArray(report.risk));
  assert.ok(Array.isArray(report.opportunity));
});
