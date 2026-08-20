import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMeasuresPartThenName,
  compareShares,
  periodCaption,
  poolShares,
  shareFromCounts,
  shareFromStars,
  sliceForPeriod,
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
  };
  const measure: MeasureDistribution = {
    name: "Breast Cancer Screening",
    normalizedName: "breast cancer screening partc",
    years: [y2026],
    all: last3W,
    last3: last3W,
    last3W,
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
