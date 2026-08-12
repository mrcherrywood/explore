import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMeasureStarOutlook,
  buildOverallStarOutlook,
  easeThresholds,
  pointsToNextStar,
  thresholdValuesFromForecast,
  type ThresholdValues,
} from "./star-outlook";

const NORMAL_CUTS: ThresholdValues = {
  twoStar: 50,
  threeStar: 70,
  fourStar: 82,
  fiveStar: 90,
};

const INVERTED_CUTS: ThresholdValues = {
  twoStar: 2.0,
  threeStar: 1.0,
  fourStar: 0.5,
  fiveStar: 0.2,
};

test("thresholdValuesFromForecast maps projected keys", () => {
  const values = thresholdValuesFromForecast([
    {
      key: "twoStar",
      label: "2★",
      projected: 50,
      comparisonActual: null,
      deltaVsComparison: null,
      absDeltaVsComparison: null,
      rawSimulated: null,
      baselineSimulated: null,
      anchoredMovement: null,
      movementCap: null,
      movementWasCapped: false,
    },
    {
      key: "threeStar",
      label: "3★",
      projected: 70,
      comparisonActual: null,
      deltaVsComparison: null,
      absDeltaVsComparison: null,
      rawSimulated: null,
      baselineSimulated: null,
      anchoredMovement: null,
      movementCap: null,
      movementWasCapped: false,
    },
    {
      key: "fourStar",
      label: "4★",
      projected: 82,
      comparisonActual: null,
      deltaVsComparison: null,
      absDeltaVsComparison: null,
      rawSimulated: null,
      baselineSimulated: null,
      anchoredMovement: null,
      movementCap: null,
      movementWasCapped: false,
    },
    {
      key: "fiveStar",
      label: "5★",
      projected: 90,
      comparisonActual: null,
      deltaVsComparison: null,
      absDeltaVsComparison: null,
      rawSimulated: null,
      baselineSimulated: null,
      anchoredMovement: null,
      movementCap: null,
      movementWasCapped: false,
    },
  ]);
  assert.deepEqual(values, NORMAL_CUTS);
});

test("score just below 4★ cut yields base 3 with upside 4 when MAE bridges the gap", () => {
  const outlook = buildMeasureStarOutlook({
    measureNormalized: "breast cancer screening",
    score: 81,
    inverted: false,
    starSource: "cut_points",
    predictedStar: 3,
    publishedBaselineStar: 3,
    publishedBaselineScore: 80,
    appliedThresholds: NORMAL_CUTS,
    easeRadius: 1.5,
  });

  assert.ok(outlook);
  assert.equal(outlook!.baseStar, 3);
  assert.equal(outlook!.upsideStar, 4);
  assert.equal(outlook!.hasUpside, true);
  assert.equal(outlook!.pointsToUpside, 1);
  assert.equal(outlook!.cutPressure, false);
});

test("inverted ease raises thresholds so a near-miss can clear upside", () => {
  const optimistic = easeThresholds(INVERTED_CUTS, 0.2, true, "optimistic");
  assert.equal(optimistic.fourStar, 0.7);
  assert.equal(optimistic.fiveStar, 0.4);

  const outlook = buildMeasureStarOutlook({
    measureNormalized: "complaints about the health plan",
    score: 0.55,
    inverted: true,
    starSource: "cut_points",
    predictedStar: 3,
    publishedBaselineStar: 3,
    publishedBaselineScore: 0.6,
    appliedThresholds: INVERTED_CUTS,
    easeRadius: 0.1,
  });

  assert.ok(outlook);
  assert.equal(outlook!.baseStar, 3);
  // Softened 4★ cut becomes 0.6; score 0.55 clears it.
  assert.equal(outlook!.upsideStar, 4);
  assert.equal(outlook!.hasUpside, true);
});

test("cutPressure is true when score improves but predicted star drops", () => {
  const outlook = buildMeasureStarOutlook({
    measureNormalized: "controlling high blood pressure",
    score: 78,
    comparisonScore: 78,
    inverted: false,
    starSource: "cut_points",
    predictedStar: 3,
    publishedBaselineStar: 4,
    publishedBaselineScore: 76,
    appliedThresholds: {
      twoStar: 50,
      threeStar: 70,
      fourStar: 80,
      fiveStar: 90,
    },
    easeRadius: 0.5,
  });

  assert.ok(outlook);
  assert.equal(outlook!.baseStar, 3);
  assert.equal(outlook!.cutPressure, true);
  assert.equal(outlook!.hasUpside, false);
});

test("CAHPS plan-file rows have no outlook", () => {
  const outlook = buildMeasureStarOutlook({
    measureNormalized: "getting needed care",
    score: 85,
    inverted: false,
    starSource: "cahps_plan_file",
    predictedStar: 4,
    publishedBaselineStar: 4,
    publishedBaselineScore: 84,
    appliedThresholds: NORMAL_CUTS,
    easeRadius: 2,
  });
  assert.equal(outlook, null);
});

