import assert from "node:assert/strict";
import test from "node:test";

import {
  getAvailableMeasureYears,
  getAvailableOptions,
  getLatestContractRecords,
  getMeasureYearScoreSamples,
} from "./analysis";
import { analyzeCutPointMethodologyForecast } from "./cut-point-methodology";
import {
  buildClientInformedMarketSamples,
  isEligibleForecastContract,
  overlayProjectedSamples,
} from "@/lib/cutpoint-forecast/analysis";
import { resolveFinalProjectionScore } from "@/lib/cutpoint-forecast/store";

function syntheticSamples(
  count: number,
  scoreForIndex: (index: number) => number,
  prefix = "H"
) {
  return Array.from({ length: count }, (_, index) => ({
    contractId: `${prefix}${String(index + 1).padStart(4, "0")}`,
    score: scoreForIndex(index),
  }));
}

test("analyzeCutPointMethodologyForecast simulates clustering thresholds from projected samples", () => {
  const regularMeasure = getAvailableOptions().measures.find(
    (measure) => measure.displayName === "Breast Cancer Screening"
  );
  assert.ok(regularMeasure);

  const samples = Array.from({ length: 24 }, (_, index) => ({
    contractId: `H${String(index + 1).padStart(4, "0")}`,
    score: 45 + index * 2,
  }));

  const result = analyzeCutPointMethodologyForecast(
    regularMeasure.normalizedName,
    2027,
    samples
  );

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.methodology.method, "clustering");
  assert.equal(result.thresholds.length, 4);
  assert.equal(result.guardrailsApplied, true);
  assert.equal(result.guardrailCap !== null, true);
  assert.equal(result.historicalMovement?.checks.length, 4);
});

test("anchored clustering forecast cancels raw simulation level bias", () => {
  const regularMeasure = getAvailableOptions().measures.find(
    (measure) => measure.displayName === "Breast Cancer Screening"
  );
  assert.ok(regularMeasure);

  const baseline = syntheticSamples(50, (index) => 45 + index);
  const projected = baseline.map((sample) => ({
    ...sample,
    score: sample.score + 1,
  }));
  const shiftedBaseline = baseline.map((sample) => ({
    ...sample,
    score: sample.score + 8,
  }));
  const shiftedProjected = projected.map((sample) => ({
    ...sample,
    score: sample.score + 8,
  }));

  const anchored = analyzeCutPointMethodologyForecast(
    regularMeasure.normalizedName,
    2027,
    projected,
    { baselineSamples: baseline, baselineYear: 2026 }
  );
  const shiftedAnchored = analyzeCutPointMethodologyForecast(
    regularMeasure.normalizedName,
    2027,
    shiftedProjected,
    { baselineSamples: shiftedBaseline, baselineYear: 2026 }
  );

  assert.equal(anchored.status, "ready");
  assert.equal(shiftedAnchored.status, "ready");
  if (anchored.status !== "ready" || shiftedAnchored.status !== "ready") return;

  for (const threshold of anchored.thresholds) {
    const shiftedThreshold: typeof threshold | undefined = shiftedAnchored.thresholds.find(
      (item) => item.key === threshold.key
    );
    assert.ok(shiftedThreshold);
    assert.equal(shiftedThreshold.projected, threshold.projected);
    assert.equal(shiftedThreshold.anchoredMovement, threshold.anchoredMovement);
    assert.notEqual(threshold.rawSimulated, null);
    assert.notEqual(threshold.baselineSimulated, null);
  }
});

