import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildClientPp1VsPriorExport,
  classifyStarMovement,
  clientPp1VsPriorDetailToCsv,
  clientPp1VsPriorSummaryToCsv,
  type ClientPp1VsPriorExportBundle,
} from "./client-pp1-vs-prior-export";
import { buildPlanPreviewPredictions, type AccruedMeasureScore } from "./predictions";
import { parsePlanPreviewWorkbook } from "./workbook";
import type { PlanPreviewMeasureParseResult } from "./types";

const MEASURE_PATH = path.join(process.cwd(), "data/2027/SR_2027_FPP/SR_2027_measure_data.xlsx");

function loadAccruedRows(): AccruedMeasureScore[] {
  const parsed = parsePlanPreviewWorkbook(
    readFileSync(MEASURE_PATH)
  ) as PlanPreviewMeasureParseResult;
  return parsed.rows
    .filter((row) => row.status === "scored" && row.score !== null)
    .map((row) => ({
      contractId: row.contractId,
      contractName: row.contractName,
      organizationMarketingName: row.organizationMarketingName,
      parentOrganization: row.parentOrganization,
      measureCode: row.measureCode,
      measureDisplayName: row.measureDisplayName,
      measureNormalized: row.measureNormalized,
      score: row.score as number,
      wholeScore: row.score as number,
    }));
}

test("classifyStarMovement maps star deltas", () => {
  assert.equal(classifyStarMovement(1), "improved");
  assert.equal(classifyStarMovement(0), "held");
  assert.equal(classifyStarMovement(-2), "declined");
});

test("clientPp1VsPriorDetailToCsv includes prior vs PP1 score columns", () => {
  const bundle: ClientPp1VsPriorExportBundle = {
    generatedAt: "2026-08-10T00:00:00.000Z",
    pp1StarsYear: 2027,
    priorYear: 2026,
    clientContractCount: 1,
    accruedClientContractCount: 1,
    missingFromPp1Count: 0,
    detailRows: [
      {
        contractId: "H0885",
        contractName: "Example Plan, LLC",
        parentOrganization: "Parent",
        measureDisplayName: "Breast Cancer Screening",
        measureNormalized: "breast cancer screening partc",
        measureCodePp1: "C01",
        measureCodePrior: "C01",
        priorYear: 2026,
        pp1StarsYear: 2027,
        priorFinalScore: 80,
        priorFinalStar: 4,
        pp1Score: 82.5,
        pp1PredictedStar: 5,
        starSource: "cut_points",
        scoreDelta: 2.5,
        starDelta: 1,
        movement: "improved",
      },
    ],
    summaryRows: [],
  };

  const csv = clientPp1VsPriorDetailToCsv(bundle);
  assert.match(csv, /prior_final_score/);
  assert.match(csv, /pp1_score/);
  assert.match(csv, /"Example Plan, LLC"/);
  assert.match(csv, /,improved\n/);
});

test("clientPp1VsPriorSummaryToCsv orders Declined then Held then Improved", () => {
  const bundle: ClientPp1VsPriorExportBundle = {
    generatedAt: "2026-08-10T00:00:00.000Z",
    pp1StarsYear: 2027,
    priorYear: 2026,
    clientContractCount: 1,
    accruedClientContractCount: 1,
    missingFromPp1Count: 0,
    detailRows: [],
    summaryRows: [
      {
        measureDisplayName: "Breast Cancer Screening",
        measureNormalized: "breast cancer screening partc",
        measureCodePp1: "C01",
        measureCodePrior: "C01",
        priorYear: 2026,
        pp1StarsYear: 2027,
        clientCount: 10,
        withPriorScore: 10,
        withPriorStar: 10,
        withPredictedStar: 10,
        improved: 4,
        held: 3,
        declined: 3,
        improvedPct: 40,
        heldPct: 30,
        declinedPct: 30,
        avgScoreDelta: 0.5,
        avgStarDelta: 0.1,
      },
    ],
  };

  const header = clientPp1VsPriorSummaryToCsv(bundle).split("\n")[0];
  assert.ok(header.indexOf("declined") < header.indexOf("held"));
  assert.ok(header.indexOf("held") < header.indexOf("improved"));
});

test(
  "buildClientPp1VsPriorExport joins 2026 finals to local 2027 PP1 sample",
  { skip: !existsSync(MEASURE_PATH) },
  () => {
    const predictions = buildPlanPreviewPredictions(loadAccruedRows(), 2027);
    const sampleIds = new Set(predictions.contracts.map((c) => c.contractId));
    const bundle = buildClientPp1VsPriorExport(predictions, sampleIds);

    assert.equal(bundle.priorYear, 2026);
    assert.equal(bundle.pp1StarsYear, 2027);
    assert.ok(bundle.detailRows.length > 0);
    assert.ok(bundle.summaryRows.length > 0);

    const withPrior = bundle.detailRows.filter((row) => row.priorFinalScore !== null);
    assert.ok(withPrior.length > 0, "expected some prior-year final scores to join");

    for (const row of withPrior.slice(0, 20)) {
      assert.ok(row.priorFinalScore !== null);
      assert.equal(row.scoreDelta, row.pp1Score - row.priorFinalScore);
      if (row.priorFinalStar !== null && row.pp1PredictedStar !== null) {
        assert.equal(row.starDelta, row.pp1PredictedStar - row.priorFinalStar);
      }
    }
  }
);
