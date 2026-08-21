import assert from "node:assert/strict";
import test from "node:test";

import { generateCsvString } from "@/lib/export/csv";

import { bookVsCmsScoreCsv, bookVsCmsStarShareCsv } from "./export";
import { compareShares, emptyScoreSlice, shareFromCounts } from "./stats";
import type { MeasureDistribution } from "./types";

test("bookVsCmsStarShareCsv writes book and CMS columns for every star", () => {
  const slice = compareShares(
    shareFromCounts([10, 20, 30, 25, 15]),
    shareFromCounts([5, 15, 25, 35, 20])
  );
  const measure: MeasureDistribution = {
    name: "Breast Cancer Screening",
    normalizedName: "breast cancer screening partc",
    inverted: false,
    years: [],
    all: slice,
    last3: slice,
    last3W: slice,
    allScore: emptyScoreSlice(),
    last3Score: emptyScoreSlice(),
    last3WScore: emptyScoreSlice(),
  };
  const csv = generateCsvString(bookVsCmsStarShareCsv([{ measure, slice }]));
  assert.match(csv, /^measure,part,5_star_book_pct,5_star_cms_pct,5_star_delta_pp,/);
  assert.match(csv, /Breast Cancer Screening,C,/);
  assert.match(csv, /,20.0,15.0,5.0,/);
  assert.match(csv, /,35.0,25.0,10.0,/);
  assert.match(csv, /,100,100\n?$/);
});

test("bookVsCmsScoreCsv writes mean scores and inverted flag", () => {
  const slice = compareShares(
    shareFromCounts([10, 20, 30, 25, 15]),
    shareFromCounts([5, 15, 25, 35, 20])
  );
  const measure: MeasureDistribution = {
    name: "Complaints about the Health Plan",
    normalizedName: "complaints about the health plan partc",
    inverted: true,
    years: [],
    all: slice,
    last3: slice,
    last3W: slice,
    allScore: {
      cms: { n: 100, mean: 0.32 },
      book: { n: 12, mean: 0.28 },
      meanDelta: -0.04,
    },
    last3Score: emptyScoreSlice(),
    last3WScore: emptyScoreSlice(),
  };
  const csv = generateCsvString(
    bookVsCmsScoreCsv([{ measure, score: measure.allScore }])
  );
  assert.match(csv, /^measure,part,inverted,score_book,score_cms,score_delta,/);
  assert.match(csv, /Complaints about the Health Plan,C,yes,0.28,0.32,-0.04,12,100\n?$/);
});
