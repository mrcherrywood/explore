import assert from "node:assert/strict";
import { test } from "node:test";

import { isScoreDeltaImprovement } from "./score-delta-direction";

test("normal measures treat score increases as improvement", () => {
  assert.equal(isScoreDeltaImprovement(0.01, false), true);
  assert.equal(isScoreDeltaImprovement(-2, false), false);
});

test("inverse measures treat score increases as decline", () => {
  assert.equal(isScoreDeltaImprovement(0.01, true), false);
  assert.equal(isScoreDeltaImprovement(-0.01, true), true);
});
