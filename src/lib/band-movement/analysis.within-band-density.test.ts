import assert from "node:assert/strict";
import test from "node:test";

import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";

import { computeWithinBandDensity } from "./analysis";

function makeCutPoint(overrides: Partial<MeasureCutPoint["thresholds"]> = {}): MeasureCutPoint {
  return {
    hlCode: "HL99",
    measureName: "Test",
    domain: null,
    year: 2025,
    weight: null,
    thresholds: {
      oneStarUpperBound: null,
      twoStar: 80,
      threeStar: 85,
      fourStar: 87,
      fiveStar: 91,
      ...overrides,
    },
  };
}

test("computeWithinBandDensity normal 5★ uses fiveStar–100 band", () => {
  const cp = makeCutPoint();
  const d = computeWithinBandDensity([91, 95, 100], 5, cp, false);
  assert.ok(d);
  assert.equal(d.lowerThreshold, 91);
  assert.equal(d.upperThreshold, 100);
  assert.ok(d.nearLowerThreshold >= 1);
  assert.ok(d.nearUpperThreshold >= 1);
});

test("computeWithinBandDensity normal 1★ uses 0–twoStar band", () => {
  const cp = makeCutPoint();
  const d = computeWithinBandDensity([0, 40, 79], 1, cp, false);
  assert.ok(d);
  assert.equal(d.lowerThreshold, 0);
  assert.equal(d.upperThreshold, 80);
});

test("computeWithinBandDensity inverted 5★ uses 0–fiveStar band", () => {
  const cp = makeCutPoint();
  const d = computeWithinBandDensity([0, 5, 10], 5, cp, true);
  assert.ok(d);
  assert.equal(d.lowerThreshold, 0);
  assert.equal(d.upperThreshold, 91);
});

test("computeWithinBandDensity inverted 1★ uses twoStar–100 band", () => {
  const cp = makeCutPoint();
  const d = computeWithinBandDensity([80, 90, 100], 1, cp, true);
  assert.ok(d);
  assert.equal(d.lowerThreshold, 80);
  assert.equal(d.upperThreshold, 100);
});

test("computeWithinBandDensity returns null when band has zero width", () => {
  const cp = makeCutPoint({ fiveStar: 100 });
  const d = computeWithinBandDensity([100], 5, cp, false);
  assert.equal(d, null);
});
