import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRiskOpportunity,
  closeThreshold,
  proximityGaps,
  sortRiskOpportunity,
} from "./risk-opportunity";

const CUTS = { twoStar: 58, threeStar: 71, fourStar: 76, fiveStar: 84 };
const INVERTED_CUTS = { twoStar: 1.34, threeStar: 0.71, fourStar: 0.32, fiveStar: 0.11 };

test("closeThreshold is 2 points for standard measures, 1 for CAHPS, and 0.05 for inverted", () => {
  assert.equal(closeThreshold(false), 2);
  assert.equal(closeThreshold(false, "Breast Cancer Screening"), 2);
  assert.equal(closeThreshold(false, "Getting Needed Care"), 1);
  assert.equal(closeThreshold(false, "Annual Flu Vaccine"), 1);
  assert.equal(closeThreshold(true), 0.05);
});

test("proximityGaps measures distance to the lower cut and the next-star cut", () => {
  const fourStar = proximityGaps(76.4, 4, CUTS, false);
  assert.equal(fourStar.riskCut, 76);
  assert.equal(fourStar.riskGap, 0.4);
  assert.equal(fourStar.opportunityCut, 84);
  assert.equal(fourStar.opportunityGap, 7.6);

  const almostFive = proximityGaps(83.2, 4, CUTS, false);
  assert.equal(almostFive.opportunityGap, 0.8);
  assert.equal(almostFive.riskGap, 7.2);

  const fiveStar = proximityGaps(90, 5, CUTS, false);
  assert.equal(fiveStar.opportunityGap, null);
  assert.equal(fiveStar.riskCut, 84);
  assert.equal(fiveStar.riskGap, 6);
});

test("inverted proximity uses the worse-score edge as risk and the better-score edge as opportunity", () => {
  const barelyFour = proximityGaps(0.3, 4, INVERTED_CUTS, true);
  assert.equal(barelyFour.riskCut, 0.32);
  assert.equal(barelyFour.riskGap, 0.02);
  assert.equal(barelyFour.opportunityCut, 0.11);
  assert.equal(barelyFour.opportunityGap, 0.19);

  const almostFive = proximityGaps(0.14, 4, INVERTED_CUTS, true);
  assert.equal(almostFive.opportunityGap, 0.03);
  assert.equal(almostFive.riskGap, 0.18);
});

test("classifyRiskOpportunity keeps only measures inside the close band", () => {
  const risk = classifyRiskOpportunity({
    measureCode: "C01",
    displayName: "Breast Cancer Screening",
    officialStar: 4,
    score: 76.5,
    inverted: false,
    thresholds: CUTS,
    weight: 1,
  });
  assert.equal(risk.length, 1);
  assert.equal(risk[0]?.kind, "risk");
  assert.equal(risk[0]?.gap, 0.5);

  const opportunity = classifyRiskOpportunity({
    measureCode: "C01",
    displayName: "Breast Cancer Screening",
    officialStar: 4,
    score: 82.5,
    inverted: false,
    thresholds: CUTS,
    weight: 1,
  });
  assert.equal(opportunity.length, 1);
  assert.equal(opportunity[0]?.kind, "opportunity");
  assert.equal(opportunity[0]?.gap, 1.5);

  const safe = classifyRiskOpportunity({
    measureCode: "C01",
    displayName: "Breast Cancer Screening",
    officialStar: 4,
    score: 80,
    inverted: false,
    thresholds: CUTS,
  });
  assert.equal(safe.length, 0);

  const invertedRisk = classifyRiskOpportunity({
    measureCode: "C28",
    displayName: "Complaints about the Health Plan",
    officialStar: 4,
    score: 0.3,
    inverted: true,
    thresholds: INVERTED_CUTS,
  });
  assert.equal(invertedRisk[0]?.kind, "risk");
  assert.equal(invertedRisk[0]?.gap, 0.02);

  const cahpsCuts = { twoStar: 80, threeStar: 84, fourStar: 86, fiveStar: 90 };
  const cahpsNear = classifyRiskOpportunity({
    measureCode: "C22",
    displayName: "Getting Needed Care",
    officialStar: 4,
    score: 89.2,
    inverted: false,
    thresholds: cahpsCuts,
  });
  assert.equal(cahpsNear.length, 1);
  assert.equal(cahpsNear[0]?.kind, "opportunity");
  assert.equal(cahpsNear[0]?.gap, 0.8);

  const cahpsTooFar = classifyRiskOpportunity({
    measureCode: "C22",
    displayName: "Getting Needed Care",
    officialStar: 4,
    score: 87.5,
    inverted: false,
    thresholds: cahpsCuts,
  });
  assert.equal(cahpsTooFar.length, 0);
});

test("sortRiskOpportunity lists risk first, then closest gaps", () => {
  const sorted = sortRiskOpportunity([
    {
      measureCode: "C02",
      displayName: "Colorectal",
      officialStar: 4,
      score: 83,
      inverted: false,
      kind: "opportunity",
      cut: 84,
      gap: 1,
      weight: 1,
    },
    {
      measureCode: "D08",
      displayName: "Adherence",
      officialStar: 3,
      score: 71.2,
      inverted: false,
      kind: "risk",
      cut: 71,
      gap: 0.2,
      weight: 3,
    },
    {
      measureCode: "C01",
      displayName: "Breast",
      officialStar: 4,
      score: 76.8,
      inverted: false,
      kind: "risk",
      cut: 76,
      gap: 0.8,
      weight: 1,
    },
  ]);
  assert.deepEqual(
    sorted.map((row) => row.measureCode),
    ["D08", "C01", "C02"]
  );
});
