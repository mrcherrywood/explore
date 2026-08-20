import assert from "node:assert/strict";
import test from "node:test";

import { getLatestContractRecords } from "@/lib/band-movement/analysis";

import { analyzeStarDistribution } from "./analysis";
import { buildBookRosterOrgs, UNRATED_ORG } from "./orgs";

test("buildBookRosterOrgs groups contracts by published parent organization", () => {
  const records = getLatestContractRecords().filter(
    (record) => record.parentOrg.trim().length > 0
  );
  assert.ok(records.length >= 2);

  const first = records[0];
  const second =
    records.find((record) => record.parentOrg !== first.parentOrg) ?? records[1];
  const ids = new Set([first.contractId, second.contractId]);
  const orgs = buildBookRosterOrgs(ids, {
    forecast: new Set([first.contractId]),
    pp1: new Set([first.contractId, second.contractId]),
  });

  const firstOrg = orgs.find((org) => org.name === first.parentOrg);
  assert.ok(firstOrg);
  assert.ok(firstOrg.contracts.includes(first.contractId));
  assert.equal(firstOrg.forecast, 1);
  assert.equal(firstOrg.both, 1);

  const unknown = buildBookRosterOrgs(new Set(["H4321"]), {
    forecast: new Set(),
    pp1: new Set(["H4321"]),
  });
  assert.equal(unknown[0]?.name, UNRATED_ORG);
  assert.deepEqual(unknown[0]?.contracts, ["H4321"]);
  assert.equal(unknown[0]?.pp1, 1);
  assert.equal(unknown[0]?.forecast, 0);
});

test("buildBookRosterOrgs uses overlay parent orgs when Stars files have no row", () => {
  const orgs = buildBookRosterOrgs(new Set(["H0839"]), {
    forecast: new Set(["H0839"]),
    pp1: new Set(),
    parentById: new Map([["H0839", "Example PACE Parent"]]),
  });
  assert.equal(orgs[0]?.name, "Example PACE Parent");
  assert.deepEqual(orgs[0]?.contracts, ["H0839"]);
});

test("analyzeStarDistribution includes parent orgs for the book roster", () => {
  const record = getLatestContractRecords().find(
    (row) => row.parentOrg.trim().length > 0
  );
  assert.ok(record);
  const result = analyzeStarDistribution(
    new Set([record.contractId]),
    "combined",
    { forecast: 1, pp1: 0, combined: 1, both: 0 },
    { forecast: new Set([record.contractId]), pp1: new Set() }
  );
  assert.equal(result.orgs.length, 1);
  assert.equal(result.orgs[0].name, record.parentOrg);
  assert.deepEqual(result.orgs[0].contracts, [record.contractId]);
});