test("anchored clustering forecast caps movement and preserves threshold order", () => {
  const regularMeasure = getAvailableOptions().measures.find(
    (measure) => measure.displayName === "Breast Cancer Screening"
  );
  assert.ok(regularMeasure);

  const baseline = syntheticSamples(50, (index) => 40 + index);
  const projected = baseline.map((sample) => ({
    ...sample,
    score: sample.score + 12,
  }));

  const result = analyzeCutPointMethodologyForecast(
    regularMeasure.normalizedName,
    2027,
    projected,
    { baselineSamples: baseline, baselineYear: 2026 }
  );

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.guardrailsApplied, true);
  assert.equal(
    result.thresholds.some((threshold) => threshold.movementWasCapped),
    true
  );
  for (const threshold of result.thresholds) {
    assert.notEqual(threshold.movementCap, null);
    assert.ok(Math.abs(threshold.anchoredMovement ?? 0) <= (threshold.movementCap ?? 0) + 0.01);
  }
  const byKey = new Map(result.thresholds.map((threshold) => [threshold.key, threshold.projected]));
  assert.ok((byKey.get("twoStar") ?? 0) <= (byKey.get("threeStar") ?? 0));
  assert.ok((byKey.get("threeStar") ?? 0) <= (byKey.get("fourStar") ?? 0));
  assert.ok((byKey.get("fourStar") ?? 0) <= (byKey.get("fiveStar") ?? 0));
  assert.ok((byKey.get("fiveStar") ?? 0) <= 100);
});

test("analyzeCutPointMethodologyForecast uses the CAHPS percentile path when needed", () => {
  const cahpsMeasure = getAvailableOptions().measures.find(
    (measure) => measure.displayName === "Getting Needed Care"
  );
  assert.ok(cahpsMeasure);

  const samples = Array.from({ length: 30 }, (_, index) => ({
    contractId: `H${String(index + 1).padStart(4, "0")}`,
    score: 60 + index,
  }));

  const result = analyzeCutPointMethodologyForecast(
    cahpsMeasure.normalizedName,
    2027,
    samples
  );

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.methodology.method, "cahps-percentile");
});

test("anchored CAHPS forecast uses percentile movement from the baseline simulation", () => {
  const cahpsMeasure = getAvailableOptions().measures.find(
    (measure) => measure.displayName === "Getting Needed Care"
  );
  assert.ok(cahpsMeasure);

  const baseline = syntheticSamples(40, (index) => 55 + index * 0.6);
  const projected = baseline.map((sample) => ({
    ...sample,
    score: sample.score + 0.8,
  }));

  const result = analyzeCutPointMethodologyForecast(
    cahpsMeasure.normalizedName,
    2027,
    projected,
    { baselineSamples: baseline, baselineYear: 2026 }
  );

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.methodology.method, "cahps-percentile");
  for (const threshold of result.thresholds) {
    assert.notEqual(threshold.rawSimulated, null);
    assert.notEqual(threshold.baselineSimulated, null);
    assert.notEqual(threshold.anchoredMovement, null);
    assert.notEqual(threshold.movementCap, null);
    assert.ok(Math.abs(threshold.anchoredMovement ?? 0) <= (threshold.movementCap ?? 0) + 0.01);
  }
});

test("overlayProjectedSamples replaces baseline contracts and appends new projected ones", () => {
  const regularMeasure = getAvailableOptions().measures.find(
    (measure) => measure.displayName === "Breast Cancer Screening"
  );
  assert.ok(regularMeasure);

  const baselineYear = getAvailableMeasureYears().at(-1);
  assert.ok(baselineYear);

  const baselineSamples = getMeasureYearScoreSamples(
    regularMeasure.normalizedName,
    baselineYear
  );
  assert.equal(baselineSamples.length > 0, true);

  const [firstBaseline] = baselineSamples;
  const combined = overlayProjectedSamples(
    regularMeasure.normalizedName,
    [
      { contractId: firstBaseline.contractId, score: 0 },
      { contractId: "HZZZZ", score: 77 },
    ],
    baselineYear
  );

  assert.equal(
    combined.find((sample) => sample.contractId === firstBaseline.contractId)?.score,
    0
  );
  assert.equal(
    combined.some((sample) => sample.contractId === "HZZZZ"),
    true
  );
});

