import assert from "node:assert/strict";
import test from "node:test";

import type { ContractMeasure, PercentileThresholds } from "@/lib/reward-factor";

import { domainCodes, domainRemovalScenarios, scoreDomainRemovals } from "./clover-domain-removal";
import type { CloverContractSearchInput } from "./clover-min-removal";

const ZERO_RF: PercentileThresholds = {
  mean65th: 5,
  mean85th: 5,
  variance30th: 0,
  variance70th: 0.01,
};

function measure(code: string, starValue: number, weight = 1): ContractMeasure {
  return {
    code,
    starValue,
    weight,
    category: code.startsWith("D") ? "Part D" : "Part C",
  };
}

test("domain codes leave Quality Improvement in place", () => {
  const codes = domainCodes(
    new Map([
      ["C30", "HEDIS"],
      ["D04", "Pharmacy"],
      ["D08", "Pharmacy"],
      ["C01", "HEDIS"],
    ]),
    ["HEDIS", "Pharmacy"],
  );
  assert.deepEqual(codes.sort(), ["C01", "D08"]);
});

test("domain removal covers every combination of the five domains", () => {
  const scenarios = domainRemovalScenarios();
  assert.equal(scenarios.length, 31);
  assert.deepEqual(
    scenarios.filter((scenario) => scenario.domains.length === 1).map((scenario) => scenario.label),
    ["CAHPS", "HEDIS", "HOS", "Operations", "Pharmacy"],
  );
  assert.ok(scenarios.some((scenario) => scenario.domains.length === 5));
});

test("removing a low-star domain raises the score, and Quality Improvement stays", () => {
  const hedis = Array.from({ length: 16 }, (_, index) => measure(`C${index + 1}`, 5));
  const contract: CloverContractSearchInput = {
    contractId: "H0001",
    measures: [
      ...hedis,
      measure("C30", 5, 5),
      measure("D04", 5, 5),
      measure("D05", 5),
      measure("D08", 1),
      measure("D09", 1),
      measure("D10", 1),
    ],
    overallCai: 0,
    partCCai: 0,
    enrollment: 100,
  };
  const domains = new Map<string, string>([
    ...hedis.map((row) => [row.code, "HEDIS"] as const),
    ["C30", "Quality Improvement"],
    ["D04", "Quality Improvement"],
    ["D05", "CAHPS"],
    ["D08", "Pharmacy"],
    ["D09", "Pharmacy"],
    ["D10", "Pharmacy"],
  ]);
  const thresholds = domainRemovalScenarios().map(() => ({ withQi: ZERO_RF, withoutQi: ZERO_RF }));
  const result = scoreDomainRemovals([contract], domains, thresholds);
  const pharmacy = result.scenarios.findIndex((scenario) => scenario.id === "Pharmacy");
  const all = result.scenarios.findIndex((scenario) => scenario.domains.length === 5);
  const pharmacyScore = result.contracts[0]?.scores[pharmacy];
  const allScore = result.contracts[0]?.scores[all];
  assert.ok(pharmacyScore);
  assert.equal(pharmacyScore.unrated, false);
  assert.equal(pharmacyScore.removedCount, 3);
  assert.ok((pharmacyScore.finalScoreRaw ?? 0) > 4.5);
  assert.equal(allScore?.unrated, true);
  assert.ok((allScore?.removedCount ?? 0) < contract.measures.length);
});
