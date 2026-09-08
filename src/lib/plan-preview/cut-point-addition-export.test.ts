import assert from "node:assert/strict";
import test from "node:test";

import { getLatestContractRecords } from "@/lib/band-movement/analysis";
import { isEligibleForecastContract } from "@/lib/cutpoint-forecast/analysis";

import { buildCutPointAdditionExport } from "./cut-point-addition-export";
import type { AccruedMeasureScore, PlanPreviewPredictionsResult } from "./predictions";

test("buildCutPointAdditionExport skips Full Market reclusters for official CAHPS", () => {
  const contractId = getLatestContractRecords()
    .map((record) => record.contractId.trim().toUpperCase())
    .find((id) => isEligibleForecastContract(id));
  assert.ok(contractId);

  const rows: AccruedMeasureScore[] = [
    {
      contractId,
      contractName: "Test",
      organizationMarketingName: null,
      parentOrganization: "Test Parent",
      measureCode: "C03",
      measureDisplayName: "Annual Flu Vaccine",
      measureNormalized: "annual flu vaccine partc",
      score: 70,
    },
  ];
  const predictions: PlanPreviewPredictionsResult = {
    starsYear: 2027,
    baselineYear: 2026,
    generatedAt: "2026-09-08T00:00:00.000Z",
    summary: {
      measureCount: 1,
      readyCount: 1,
      unavailableCount: 0,
      unsupportedCount: 0,
      warningCount: 0,
      accruedContractCount: 1,
      forecastFillCount: 0,
      cahpsPlanStarCount: 0,
    },
    cutPoints: [
      {
        measureNormalized: "annual flu vaccine partc",
        displayName: "Annual Flu Vaccine",
        measureCode: "C03",
        status: "ready",
        reason: null,
        method: null,
        source: "official",
        inverted: false,
        accruedContractCount: 1,
        forecastFillCount: 0,
        matchedBaselineCount: 1,
        appendedContractCount: 0,
        baselineMarketCount: 400,
        sampleSize: null,
        clientOnlySampleSize: 1,
        thresholds: null,
        modelThresholds: null,
        fullMarketThresholds: null,
        clientOnlyThresholds: null,
        warningCount: 0,
        notes: [],
      },
    ],
    contracts: [],
  };

  const bundle = buildCutPointAdditionExport(predictions, rows);
  assert.equal(bundle.summaries.length, 1);
  assert.equal(bundle.summaries[0].addedSinceLastRun, 0);
  assert.equal(bundle.summaries[0].fullMarketPrior.fiveStar, null);
  assert.match(bundle.summaries[0].additionNotes, /Official CAHPS/);
  assert.equal(bundle.detailRows.length, 0);
});
