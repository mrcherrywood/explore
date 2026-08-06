import assert from "node:assert/strict";
import test from "node:test";

import { computeWeightedDomainMeans } from "./report-data";

test("computeWeightedDomainMeans matches Contract Summary weighting", () => {
  const means = computeWeightedDomainMeans(
    [
      { code: "C03", star: 4 },
      { code: "C21", star: 3 },
      { code: "C04", star: 1 },
      { code: "C05", star: 1 },
      { code: "C06", star: 5 },
    ],
    new Map([
      ["C03", { domain: "CAHPS", weight: 1 }],
      ["C21", { domain: "CAHPS", weight: 2 }],
      ["C04", { domain: "HOS", weight: 1 }],
      ["C05", { domain: "HOS", weight: 1 }],
      ["C06", { domain: "HOS", weight: 3 }],
      ["C99", { domain: "HEDIS", weight: 0 }], // ignored
    ])
  );

  // CAHPS: (4*1 + 3*2) / 3 = 3.333... → 3.33
  assert.equal(means.get("CAHPS"), 3.33);
  // HOS: (1*1 + 1*1 + 5*3) / 5 = 3.4
  assert.equal(means.get("HOS"), 3.4);
  assert.equal(means.has("HEDIS"), false);
});
