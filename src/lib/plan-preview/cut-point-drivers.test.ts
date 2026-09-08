import assert from "node:assert/strict";
import test from "node:test";

import {
  getLatestContractRecords,
  getMeasureYearScoreSamples,
} from "@/lib/band-movement/analysis";
import { isEligibleForecastContract } from "@/lib/cutpoint-forecast/analysis";
import type { ForecastYearEndOverlay } from "@/lib/cutpoint-forecast/pp1-overlay";

import {
  classifyOverlayContracts,
  explainCutPointAdditions,
  isAddedSinceLastBook,
  rankDriverParents,
} from "./cut-point-drivers";
import type { AccruedMeasureScore, PlanPreviewCutPointPrediction } from "./predictions";

const MEASURE = "breast cancer screening partc";

function eligibleIds(count: number): string[] {
  const ids = [
    ...new Set(
      getLatestContractRecords()
        .map((record) => record.contractId.trim().toUpperCase())
        .filter((id) => isEligibleForecastContract(id)),
    ),
  ];
  assert.ok(ids.length >= count, `need ${count} eligible forecast contracts`);
  return ids.slice(0, count);
}

function pp1Row(
  contractId: string,
  score: number,
  parentOrganization = "PP1 Parent",
): AccruedMeasureScore {
  return {
    contractId,
    contractName: contractId,
    organizationMarketingName: null,
    parentOrganization,
    measureCode: "C01",
    measureDisplayName: "Breast Cancer Screening",
    measureNormalized: MEASURE,
    score,
    wholeScore: score,
  };
}

function overlayFor(samples: { contractId: string; score: number }[]): ForecastYearEndOverlay {
  return {
    byMeasureNormalized: new Map([[MEASURE, samples]]),
    byMeasureCode: new Map(),
    runIds: ["run-1"],
  };
}

function cutPoint(
  overrides: Partial<PlanPreviewCutPointPrediction> = {},
): PlanPreviewCutPointPrediction {
  return {
    measureNormalized: MEASURE,
    displayName: "Breast Cancer Screening",
    measureCode: "C01",
    status: "ready",
    reason: null,
    method: "clustering",
    source: "workbook_forecast",
    inverted: false,
    accruedContractCount: 0,
    forecastFillCount: 0,
    matchedBaselineCount: 0,
    appendedContractCount: 0,
    baselineMarketCount: 0,
    sampleSize: null,
    clientOnlySampleSize: null,
    thresholds: null,
    modelThresholds: null,
    fullMarketThresholds: null,
    clientOnlyThresholds: null,
    warningCount: 0,
    notes: [],
    ...overrides,
  };
}

test("classifyOverlayContracts tags forecast fills, Plan Preview fills, and overrides", () => {
  const [kept, override, fill, forecastOnly] = eligibleIds(4);
  const classified = classifyOverlayContracts({
    measureNormalized: MEASURE,
    measureCode: "C01",
    measureRows: [pp1Row(kept, 80), pp1Row(override, 70), pp1Row(fill, 65)],
    forecastOverlay: overlayFor([
      { contractId: kept, score: 81 },
      { contractId: override, score: 90 },
      { contractId: forecastOnly, score: 74 },
    ]),
    baselineYear: null,
    metadata: new Map([
      [forecastOnly, { contractName: "Forecast Co", parentOrganization: "Aetna" }],
    ]),
  });

  const byId = new Map(classified.map((row) => [row.contractId, row]));
  assert.equal(byId.get(kept)?.role, "forecast");
  assert.equal(byId.get(override)?.role, "pp1_override");
  assert.equal(byId.get(fill)?.role, "pp1_fill");
  assert.equal(byId.get(forecastOnly)?.role, "forecast");
  assert.equal(byId.get(forecastOnly)?.parentOrganization, "Aetna");
  assert.equal(byId.get(forecastOnly)?.newToMarket, true);
});

