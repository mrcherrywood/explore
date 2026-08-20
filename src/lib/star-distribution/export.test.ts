import assert from "node:assert/strict";
import test from "node:test";

import { generateCsvString } from "@/lib/export/csv";

import { bookVsCmsStarShareCsv } from "./export";
import { compareShares, shareFromCounts } from "./stats";
import type { MeasureDistribution } from "./types";

test("bookVsCmsStarShareCsv writes book and CMS columns for every star", () => {
  const slice = compareShares(
    shareFromCounts([10, 20, 30, 25, 15]),
    shareFromCounts([5, 15, 25, 35, 20])
  );
  const measure: MeasureDistribution = {
    name: "Breast Cancer Screening",
    normalizedName: "breast cancer screening partc",
    years: [],
    all: slice,
    last3: slice,
    last3W: slice,
  };
  const csv = generateCsvString(bookVsCmsStarShareCsv([{ measure, slice }]));
  assert.match(csv, /^measure,part,5_star_book_pct,5_star_cms_pct,5_star_delta_pp,/);
  assert.match(csv, /Breast Cancer Screening,C,/);
  assert.match(csv, /,20.0,15.0,5.0,/);
  assert.match(csv, /,35.0,25.0,10.0,/);
  assert.match(csv, /,100,100\n?$/);
});
