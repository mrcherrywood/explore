import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMeasuresPartThenName,
  compareShares,
  emptyScoreSlice,
  fepDeltaClass,
  periodCaption,
  poolScoreShares,
  poolShares,
  scoreDeltaBetter,
  shareFromCounts,
  shareFromScores,
  shareFromStars,
  sliceForPeriod,
  scoreSliceForPeriod,
  starShareBetter,
} from "./stats";
import type { MeasureDistribution, StarDistributionResponse } from "./types";

test("shareFromStars reports 4-star and 4-star+ from whole-star ratings", () => {
  const share = shareFromStars([5, 4, 4, 3, 2]);
  assert.equal(share.n, 5);
  assert.equal(share.mean, 3.6);
  assert.equal(share.pct[3], 40);
  assert.equal(share.fourPlus, 60);
  assert.deepEqual(share.counts, [0, 1, 1, 2, 1]);
});

test("compareShares is book minus CMS", () => {
  const slice = compareShares(
    shareFromCounts([0, 0, 2, 2, 1]),
    shareFromCounts([0, 0, 1, 3, 1])
  );
  assert.equal(slice.cms.pct[3], 40);
  assert.equal(slice.book.pct[3], 60);
  assert.equal(slice.fourStarDelta, 20);
  assert.equal(slice.meanDelta, 0.2);
});

test("poolShares applies recency weights to raw counts", () => {
  const y2024 = shareFromCounts([0, 0, 0, 100, 0]);
  const y2026 = shareFromCounts([0, 0, 0, 0, 100]);
  const pooled = poolShares(
    [
      { year: 2024, share: y2024 },
      { year: 2026, share: y2026 },
    ],
    { 2024: 1, 2026: 3 }
  );
  assert.equal(pooled.n, 400);
  assert.equal(pooled.pct[3], 25);
  assert.equal(pooled.pct[4], 75);
});

test("compareMeasuresPartThenName puts Part C before Part D", () => {
  const rows = [
    { name: "MTM Program Completion", normalizedName: "mtm program completion partd" },
    { name: "Breast Cancer Screening", normalizedName: "breast cancer screening partc" },
    { name: "Colorectal Cancer Screening", normalizedName: "colorectal cancer screening partc" },
  ];
  rows.sort(compareMeasuresPartThenName);
  assert.deepEqual(
    rows.map((row) => row.name),
    ["Breast Cancer Screening", "Colorectal Cancer Screening", "MTM Program Completion"]
  );
});

test("sliceForPeriod reads the selected measure window", () => {
  const last3W = compareShares(
    shareFromCounts([0, 0, 70, 30, 0]),
    shareFromCounts([0, 0, 60, 40, 0])
  );
  const y2026 = {
    year: 2026,
    code: "C01",
    ...compareShares(shareFromCounts([0, 0, 64, 36, 0]), shareFromCounts([0, 0, 56, 44, 0])),
    score: emptyScoreSlice(),
  };
  const measure: MeasureDistribution = {
    name: "Breast Cancer Screening",
    normalizedName: "breast cancer screening partc",
    inverted: false,
    years: [y2026],
    all: last3W,
    last3: last3W,
    last3W,
    allScore: emptyScoreSlice(),
    last3Score: emptyScoreSlice(),
    last3WScore: emptyScoreSlice(),
  };
  const data = {
    roster: "combined",
    inventory: { forecast: 0, pp1: 0, combined: 0, both: 0 },
    years: [2026],
    orgs: [],
    pooled: { all: last3W, last3: last3W, last3W, byYear: [y2026] },
    measures: [measure],
  } as StarDistributionResponse;

  assert.equal(sliceForPeriod(data, "last3W", measure).book.pct[3], 40);
  assert.equal(sliceForPeriod(data, "2026", measure).book.pct[3], 44);
  assert.match(periodCaption("last3W"), /recency-weighted/);
});

test("poolScoreShares applies recency weights to contract-year means", () => {
  const pooled = poolScoreShares(
    [
      { year: 2024, share: shareFromScores(Array(100).fill(80)) },
      { year: 2026, share: shareFromScores(Array(100).fill(90)) },
    ],
    { 2024: 1, 2026: 3 }
  );
  assert.equal(pooled.n, 400);
  assert.equal(pooled.mean, 87.5);
});

test("scoreSliceForPeriod reads the selected measure window", () => {
  const last3WScore = {
    cms: { n: 10, mean: 80 },
    book: { n: 4, mean: 82 },
    meanDelta: 2,
  };
  const y2026Score = {
    cms: { n: 10, mean: 81 },
    book: { n: 4, mean: 84 },
    meanDelta: 3,
  };
  const last3W = compareShares(
    shareFromCounts([0, 0, 70, 30, 0]),
    shareFromCounts([0, 0, 60, 40, 0])
  );
  const measure: MeasureDistribution = {
    name: "Breast Cancer Screening",
    normalizedName: "breast cancer screening partc",
    inverted: false,
    years: [
      {
        year: 2026,
        code: "C01",
        ...last3W,
        score: y2026Score,
      },
    ],
    all: last3W,
    last3: last3W,
    last3W,
    allScore: last3WScore,
    last3Score: last3WScore,
    last3WScore: last3WScore,
  };
  assert.equal(scoreSliceForPeriod(measure, "last3W").book.mean, 82);
  assert.equal(scoreSliceForPeriod(measure, "2026").book.mean, 84);
  assert.match(periodCaption("last3W", "scores"), /scores/);
});

test("starShareBetter treats more 4★/5★ as better and more 1★/2★ as worse", () => {
  assert.equal(starShareBetter(4, 3), 3);
  assert.equal(starShareBetter(3, -2), -2);
  assert.equal(starShareBetter(0, 4), -4);
  assert.equal(starShareBetter(1, -1), 1);
  assert.equal(starShareBetter(2, 8), 0);
});

test("scoreDeltaBetter flips for inverted measures", () => {
  assert.equal(scoreDeltaBetter(1.2, false), 1);
  assert.equal(scoreDeltaBetter(-0.4, false), -1);
  assert.equal(scoreDeltaBetter(-0.04, true), 1);
  assert.equal(scoreDeltaBetter(0.1, true), -1);
  assert.equal(scoreDeltaBetter(0, true), 0);
  assert.equal(fepDeltaClass(1), "fep-delta-pos");
  assert.equal(fepDeltaClass(-1), "fep-delta-neg");
  assert.equal(fepDeltaClass(0), "");
});
