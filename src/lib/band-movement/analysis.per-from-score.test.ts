import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateScoreChangesByFromScore,
  scoreBucketKey,
  type ContractMovementRow,
} from "./analysis";

function makeRow(
  partial: Partial<ContractMovementRow> & Pick<ContractMovementRow, "fromScore" | "toScore">
): ContractMovementRow {
  return {
    contractId: "H1",
    contractName: "",
    orgName: "",
    parentOrg: "",
    fromStar: 4,
    toStar: 4,
    starChange: 0,
    fractionalFrom: null,
    fractionalTo: null,
    fractionalChange: null,
    ...partial,
  };
}

test("scoreBucketKey rounds to one decimal", () => {
  assert.equal(scoreBucketKey(76), 76);
  assert.equal(scoreBucketKey(76.04), 76);
  assert.equal(scoreBucketKey(76.06), 76.1);
});

test("aggregateScoreChangesByFromScore buckets and averages deltas", () => {
  const rows = aggregateScoreChangesByFromScore([
    makeRow({ fromScore: 76, toScore: 78 }),
    makeRow({ fromScore: 76, toScore: 75 }),
    makeRow({ fromScore: 77, toScore: 78 }),
    makeRow({ fromScore: 76.04, toScore: 75.04 }),
  ]);
  assert.equal(rows.length, 2);
  const r76 = rows.find((r) => r.fromScore === 76);
  assert.ok(r76);
  assert.equal(r76.cohortSize, 3);
  assert.equal(r76.avgScoreChange, 0);
  const r77 = rows.find((r) => r.fromScore === 77);
  assert.ok(r77);
  assert.equal(r77.cohortSize, 1);
  assert.equal(r77.avgScoreChange, 1);
});

test("aggregateScoreChangesByFromScore skips null scores", () => {
  const base = makeRow({ fromScore: 0, toScore: 0 });
  const rows = aggregateScoreChangesByFromScore([
    { ...base, contractId: "H1", fromScore: 76, toScore: null },
    { ...base, contractId: "H2", fromScore: null, toScore: 80 },
  ]);
  assert.equal(rows.length, 0);
});

test("aggregateScoreChangesByFromScore sorts by fromScore ascending", () => {
  const rows = aggregateScoreChangesByFromScore([
    makeRow({ fromScore: 90, toScore: 91 }),
    makeRow({ fromScore: 70, toScore: 71 }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.fromScore),
    [70, 90]
  );
});
