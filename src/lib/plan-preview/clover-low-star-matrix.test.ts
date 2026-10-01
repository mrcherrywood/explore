import assert from "node:assert/strict";
import test from "node:test";

import { buildLowStarMatrixPages, LOW_STAR_CONTRACTS_PER_PAGE } from "./clover-low-star-matrix";

function measure(code: string, name: string, star: number | null, weight = 1) {
  return { code, displayName: name, weight, star };
}

test("low-star matrix lists 3-star and under measures and ranks shared themes first", () => {
  const pages = buildLowStarMatrixPages({
    contracts: [
      {
        contractId: "H1",
        pathMeasures: [
          measure("C28", "Complaints", 2),
          measure("C15", "Diabetes", 5),
          measure("D08", "Adherence", 3),
        ],
      },
      {
        contractId: "H2",
        pathMeasures: [
          measure("C28", "Complaints", 1),
          measure("C15", "Diabetes", 4),
          measure("D08", "Adherence", 5),
        ],
      },
    ],
  });
  const partC = pages.filter((page) => page.part === "Part C");
  const partD = pages.filter((page) => page.part === "Part D");
  assert.equal(partC.length, 1);
  assert.deepEqual(partC[0].rows.map((row) => row.code), ["C28"]);
  assert.equal(partC[0].rows[0].lowCount, 2);
  assert.deepEqual(partC[0].rows[0].stars, [2, 1]);
  assert.deepEqual(partC[0].contractLowCounts, [1, 1]);
  assert.equal(partD.length, 1);
  assert.equal(partD[0].rows[0].code, "D08");
  assert.equal(partD[0].rows[0].lowCount, 1);
  assert.deepEqual(partD[0].rows[0].stars, [3, 5]);
});

test("low-star matrix splits wide organizations across pages", () => {
  const contracts = Array.from({ length: LOW_STAR_CONTRACTS_PER_PAGE + 1 }, (_, index) => ({
    contractId: `H${index}`,
    pathMeasures: [measure("C28", "Complaints", 2)],
  }));
  const pages = buildLowStarMatrixPages({ contracts });
  assert.equal(pages.length, 2);
  assert.equal(pages[0].contractIds.length, LOW_STAR_CONTRACTS_PER_PAGE);
  assert.equal(pages[1].contractIds.length, 1);
  assert.equal(pages[0].rows[0].lowCount, contracts.length);
  assert.equal(pages[1].rows[0].stars.length, 1);
});
