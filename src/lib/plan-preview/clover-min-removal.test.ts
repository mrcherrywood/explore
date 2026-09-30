import assert from "node:assert/strict";
import test from "node:test";

import type { ContractMeasure, PercentileThresholds } from "@/lib/reward-factor";
import { getOfficialForScenario } from "@/lib/reward-factor/official-threshold-data";

import {
  assumeQiStar,
  cloverCandidatePool,
  evaluateAllLowStarRemoval,
  evaluateCloverRemoval,
  evaluateKeptRemoval,
  findContractMinRemovals,
  findContractMinRemovalsSparingHedis,
  findSharedRemovalLadder,
  findSharedRemovalLadderSparingHedis,
  FOUR_STAR_CUTOFF,
  removalUsesPartCCai,
  type CloverContractSearchInput,
} from "./clover-min-removal";
import { qiScoreDirection, qiStarSupported, cloverMeasurePath, keptReasonWhenShort } from "./clover-removal-constants";
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
  ...Array.from({ length: 6 }, (_, index) => measure(`C${40 + index}`, 4)),
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
  const subsets = [[], ["C28"], ["C28", "C33"], ["D08"], ["D08", "D04"], ["C32"]];
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
  assert.equal(score.partDQiRemoved, true);
});

test("removing the last Part D measure also drops Part D QI", () => {
  const measures = [
    ...KEEP_C.map((code) => measure(code, 4)),
    measure("C30", 4, 5),
    measure("D08", 1, 3),
    measure("D07", 4, 1),
    measure("D04", 1, 5),
  ];
  const cai = { overallCai: 0.2, partCCai: -0.05 };
  const kept = evaluateCloverRemoval(input("H1", measures, cai), ["D08"], ZERO_RF, ZERO_RF);
  const cleared = evaluateCloverRemoval(input("H1", measures, cai), ["D08", "D07"], ZERO_RF, ZERO_RF);
  const explicit = evaluateCloverRemoval(
    input("H1", measures, cai),
    ["D08", "D07", "D04"],
    ZERO_RF,
    ZERO_RF,
  );
  assert.ok(kept && cleared && explicit);
  assert.equal(kept.partDQiRemoved, false);
  assert.equal(kept.caiSource, "overall");
  assert.equal(cleared.partDQiRemoved, true);
  assert.equal(cleared.baseMean, explicit.baseMean);
  assert.equal(cleared.finalScoreRaw, explicit.finalScoreRaw);
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

test("any-measure search leaves HEDIS in place when another combination reaches 4.0", () => {
  const keep = ["C06", "C08", "C10", "C11", "C12", "C13", "C14", "C18", "C30", "D04"].map((code) =>
    measure(code, 5),
  );
  const row = input("H1", [
    ...keep,
    measure("C01", 1, 4),
    measure("C28", 1, 2),
    measure("C33", 1, 2),
    ...Array.from({ length: 4 }, (_, index) => measure(`C${40 + index}`, 4)),
  ]);
  const pool = ["C01", "C28", "C33"];
  const hedis = new Set(["C01"]);
  const found = findContractMinRemovalsSparingHedis(row, ZERO_RF, ZERO_RF, pool, hedis);
  assert.equal(found.minK, 2);
  assert.deepEqual(found.minSets[0]?.codes, ["C28", "C33"]);
  assert.equal(found.minSets.some((set) => set.codes.includes("C01")), false);
  assert.ok((found.minSets[0]?.score.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF);

  const ladder = findSharedRemovalLadderSparingHedis(
    [row],
    ZERO_RF,
    ZERO_RF,
    new Set(["H1"]),
    pool,
    hedis,
  );
  const recommended = ladder.find((entry) => entry.coversReachable);
  assert.deepEqual(recommended?.codes, ["C28", "C33"]);
});

test("any-measure search removes HEDIS only when nothing else reaches 4.0", () => {
  const keep = ["C06", "C08", "C10", "C11", "C12", "C13", "C14", "C18", "C30", "D04"].map((code) =>
    measure(code, 4),
  );
  const row = input("H2", [
    ...keep,
    measure("C01", 1, 2),
    ...Array.from({ length: 5 }, (_, index) => measure(`C${40 + index}`, 4)),
  ]);
  const pool = ["C01", "C06"];
  const hedis = new Set(["C01"]);
  const found = findContractMinRemovalsSparingHedis(row, ZERO_RF, ZERO_RF, pool, hedis);
  assert.equal(found.minK, 1);
  assert.deepEqual(found.minSets[0]?.codes, ["C01"]);
  assert.ok((found.baseline?.finalScoreRaw ?? 0) < FOUR_STAR_CUTOFF);

  const ladder = findSharedRemovalLadderSparingHedis(
    [row],
    ZERO_RF,
    ZERO_RF,
    new Set(["H2"]),
    pool,
    hedis,
  );
  const recommended = ladder.find((entry) => entry.coversReachable);
  assert.deepEqual(recommended?.codes, ["C01"]);
});

test("a contract can remove more than eight measures when a rating still remains", () => {
  const keep = [
    ...Array.from({ length: 14 }, (_, index) => measure(`C${40 + index}`, 4)),
    measure("C30", 4, 5),
    measure("D04", 4, 5),
    measure("D07", 4),
  ];
  const lows = Array.from({ length: 12 }, (_, index) => measure(`C${60 + index}`, 1));
  const row = input("H12", [...keep, ...lows]);
  const pool = lows.map((item) => item.code);
  const found = findContractMinRemovals(row, ZERO_RF, ZERO_RF, pool);
  assert.ok((found.minK ?? 0) > 8);
  assert.equal(found.reachableWithinMax, true);
  assert.ok((found.minSets[0]?.score.measureCount ?? 0) >= 15);
  assert.ok((found.minSets[0]?.score.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF);
});

test("removals stop when fewer than 15 measures would remain", () => {
  const measures = [
    ...Array.from({ length: 13 }, (_, index) => measure(`C${40 + index}`, 3)),
    measure("C30", 3, 5),
    measure("D04", 1, 5),
  ];
  const found = findContractMinRemovals(input("H15", measures), ZERO_RF, ZERO_RF, ["D04", "C30"]);
  assert.equal(found.reachableWithinMax, false);
  assert.equal(found.minK, null);
});

test("eligible measures come off before a later domain, and HEDIS waits until both are short", () => {
  const keep = [
    ...Array.from({ length: 16 }, (_, index) => measure(`C${40 + index}`, 4)),
    measure("C30", 4),
    measure("D04", 4),
  ];
  const row = input("Horder", [
    ...keep,
    measure("C28", 2),
    measure("C21", 1),
    measure("C01", 1),
  ]);
  const pool = ["C28", "C21", "C01"];
  const priority = (code: string) => (code === "C01" ? 1000 : code === "C28" ? 0 : 2);
  const found = findContractMinRemovals(row, ZERO_RF, ZERO_RF, pool, priority);
  assert.equal(found.reachableWithinMax, true);
  assert.deepEqual(found.minSets[0]?.codes[0], "C28");
  assert.equal(found.minSets[0]?.codes.includes("C01"), false);
});

test("a large any-measure pool still resolves within a couple of seconds", () => {
  const keep = Array.from({ length: 24 }, (_, index) => measure(`C${index + 6}`, 4));
  const lows = Array.from({ length: 10 }, (_, index) => measure(`D${index + 5}`, 1));
  const row = input("HX", [...keep, ...lows, measure("C30", 4), measure("D04", 4)]);
  const pool = [...keep.map((item) => item.code), ...lows.map((item) => item.code)];
  const started = Date.now();
  const found = findContractMinRemovals(row, ZERO_RF, ZERO_RF, pool);
  const shared = findSharedRemovalLadder([row], ZERO_RF, ZERO_RF, new Set(["HX"]), pool);
  const elapsed = Date.now() - started;
  assert.equal(found.minK, 8);
  assert.ok(shared.some((entry) => entry.coversReachable && entry.k === 8));
  assert.ok(elapsed < 2000, `search took ${elapsed}ms`);
});

test("measure path labels explain why a measure is kept or removed", () => {
  assert.deepEqual(
    cloverMeasurePath({
      isQi: false,
      isPartDQi: false,
      star: 2,
      inPool: true,
      onShared: true,
      onOwnMin: true,
      partDQiRemoved: false,
      alreadyAtFour: false,
    }),
    { role: "removed", reason: "Removed: on the shared list" },
  );
  assert.equal(
    cloverMeasurePath({
      isQi: false,
      isPartDQi: false,
      star: 5,
      inPool: true,
      onShared: false,
      onOwnMin: false,
      partDQiRemoved: false,
      alreadyAtFour: false,
    }).reason,
    "Kept: removing it would lower the score",
  );
  assert.equal(
    cloverMeasurePath({
      isQi: false,
      isPartDQi: false,
      star: 2,
      inPool: true,
      onShared: false,
      onOwnMin: false,
      partDQiRemoved: false,
      alreadyAtFour: false,
    }).reason,
    "Kept: not needed to reach 4.0",
  );
  assert.equal(
    cloverMeasurePath({
      isQi: false,
      isPartDQi: false,
      star: 2,
      inPool: true,
      onShared: false,
      onOwnMin: false,
      partDQiRemoved: false,
      alreadyAtFour: true,
    }).reason,
    "Kept: Overall is already 4.0",
  );
  assert.equal(
    cloverMeasurePath({
      isQi: false,
      isPartDQi: false,
      star: 3,
      inPool: false,
      onShared: false,
      onOwnMin: false,
      partDQiRemoved: false,
      alreadyAtFour: false,
    }).reason,
    "Not removed: outside this removal set",
  );
  assert.equal(
    cloverMeasurePath({
      isQi: true,
      isPartDQi: true,
      star: 3,
      inPool: false,
      onShared: false,
      onOwnMin: false,
      partDQiRemoved: true,
      alreadyAtFour: false,
    }).reason,
    "Removed: Part D QI leaves with the other Part D measures",
  );
  assert.equal(
    cloverMeasurePath({
      isQi: false,
      isPartDQi: false,
      isHedis: true,
      star: 2,
      inPool: true,
      onShared: false,
      onOwnMin: false,
      partDQiRemoved: false,
      alreadyAtFour: false,
    }).reason,
    "Kept: HEDIS is only removed when nothing else works",
  );
  assert.equal(
    cloverMeasurePath({
      isQi: false,
      isPartDQi: false,
      isHedis: true,
      star: 1,
      inPool: true,
      onShared: true,
      onOwnMin: false,
      partDQiRemoved: false,
      alreadyAtFour: false,
    }).reason,
    "Removed: nothing else reached 4.0",
  );
  assert.equal(
    cloverMeasurePath({
      isQi: false,
      isPartDQi: false,
      star: 2,
      inPool: true,
      onShared: false,
      onOwnMin: false,
      partDQiRemoved: false,
      alreadyAtFour: false,
      canReachFour: false,
    }).reason,
    "Kept: removing it would leave too few measures",
  );
  assert.deepEqual(
    cloverMeasurePath({
      isQi: false,
      isPartDQi: false,
      star: 2,
      inPool: true,
      onShared: false,
      onOwnMin: false,
      onCeiling: true,
      partDQiRemoved: false,
      alreadyAtFour: false,
      canReachFour: false,
    }),
    { role: "removed", reason: "Removed: still short of 4.0" },
  );
  assert.equal(keptReasonWhenShort({ star: 2, ifRemoved: "lower" }), "Kept: removing it would lower the score");
  assert.equal(keptReasonWhenShort({ star: 3, ifRemoved: "other" }), "Kept: still short of 4.0");
});

test("removing one kept measure rescores the overall, or drops the rating at the floor", () => {
  const rated = [
    ...Array.from({ length: 14 }, (_, index) => measure(`C${10 + index}`, 4)),
    measure("D08", 4),
    measure("C28", 1, 3),
    measure("C33", 5, 3),
  ];
  const row = input("H1", rated);
  const pool = ["C28", "C33"];
  const base = evaluateCloverRemoval(row, [], ZERO_RF, ZERO_RF, pool);
  const low = evaluateKeptRemoval(row, [], "C28", ZERO_RF, ZERO_RF, pool);
  const high = evaluateKeptRemoval(row, [], "C33", ZERO_RF, ZERO_RF, pool);
  assert.ok(base);
  assert.notEqual(low, "unrated");
  assert.notEqual(high, "unrated");
  if (low === "unrated" || high === "unrated" || !base) return;
  assert.ok(low.finalScoreRaw > base.finalScoreRaw);
  assert.ok(high.finalScoreRaw < base.finalScoreRaw);

  const tight = [
    ...Array.from({ length: 13 }, (_, index) => measure(`C${10 + index}`, 4)),
    measure("D08", 4),
    measure("C28", 1, 3),
  ];
  assert.equal(evaluateKeptRemoval(input("H2", tight), [], "C28", ZERO_RF, ZERO_RF, ["C28"]), "unrated");
});

test("removing every 3-star and under measure raises the score, and stops when a rating would be lost", () => {
  const rated = [
    ...Array.from({ length: 14 }, (_, index) => measure(`C${10 + index}`, 4)),
    measure("D08", 5),
    measure("C28", 1, 3),
    measure("C33", 3, 2),
    measure("C30", 1, 5),
  ];
  const result = evaluateAllLowStarRemoval(input("H1", rated), ZERO_RF, ZERO_RF, ["C28", "C33", "C30"]);
  const base = evaluateCloverRemoval(input("H1", rated), [], ZERO_RF, ZERO_RF, ["C28", "C33", "C30"]);
  assert.equal(result.removedAll, true);
  assert.deepEqual([...result.codes].sort(), ["C28", "C33"]);
  assert.ok(base && result.score && result.score.finalScoreRaw > base.finalScoreRaw);

  const tight = [
    ...Array.from({ length: 12 }, (_, index) => measure(`C${10 + index}`, 4)),
    measure("D08", 4),
    measure("C28", 1, 3),
    measure("C33", 2, 3),
    measure("C32", 3, 1),
  ];
  const limited = evaluateAllLowStarRemoval(input("H2", tight), ZERO_RF, ZERO_RF, ["C28", "C33", "C32"]);
  assert.equal(limited.availableCount, 3);
  assert.equal(limited.removedAll, false);
  assert.equal(limited.codes.length, 1);
  assert.ok((limited.score?.measureCount ?? 0) >= 15);
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
