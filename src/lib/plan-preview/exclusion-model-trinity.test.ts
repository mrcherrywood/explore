import assert from "node:assert/strict";
import test from "node:test";

import type { PlanPreviewFinalScoresResult } from "./final-scores";
import {
  assembleTrinityRewardDetail,
  rewardFactorReason,
  TRINITY_REWARD_CONTRACTS,
} from "./exclusion-model-trinity";

function scenario(contractId: string, rewardFactor: number, meanCategory: string): PlanPreviewFinalScoresResult {
  return {
    id: "customRemoval",
    label: "Custom",
    description: "",
    removedCodes: ["C15"],
    caiSource: "overall",
    starsYear: 2027,
    baselineYear: 2026,
    thresholds: {
      withQi: { mean65th: 3.4, mean85th: 3.9, variance30th: 0.4, variance70th: 1.2 },
      withoutQi: null,
    },
    populationSize: 1,
    notes: [],
    contracts: [
      {
        contractId,
        contractName: "Mount Carmel",
        parentOrganization: "Trinity Health Corporation",
        caiValue: -0.07,
        withQi: {
          measureCount: 2,
          baseMean: 3.6,
          weightedVariance: 0.8,
          rewardFactor,
          meanCategory,
          varianceCategory: "medium",
          finalScoreRaw: 3.6 + rewardFactor - 0.07,
        },
        withoutQi: null,
        selectedLeg: "with_qi",
        finalScoreRaw: 3.6 + rewardFactor - 0.07,
        finalRating: 3.5,
        partCFinalRating: null,
        partDFinalRating: null,
        qualifiesOverall: true,
        reason: null,
      },
    ],
  };
}

test("Trinity detail keeps the dropped star and the rebuilt reward factor", () => {
  assert.deepEqual([...TRINITY_REWARD_CONTRACTS], ["H3668", "H6910"]);
  const detail = assembleTrinityRewardDetail({
    contractIds: ["H3668"],
    population: new Map([
      [
        "H3668",
        [
          { code: "C15", starValue: 2, weight: 1, category: "Part C", normalizedName: "falling partc" },
          { code: "C01", starValue: 4, weight: 3, category: "Part C", normalizedName: "kept partc" },
        ],
      ],
    ]),
    officialStars: [
      {
        contractId: "H3668",
        contractName: "Mount Carmel",
        organizationMarketingName: null,
        parentOrganization: "Trinity Health Corporation",
        measureCode: "C15",
        measureDisplayName: "Reducing the Risk of Falling",
        measureNormalized: "falling partc",
        metricCategory: "HOS",
        star: 2,
        status: "scored",
        qiSignificance: null,
      },
    ],
    names: new Map([["H3668", "Mount Carmel"]]),
    publishedRating: new Map([["H3668", 3.5]]),
    drops: [{ code: "C15", name: "Catalog name", inFiveC: true }],
    baselineYear: 2026,
    scenarios: [
      {
        id: "five-c",
        label: "Five C",
        removedCodes: ["C15"],
        thresholdsRecomputed: true,
        result: scenario("H3668", 0.1, "relatively_high"),
      },
    ],
  });

  const contract = detail.contracts[0];
  assert.equal(contract.dropped[0]?.name, "Reducing the Risk of Falling");
  assert.equal(contract.dropped[0]?.star, 2);
  assert.equal(contract.scenarios[0]?.rewardFactor, 0.1);
  assert.equal(contract.scenarios[0]?.keptCount, 2);
  assert.match(contract.scenarios[0]?.reason ?? "", /relatively high mean and medium variance produce a 0.1/);
  assert.match(rewardFactorReason(contract.scenarios[0]), /relatively high mean and medium variance produce a 0.1/);
});

test("a mean below the 65th percentile produces no reward factor", () => {
  assert.equal(
    rewardFactorReason({ meanCategory: "below_threshold", varianceCategory: "low", rewardFactor: 0 }),
    "The mean is below the 65th percentile, so the reward factor is 0.",
  );
});
