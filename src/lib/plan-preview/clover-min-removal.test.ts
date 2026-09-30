import assert from "node:assert/strict";
import test from "node:test";

import type { ContractMeasure, PercentileThresholds } from "@/lib/reward-factor";
import { getOfficialForScenario } from "@/lib/reward-factor/official-threshold-data";

import {
  assumeQiStar,
  cloverCandidatePool,
  evaluateCloverRemoval,
  findContractMinRemovals,
  findSharedRemovalLadder,
  FOUR_STAR_CUTOFF,
  removalUsesPartCCai,
  type CloverContractSearchInput,
} from "./clover-min-removal";
import { qiScoreDirection, qiStarSupported } from "./clover-removal-constants";
import { matchesParentOrganization } from "./clover-removal-report-data";
import {
  buildAnchoredPopulation,
  buildCustomRemovalScenario,
  type PlanPreviewCaiRecords,
} from "./final-scores";
import type { PlanPreviewPredictionsResult } from "./predictions";

const ZERO_RF: PercentileThresholds = {
  mean65th: 5,
  mean85th: 5,
  variance30th: 0,
  variance70th: 0.01,
};

const ALL_PART_D = [
  "D01", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13",
];

function measure(code: string, starValue: number, weight = 1): ContractMeasure {
  return {
    code,
    starValue,
    weight,
    category: code.startsWith("D") ? "Part D" : "Part C",
  };
}

function input(
  contractId: string,
  measures: ContractMeasure[],
  extras?: Partial<CloverContractSearchInput>,
): CloverContractSearchInput {
  return {
    contractId,
    measures,
    overallCai: 0,
    partCCai: 0,
    enrollment: 1000,
    ...extras,
  };
}

const KEEP_C = ["C01", "C02", "C06", "C08", "C10", "C11", "C12", "C13", "C14", "C18", "C20"];
const PAIR_MEASURES = [
  ...KEEP_C.map((code) => measure(code, 4)),
  measure("C30", 4, 5),
  measure("D08", 4),
  measure("D04", 4, 5),
  measure("C28", 1, 5),
  measure("C33", 1, 5),
];

function emptyPredictions(contractId: string, measures: ContractMeasure[]): PlanPreviewPredictionsResult {
  return {
    starsYear: 2027,
    baselineYear: 2026,
    generatedAt: "2026-01-01T00:00:00.000Z",
    summary: {
      measureCount: measures.length,
      readyCount: measures.length,
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
        contractId,
        contractName: "Test",
        parentOrganization: "Test Org",
        scoredMeasureCount: measures.length,
        ratedMeasureCount: measures.length,
        weightedMeanStar: null,
        measures: measures.map((row) => ({
          measureNormalized: `${row.code.toLowerCase()} synthetic`,
          displayName: row.code,
          measureCode: row.code,
          score: null,
          weight: row.weight,
          inverted: false,
          predictedStar: row.starValue,
          starSource: "cut_points" as const,
          baseGroupStar: null,
          baselineOfficialStar: null,
          forecastStar: row.starValue,
          predictionStatus: "ready" as const,
        })),
      },
    ],
  };
}

test("clover candidate pool is Stars 2026 Recalc plus Model 2, without D02/D03 or QI", () => {
  const pool = cloverCandidatePool();
  assert.equal(pool.length, 26);
  assert.ok(pool.includes("C04"));
  assert.ok(pool.includes("C05"));
  assert.ok(pool.includes("C07"));
  assert.ok(pool.includes("C15"));
  assert.ok(pool.includes("C33"));
  assert.ok(pool.includes("D08"));
  assert.ok(pool.includes("D13"));
  assert.ok(!pool.includes("D02"));
  assert.ok(!pool.includes("D03"));
  assert.ok(!pool.includes("C30"));
  assert.ok(!pool.includes("D04"));
});