test("overlayProjectedSamples keeps non-projected market baseline contracts unchanged", () => {
  const regularMeasure = getAvailableOptions().measures.find(
    (measure) => measure.displayName === "Breast Cancer Screening"
  );
  assert.ok(regularMeasure);

  const baselineYear = getAvailableMeasureYears().at(-1);
  assert.ok(baselineYear);

  const baselineSamples = getMeasureYearScoreSamples(
    regularMeasure.normalizedName,
    baselineYear
  );
  const baselineToKeep = baselineSamples.find((sample) => sample.score <= 90);
  assert.ok(baselineToKeep);
  const baselineOverride = baselineSamples.find(
    (sample) => sample.contractId !== baselineToKeep.contractId
  );
  assert.ok(baselineOverride);

  const combined = overlayProjectedSamples(
    regularMeasure.normalizedName,
    [
      { contractId: baselineOverride.contractId, score: 0 },
      { contractId: "HZZZZ", score: 77 },
    ],
    baselineYear
  );

  assert.equal(
    combined.find((sample) => sample.contractId === baselineToKeep.contractId)?.score,
    baselineToKeep.score
  );
  assert.equal(
    combined.find((sample) => sample.contractId === baselineOverride.contractId)?.score,
    0
  );
  assert.equal(
    combined.find((sample) => sample.contractId === "HZZZZ")?.score,
    77
  );
});

test("buildClientInformedMarketSamples shrinks client signal and caps non-client movement", () => {
  const regularMeasure = getAvailableOptions().measures.find(
    (measure) => measure.displayName === "Breast Cancer Screening"
  );
  assert.ok(regularMeasure);

  const baselineYear = getAvailableMeasureYears().at(-1);
  assert.ok(baselineYear);

  const baselineSamples = getMeasureYearScoreSamples(
    regularMeasure.normalizedName,
    baselineYear
  );
  const projectedSource = baselineSamples
    .filter((sample) => sample.score <= 90)
    .slice(0, 120);
  assert.equal(projectedSource.length > 0, true);

  const projectedSamples = projectedSource.map((sample) => ({
    contractId: sample.contractId,
    score: sample.score + 4,
  }));
  const untouchedBaseline = baselineSamples.find(
    (sample) => !projectedSamples.some((projected) => projected.contractId === sample.contractId)
  );
  assert.ok(untouchedBaseline);

  const result = buildClientInformedMarketSamples(
    regularMeasure.normalizedName,
    projectedSamples,
    baselineYear
  );

  assert.equal(result.metadata.matchedContractCount, projectedSamples.length);
  assert.equal(result.metadata.observedClientMeanDelta, 4);
  assert.equal(result.metadata.shrinkageWeight < 1, true);
  assert.equal(
    Math.abs(result.metadata.appliedNonClientDelta) <= result.metadata.nonClientDeltaCap,
    true
  );
  assert.equal(
    result.samples.find((sample) => sample.contractId === projectedSamples[0].contractId)?.score,
    projectedSamples[0].score
  );
  assert.notEqual(
    result.samples.find((sample) => sample.contractId === untouchedBaseline.contractId)?.score,
    untouchedBaseline.score
  );
});

test("isEligibleForecastContract rejects segment/suffix, dashed, and dummy IDs", () => {
  // Letter suffix after the contract id (with or without a dash) is a PBP/segment, not a contract.
  assert.equal(isEligibleForecastContract("H0838-P"), false);
  assert.equal(isEligibleForecastContract("H0838P"), false);
  assert.equal(isEligibleForecastContract("H0838-001"), false);
  // Non-H prefixes and repeating-digit dummy IDs are excluded too.
  assert.equal(isEligibleForecastContract("R1234"), false);
  assert.equal(isEligibleForecastContract("H1111"), false);
});

test("isEligibleForecastContract accepts a clean H#### contract tied to a parent org", () => {
  const real = getLatestContractRecords().find(
    (record) =>
      /^H\d{4}$/.test(record.contractId) &&
      !/^H(\d)\1{3}$/.test(record.contractId) &&
      record.parentOrg.trim().length > 0
  );
  assert.ok(real);
  assert.equal(isEligibleForecastContract(real.contractId), true);
});

test("manual overrides take precedence over model scores", () => {
  assert.equal(resolveFinalProjectionScore(81.2, null), 81.2);
  assert.equal(resolveFinalProjectionScore(81.2, 79.4), 79.4);
});