test("classifyOverlayContracts marks replacements vs new-to-market using prior scores", () => {
  const prior = getMeasureYearScoreSamples(MEASURE, 2026);
  assert.ok(prior.length > 0);
  const inMarket = prior[0];
  const eligible = eligibleIds(20);
  const missing = eligible.find(
    (id) => !prior.some((sample) => sample.contractId === id),
  );
  assert.ok(missing);

  const classified = classifyOverlayContracts({
    measureNormalized: MEASURE,
    measureCode: "C01",
    measureRows: [pp1Row(inMarket.contractId, inMarket.score + 3, "Existing")],
    forecastOverlay: overlayFor([{ contractId: missing, score: 72 }]),
    baselineYear: 2026,
  });

  const replacement = classified.find((row) => row.contractId === inMarket.contractId);
  const added = classified.find((row) => row.contractId === missing);
  assert.ok(replacement);
  assert.ok(added);
  assert.equal(replacement.newToMarket, false);
  assert.equal(replacement.priorScore, inMarket.score);
  assert.equal(replacement.scoreDelta, 3);
  assert.equal(added.newToMarket, true);
  assert.equal(added.priorScore, null);
});

test("isAddedSinceLastBook flags the CVS Health book add", () => {
  assert.equal(isAddedSinceLastBook("CVS Health Corporation"), true);
  assert.equal(isAddedSinceLastBook("Elevance Health, Inc."), false);
  assert.equal(isAddedSinceLastBook("Allina Health and Aetna Insurance Holding Company"), false);
});

test("rankDriverParents leads with the parent whose score movement has the most weight", () => {
  const ranked = rankDriverParents([
    {
      parentOrganization: "Small mover",
      currentScore: 80,
      priorScore: 79,
      scoreDelta: 1,
    },
    {
      parentOrganization: "Aetna",
      currentScore: 74,
      priorScore: 70,
      scoreDelta: 4,
    },
    {
      parentOrganization: "Aetna",
      currentScore: 76,
      priorScore: 72,
      scoreDelta: 4,
    },
    {
      parentOrganization: "Humana",
      currentScore: 90,
      priorScore: 90,
      scoreDelta: 0,
    },
  ]);

  assert.match(ranked, /^Aetna \(2, mean score 75 vs prior 71, \+4\)/);
  assert.match(ranked, /Small mover/);
  assert.ok(!ranked.includes("Humana") || ranked.indexOf("Aetna") < ranked.indexOf("Humana"));
});

function thresholds(
  fiveStar: number,
  fourStar = 77,
  threeStar = 72,
  twoStar = 63,
) {
  return (
    [
      ["fiveStar", fiveStar],
      ["fourStar", fourStar],
      ["threeStar", threeStar],
      ["twoStar", twoStar],
    ] as const
  ).map(([key, projected]) => ({
    key,
    label: key,
    projected,
    comparisonActual: null,
    deltaVsComparison: null,
    absDeltaVsComparison: null,
    rawSimulated: null,
    baselineSimulated: null,
    anchoredMovement: null,
    movementCap: null,
    movementWasCapped: false,
  }));
}

test("explainCutPointAdditions describes official CAHPS and since-last-run moves", () => {
  assert.equal(
    explainCutPointAdditions({
      cutPoint: cutPoint({
        displayName: "Annual Flu Vaccine",
        source: "official",
        fullMarketThresholds: null,
      }),
      addedSinceLastRun: 0,
      priorFullMarket: null,
      priorClientOnly: null,
      driverParents: "",
    }),
    "Official CAHPS cut points are not re-predicted from accrued contracts.",
  );

  assert.equal(
    explainCutPointAdditions({
      cutPoint: cutPoint({
        fullMarketThresholds: thresholds(85),
      }),
      addedSinceLastRun: 0,
      priorFullMarket: thresholds(85),
      priorClientOnly: null,
      driverParents: "",
    }),
    "No contracts were added since the prior book.",
  );

  const note = explainCutPointAdditions({
    cutPoint: cutPoint({
      fullMarketThresholds: thresholds(85.48),
      clientOnlyThresholds: thresholds(86, 78, 71, 60),
    }),
    addedSinceLastRun: 38,
    priorFullMarket: thresholds(85),
    priorClientOnly: thresholds(85.1, 77, 72, 63),
    driverParents: "CVS Health Corporation (38, mean score 73.5 vs prior 72.5, +1.0)",
  });

  assert.match(note, /38 contracts were added since the prior book/);
  assert.match(note, /Full Market 5-star moved from 85 to 85\.48/);
  assert.match(note, /Client Only 2-star moved from 63 to 60/);
  assert.match(note, /Largest additions: CVS Health/);
});