test("no-removal and random subsets match the full scenario engine", () => {
  const contractId = "H8888";
  const measures = PAIR_MEASURES;
  const predictions = emptyPredictions(contractId, measures);
  const cai: PlanPreviewCaiRecords = {
    overall: { [contractId]: 0.02 },
    partC: { [contractId]: -0.01 },
    partD: {},
  };
  const population = buildAnchoredPopulation(predictions, 2026);
  const anchored = population.get(contractId);
  assert.ok(anchored && anchored.length >= 15);

  const withQi = getOfficialForScenario(2027, "overall_mapd", true);
  const withoutQi = getOfficialForScenario(2027, "overall_mapd", false);
  assert.ok(withQi && withoutQi);

  const options = {
    preferWithQi: true,
    useOfficialRewardFactorThresholds: true,
  } as const;
  const subsets = [[], ["C28"], ["C28", "C33"], ["D08", "D04"], ["C32"]];
  for (const removed of subsets) {
    const engine = buildCustomRemovalScenario(predictions, cai, removed, options);
    const row = engine.contracts.find((entry) => entry.contractId === contractId);
    const fast = evaluateCloverRemoval(
      input(contractId, anchored, { overallCai: 0.02, partCCai: -0.01 }),
      removed,
      withQi,
      withoutQi,
    );
    assert.ok(row && fast);
    assert.equal(fast.selectedLeg, row.selectedLeg);
    assert.equal(fast.rewardFactor, row.withQi && row.withoutQi
      ? (fast.selectedLeg === "with_qi" ? row.withQi.rewardFactor : row.withoutQi.rewardFactor)
      : fast.rewardFactor);
    assert.ok(Math.abs((fast.finalScoreRaw) - (row.finalScoreRaw ?? NaN)) < 1e-9, `subset ${removed.join(",")}`);
  }
});

test("prefers the with-QI leg when published QI is present", () => {
  const measures = [
    ...KEEP_C.map((code) => measure(code, 5)),
    measure("C30", 1, 5),
    measure("D08", 5),
    measure("D04", 1, 5),
  ];
  const highRf: PercentileThresholds = {
    mean65th: 3,
    mean85th: 4.9,
    variance30th: 0.2,
    variance70th: 1.5,
  };
  const score = evaluateCloverRemoval(input("H1", measures, { overallCai: 0.04 }), [], highRf, highRf);
  assert.ok(score);
  assert.equal(score.selectedLeg, "with_qi");
});

test("QI star assumption replaces published QI stars and raises the final score", () => {
  const measures = [
    ...KEEP_C.map((code) => measure(code, 4)),
    measure("C30", 1, 5),
    measure("D08", 4),
    measure("D04", 1, 5),
  ];
  const base = input("H1", measures);
  const low = evaluateCloverRemoval(assumeQiStar(base, 1), [], ZERO_RF, ZERO_RF);
  const high = evaluateCloverRemoval(assumeQiStar(base, 5), [], ZERO_RF, ZERO_RF);
  assert.ok(low && high);
  assert.equal(base.measures.find((row) => row.code === "C30")?.starValue, 1);
  assert.ok(high.baseMean > low.baseMean);
  assert.ok(high.finalScoreRaw > low.finalScoreRaw);
});

test("Part C CAI is used when the set removes every Part D measure", () => {
  assert.equal(removalUsesPartCCai(ALL_PART_D), true);
  assert.equal(removalUsesPartCCai(["D08"]), false);
  const measures = [
    ...KEEP_C.map((code) => measure(code, 4)),
    measure("C30", 4, 5),
    measure("D08", 2),
    measure("D04", 3, 5),
  ];
  const score = evaluateCloverRemoval(
    input("H1", measures, { overallCai: 0.2, partCCai: -0.05 }),
    ALL_PART_D,
    ZERO_RF,
    ZERO_RF,
  );
  assert.ok(score);
  assert.equal(score.caiSource, "part_c");
  assert.equal(score.caiValue, -0.05);
});

