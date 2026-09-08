import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClientMeasureYoyExport,
  classifyStarMovement,
  clientMeasureYoyDetailToCsv,
  clientMeasureYoySummaryToCsv,
  type ClientMeasureYoyExportBundle,
} from "./client-measure-yoy-export";

test("classifyStarMovement maps star deltas", () => {
  assert.equal(classifyStarMovement(1), "improved");
  assert.equal(classifyStarMovement(2), "improved");
  assert.equal(classifyStarMovement(0), "held");
  assert.equal(classifyStarMovement(-1), "declined");
});

test("clientMeasureYoyDetailToCsv includes movement columns and escapes commas", () => {
  const bundle: ClientMeasureYoyExportBundle = {
    generatedAt: "2026-08-10T00:00:00.000Z",
    clientContractCount: 1,
    transitions: [2025],
    detailRows: [
      {
        contractId: "H1234",
        contractName: "Example Plan, LLC",
        orgName: "Example",
        parentOrg: "Parent Org",
        measureNormalized: "breast cancer screening partc",
        measureDisplayName: "Breast Cancer Screening",
        measureCodeFrom: "C01",
        measureCodeTo: "C01",
        fromYear: 2025,
        toYear: 2026,
        fromScore: 80,
        toScore: 82,
        fromStar: 4,
        toStar: 5,
        scoreDelta: 2,
        starDelta: 1,
        movement: "improved",
        fractionalFrom: 4.2,
        fractionalTo: 5.1,
        fractionalChange: 0.9,
      },
    ],
    summaryRows: [],
  };

  const csv = clientMeasureYoyDetailToCsv(bundle);
  assert.match(csv, /^contract_id,/);
  assert.match(csv, /"Example Plan, LLC"/);
  assert.match(csv, /,improved,/);
  assert.match(csv, /,1,/);
});

test("clientMeasureYoySummaryToCsv puts Declined before Held before Improved", () => {
  const bundle: ClientMeasureYoyExportBundle = {
    generatedAt: "2026-08-10T00:00:00.000Z",
    clientContractCount: 3,
    transitions: [2025],
    detailRows: [],
    summaryRows: [
      {
        measureNormalized: "breast cancer screening partc",
        measureDisplayName: "Breast Cancer Screening",
        measureCodeFrom: "C01",
        measureCodeTo: "C01",
        fromYear: 2025,
        toYear: 2026,
        clientCount: 10,
        improved: 4,
        held: 3,
        declined: 3,
        improvedPct: 40,
        heldPct: 30,
        declinedPct: 30,
        avgStarDelta: 0.1,
        avgScoreDelta: 0.5,
        scoreDeltaCount: 10,
      },
    ],
  };

  const header = clientMeasureYoySummaryToCsv(bundle).split("\n")[0];
  const declinedIdx = header.indexOf("declined");
  const heldIdx = header.indexOf("held");
  const improvedIdx = header.indexOf("improved");
  assert.ok(declinedIdx > 0 && heldIdx > declinedIdx && improvedIdx > heldIdx);
});

test("buildClientMeasureYoyExport returns client-only detail and summary rows", () => {
  const bundle = buildClientMeasureYoyExport();
  assert.ok(bundle.clientContractCount > 0);
  assert.deepEqual(bundle.transitions, [2023, 2024, 2025]);
  assert.ok(bundle.detailRows.length > 0);
  assert.ok(bundle.summaryRows.length > 0);

  for (const row of bundle.detailRows.slice(0, 50)) {
    assert.ok(row.contractId.startsWith("H") || row.contractId.startsWith("R"));
    assert.ok(["improved", "held", "declined"].includes(row.movement));
    assert.equal(row.toYear, row.fromYear + 1);
    assert.equal(row.starDelta, row.toStar - row.fromStar);
  }

  const sample = bundle.summaryRows[0];
  assert.equal(sample.clientCount, sample.improved + sample.held + sample.declined);
});