test("live model thresholds that are softer than applied feed the optimistic band", () => {
  const outlook = buildMeasureStarOutlook({
    measureNormalized: "colorectal cancer screening",
    score: 81,
    inverted: false,
    starSource: "cut_points",
    predictedStar: 3,
    publishedBaselineStar: 3,
    publishedBaselineScore: 80,
    appliedThresholds: NORMAL_CUTS,
    modelThresholds: {
      twoStar: 50,
      threeStar: 70,
      fourStar: 80,
      fiveStar: 90,
    },
    // MAE alone (0.5) does not bridge 81→82, but model 4★ at 80 does.
    easeRadius: 0.5,
  });

  assert.ok(outlook);
  assert.equal(outlook!.baseStar, 3);
  assert.equal(outlook!.upsideStar, 4);
  assert.equal(outlook!.hasUpside, true);
});

test("pointsToNextStar reports the gap under base cuts", () => {
  assert.equal(pointsToNextStar(81, NORMAL_CUTS, false, 3), 1);
  assert.equal(pointsToNextStar(0.55, INVERTED_CUTS, true, 3), 0.05);
  assert.equal(pointsToNextStar(95, NORMAL_CUTS, false, 5), null);
});

test("overall envelope rounds higher only when weighted upside flips accumulate", () => {
  const base = buildOverallStarOutlook({
    measures: [
      {
        measureCode: "C01",
        weight: 1,
        predictedStar: 3,
        outlook: {
          baseStar: 3,
          upsideStar: 3,
          downsideStar: 3,
          easeRadius: 1,
          hasUpside: false,
          cutPressure: false,
          pointsToUpside: null,
        },
      },
      {
        measureCode: "C02",
        weight: 1,
        predictedStar: 3,
        outlook: {
          baseStar: 3,
          upsideStar: 3,
          downsideStar: 3,
          easeRadius: 1,
          hasUpside: false,
          cutPressure: false,
          pointsToUpside: null,
        },
      },
    ],
    rewardFactor: 0,
    caiValue: 0,
    baseRounded: 3,
  });
  assert.ok(base);
  assert.equal(base!.hasUpside, false);
  assert.equal(base!.upsideRounded, 3);

  const withUpside = buildOverallStarOutlook({
    measures: [
      {
        measureCode: "C14",
        weight: 3,
        predictedStar: 3,
        outlook: {
          baseStar: 3,
          upsideStar: 4,
          downsideStar: 3,
          easeRadius: 1.2,
          hasUpside: true,
          cutPressure: true,
          pointsToUpside: 1,
        },
      },
      {
        measureCode: "C05",
        weight: 3,
        predictedStar: 3,
        outlook: {
          baseStar: 3,
          upsideStar: 4,
          downsideStar: 3,
          easeRadius: 1.2,
          hasUpside: true,
          cutPressure: true,
          pointsToUpside: 0.8,
        },
      },
      {
        measureCode: "D09",
        weight: 3,
        predictedStar: 3,
        outlook: {
          baseStar: 3,
          upsideStar: 4,
          downsideStar: 3,
          easeRadius: 1,
          hasUpside: true,
          cutPressure: true,
          pointsToUpside: 0.5,
        },
      },
      // Fill the rest so the mean sits near a half-star boundary without RF/CAI.
      {
        measureCode: "C10",
        weight: 1,
        predictedStar: 4,
        outlook: null,
      },
    ],
    rewardFactor: 0,
    caiValue: -0.036,
    // 3.5 base case like H8003; three weight-3 flips to 4★ should lift the mean.
    baseRounded: 3.5,
  });

  assert.ok(withUpside);
  assert.ok(withUpside!.upsideMean > withUpside!.baseMean);
  assert.equal(withUpside!.baseRounded, 3.5);
  assert.ok(withUpside!.upsideRounded >= 3.5);
  // With three wt-3 flips (9 weight points of +1) on a 10-weight book, mean
  // rises by 0.9 before CAI — enough to round from 3.5 toward 4.0.
  assert.equal(withUpside!.hasUpside, withUpside!.upsideRounded > 3.5);
  assert.equal(withUpside!.upsideRounded, 4);
});

test("overall envelope drops Part D duplicate codes before weighting", () => {
  const result = buildOverallStarOutlook({
    measures: [
      {
        measureCode: "C28",
        weight: 1.5,
        predictedStar: 4,
        outlook: null,
      },
      {
        measureCode: "D02",
        weight: 1.5,
        predictedStar: 2,
        outlook: {
          baseStar: 2,
          upsideStar: 5,
          downsideStar: 1,
          easeRadius: 1,
          hasUpside: true,
          cutPressure: false,
          pointsToUpside: 0.1,
        },
      },
    ],
    rewardFactor: 0,
    caiValue: 0,
    baseRounded: 4,
  });
  assert.ok(result);
  assert.equal(result!.baseMean, 4);
  assert.equal(result!.upsideMean, 4);
  assert.equal(result!.hasUpside, false);
});