test("minimal-set search finds the true pair and no smaller set", () => {
  const result = findContractMinRemovals(input("H1", PAIR_MEASURES, { enrollment: 500 }), ZERO_RF, ZERO_RF);
  assert.equal(result.alreadyAtFour, false);
  assert.equal(result.minK, 2);
  assert.ok(result.reachableWithinMax);
  assert.ok(result.baseline && result.baseline.finalScoreRaw < FOUR_STAR_CUTOFF);
  assert.ok(result.minSets.length >= 1);
  const codes = result.minSets[0].codes.slice().sort();
  assert.deepEqual(codes, ["C28", "C33"]);
  assert.ok(result.minSets[0].score.finalScoreRaw >= FOUR_STAR_CUTOFF);
  assert.ok(result.minSets.every((set) => set.codes.length === 2));
});

test("shared ladder is monotonic and ignores unreachable contracts", () => {
  const reachableA = input("HA", PAIR_MEASURES, { enrollment: 100 });
  const reachableB = input(
    "HB",
    [
      ...KEEP_C.map((code) => measure(code, 4)),
      measure("C30", 4, 5),
      measure("D08", 4),
      measure("D04", 4, 5),
      measure("C03", 4, 5),
      measure("C31", 1, 5),
    ],
    { enrollment: 200 },
  );
  const unreachable = input(
    "HC",
    [
      ...KEEP_C.map((code) => measure(code, 1)),
      measure("C30", 1, 5),
      measure("D08", 1),
      measure("D04", 1, 5),
      measure("C03", 1, 5),
    ],
    { enrollment: 9999 },
  );
  const a = findContractMinRemovals(reachableA, ZERO_RF, ZERO_RF);
  const b = findContractMinRemovals(reachableB, ZERO_RF, ZERO_RF);
  const c = findContractMinRemovals(unreachable, ZERO_RF, ZERO_RF);
  assert.ok(a.reachableWithinMax);
  assert.ok(b.reachableWithinMax);
  assert.equal(c.reachableWithinMax, false);

  const reachableIds = new Set(["HA", "HB"]);
  const ladder = findSharedRemovalLadder(
    [reachableA, reachableB, unreachable],
    ZERO_RF,
    ZERO_RF,
    reachableIds,
  );
  assert.ok(ladder.length >= 2);
  for (let i = 1; i < ladder.length; i += 1) {
    assert.ok(ladder[i].contractsAtFour >= ladder[i - 1].contractsAtFour);
  }
  const recommended = ladder.find((row) => row.coversReachable);
  assert.ok(recommended);
  const atFour = new Set(recommended.perContract.filter((row) => row.atFour).map((row) => row.contractId));
  assert.ok(atFour.has("HA"));
  assert.ok(atFour.has("HB"));
  assert.equal(atFour.has("HC"), false);
});

test("QI options stay at or above the CMS star when more measures improved", () => {
  assert.equal(qiScoreDirection(4, 1), "up");
  assert.equal(qiScoreDirection(1, 4), "down");
  assert.equal(qiScoreDirection(2, 2), "flat");
  assert.equal(qiStarSupported("up", [3], 2), false);
  assert.equal(qiStarSupported("up", [3], 3), true);
  assert.equal(qiStarSupported("up", [3], 5), true);
  assert.equal(qiStarSupported("down", [3], 4), false);
  assert.equal(qiStarSupported("down", [3], 1), true);
  assert.equal(qiStarSupported("flat", [3, 4], 3), true);
  assert.equal(qiStarSupported("flat", [3, 4], 5), false);
});

test("parent organization matching treats blank as unknown", () => {
  assert.equal(matchesParentOrganization("Trinity Health", "trinity health"), true);
  assert.equal(matchesParentOrganization(null, "Unknown parent organization"), true);
  assert.equal(matchesParentOrganization("Aetna", "Trinity Health"), false);
});
