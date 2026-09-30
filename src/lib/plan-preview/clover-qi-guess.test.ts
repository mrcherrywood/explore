import assert from "node:assert/strict";
import test from "node:test";

import type { OfficialCutPointRow } from "./official-cut-points";
import { guessRemainingQi, type QiGuessLabel } from "./clover-qi-guess";

const PART_C_CUT: OfficialCutPointRow = {
  year: 2027,
  measureCode: "C29",
  measureName: "Health Plan Quality Improvement",
  inverted: false,
  weightCategory: null,
  weight: 5,
  twoStar: -0.184029,
  threeStar: 0,
  fourStar: 0.161052,
  fiveStar: 0.336992,
};

const PART_D_CUT: OfficialCutPointRow = {
  year: 2027,
  measureCode: "D04",
  measureName: "Drug Plan Quality Improvement",
  inverted: false,
  weightCategory: null,
  weight: 5,
  twoStar: -0.296792,
  threeStar: 0,
  fourStar: 0.231209,
  fiveStar: 0.513866,
};

function row(
  baselineCode: string,
  part: "part_c" | "part_d",
  significance: string,
  weight: number,
): QiGuessLabel {
  return { baselineCode, part, significance, weight };
}

test("weighted improvement index matches the CMS hold-harmless denominator", () => {
  const rows = [
    row("C06", "part_c", "Significant improvement", 3),
    row("C15", "part_c", "Significant decline", 1),
    row("C22", "part_c", "No significant change", 1),
    row("C28", "part_c", "Hold Harmless", 2),
    row("C07", "part_c", "Not eligible", 1),
    row("D08", "part_d", "Significant decline", 3),
    row("D01", "part_d", "No significant change", 2),
  ];
  const guess = guessRemainingQi(rows, [], { partC: PART_C_CUT, partD: PART_D_CUT });
  assert.equal(guess.partC.index, 2 / 7);
  assert.equal(guess.partC.star, 4);
  assert.equal(guess.partD.index, -3 / 5);
  assert.equal(guess.partD.star, 1);
});

test("dropping a significant decline raises the remaining-measure QI star", () => {
  const rows = [
    row("C06", "part_c", "Significant improvement", 3),
    row("C15", "part_c", "Significant decline", 3),
    row("C22", "part_c", "No significant change", 1),
  ];
  const before = guessRemainingQi(rows, [], { partC: PART_C_CUT, partD: PART_D_CUT });
  const after = guessRemainingQi(rows, ["C15"], { partC: PART_C_CUT, partD: PART_D_CUT });
  assert.equal(before.partC.index, 0);
  assert.equal(before.partC.star, 3);
  assert.equal(after.partC.index, 3 / 4);
  assert.equal(after.partC.star, 5);
  assert.equal(after.partD.star, null);
});
