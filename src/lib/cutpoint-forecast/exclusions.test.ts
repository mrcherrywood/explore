import assert from "node:assert/strict";
import test from "node:test";

import { getLatestContractRecords } from "@/lib/band-movement/analysis";

import {
  isAetnaForecastParent,
  isGlycemicStatusMeasure,
  shouldExcludeForecastScore,
} from "./exclusions";
import {
  emptyForecastYearEndOverlay,
  lookupForecastYearEndSamples,
} from "./pp1-overlay";

function aetnaId(): string {
  const id = getLatestContractRecords().find((record) =>
    isAetnaForecastParent(record.parentOrg),
  )?.contractId;
  assert.ok(id, "need a published CVS Health / Aetna contract");
  return id.trim().toUpperCase();
}

function otherId(): string {
  const id = getLatestContractRecords().find(
    (record) =>
      record.parentOrg.trim().length > 0 &&
      !isAetnaForecastParent(record.parentOrg),
  )?.contractId;
  assert.ok(id, "need a non-Aetna published contract");
  return id.trim().toUpperCase();
}

test("isGlycemicStatusMeasure matches GSD and Blood Sugar Controlled aliases", () => {
  assert.equal(
    isGlycemicStatusMeasure("diabetes care blood sugar controlled partc"),
    true,
  );
  assert.equal(isGlycemicStatusMeasure("glycemic status diabetes gsd"), true);
  assert.equal(isGlycemicStatusMeasure("breast cancer screening partc"), false);
});

test("shouldExcludeForecastScore drops only Aetna GSD", () => {
  const aetna = aetnaId();
  const other = otherId();
  assert.equal(
    shouldExcludeForecastScore(aetna, "diabetes care blood sugar controlled partc"),
    true,
  );
  assert.equal(
    shouldExcludeForecastScore(aetna, "breast cancer screening partc"),
    false,
  );
  assert.equal(
    shouldExcludeForecastScore(other, "diabetes care blood sugar controlled partc"),
    false,
  );
});

test("lookupForecastYearEndSamples drops Aetna GSD fills", () => {
  const aetna = aetnaId();
  const other = otherId();
  const overlay = emptyForecastYearEndOverlay();
  overlay.byMeasureNormalized.set("diabetes care blood sugar controlled partc", [
    { contractId: aetna, score: 66 },
    { contractId: other, score: 88 },
  ]);
  const samples = lookupForecastYearEndSamples(
    overlay,
    "diabetes care blood sugar controlled partc",
    "C12",
  );
  assert.equal(samples.some((sample) => sample.contractId === aetna), false);
  assert.equal(samples.some((sample) => sample.contractId === other), true);
});
