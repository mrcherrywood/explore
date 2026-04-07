import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGuardrails,
  assignResampleFolds,
  clusterScoresWard,
  computeTukeyFences,
  deriveThresholdsFromClusters,
} from "./cut-point-methodology";

test("computeTukeyFences caps outer fences to 0-100 bounds", () => {
  const fences = computeTukeyFences([5, 6, 7, 8, 9, 10, 95], {
    min: 0,
    max: 100,
    isPercentageScale: true,
  });

  assert.equal(fences.lower >= 0, true);
  assert.equal(fences.upper <= 100, true);
});

test("assignResampleFolds is deterministic and near-even", () => {
  const samples = Array.from({ length: 17 }, (_, index) => ({
    contractId: `H${String(index + 1).padStart(4, "0")}`,
    score: index,
  }));

  const first = assignResampleFolds(samples);
  const second = assignResampleFolds(samples);

  assert.deepEqual(first, second);

  const counts = new Map<number, number>();
  for (const sample of first) {
    counts.set(sample.fold, (counts.get(sample.fold) ?? 0) + 1);
  }

  const values = [...counts.values()];
  assert.equal(Math.max(...values) - Math.min(...values) <= 1, true);
});

test("clusterScoresWard plus deriveThresholdsFromClusters returns increasing thresholds", () => {
  const scores = [10, 11, 12, 50, 51, 52, 70, 71, 72, 90, 91, 92, 98, 99, 100];
  const clusters = clusterScoresWard(scores, 5);
  const thresholds = deriveThresholdsFromClusters(clusters, false);

  assert.equal(clusters.length, 5);
  assert.deepEqual(thresholds, {
    twoStar: 50,
    threeStar: 70,
    fourStar: 90,
    fiveStar: 98,
  });
});

test("deriveThresholdsFromClusters flips boundaries for inverted measures", () => {
  const scores = [10, 11, 12, 50, 51, 52, 70, 71, 72, 90, 91, 92, 98, 99, 100];
  const clusters = clusterScoresWard(scores, 5);
  const thresholds = deriveThresholdsFromClusters(clusters, true);

  assert.deepEqual(thresholds, {
    twoStar: 92,
    threeStar: 72,
    fourStar: 52,
    fiveStar: 12,
  });
});

test("applyGuardrails caps threshold movement to five points on 0-100 scales", () => {
  const guarded = applyGuardrails(
    {
      twoStar: 40,
      threeStar: 60,
      fourStar: 80,
      fiveStar: 100,
    },
    {
      twoStar: 50,
      threeStar: 50,
      fourStar: 50,
      fiveStar: 50,
    },
    {
      min: 0,
      max: 100,
      isPercentageScale: true,
    },
    100,
    false
  );

  assert.equal(guarded.cap, 5);
  assert.deepEqual(guarded.thresholds, {
    twoStar: 45,
    threeStar: 55,
    fourStar: 55,
    fiveStar: 55,
  });
});
