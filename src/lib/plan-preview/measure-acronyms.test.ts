import assert from "node:assert/strict";
import test from "node:test";

import { formatMeasureAcronyms, measureAcronym } from "./measure-acronyms";

test("maps scenario removal codes to measure acronyms", () => {
  assert.equal(measureAcronym("C19"), "SPC");
  assert.equal(measureAcronym("C33"), "Call Center (C)");
  assert.equal(measureAcronym("D01"), "Call Center (D)");
  assert.equal(measureAcronym("C24"), "CS");
  assert.equal(measureAcronym("D12"), "SUPD");
  assert.equal(measureAcronym("c09"), "COA");
});

test("falls back to the code when no acronym is defined", () => {
  assert.equal(measureAcronym("C99"), "C99");
});

test("formats a removal list as acronyms", () => {
  assert.equal(
    formatMeasureAcronyms(["C19", "C33", "D01"]),
    "SPC, Call Center (C), Call Center (D)"
  );
});
