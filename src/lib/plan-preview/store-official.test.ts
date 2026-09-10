import assert from "node:assert/strict";
import test from "node:test";

import { officialSummaryKey, withPreservedImprovementScore } from "./store-official";

test("summary re-uploads keep already overlaid QI scores", () => {
  const existing = new Map([[officialSummaryKey("H7917", "part_c"), 0.048]]);
  const kept = withPreservedImprovementScore(
    { contract_id: "H7917", rating_type: "part_c", final_rating: 3.5 },
    "H7917",
    "part_c",
    existing,
  );
  assert.equal(kept.improvement_score, 0.048);

  const firstInsert = withPreservedImprovementScore(
    { contract_id: "H3259", rating_type: "part_d", final_rating: 2.5 },
    "H3259",
    "part_d",
    existing,
  );
  assert.equal("improvement_score" in firstInsert, false);
});
