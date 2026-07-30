import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildPlanPreviewScenarios } from "./final-scores";
import {
  buildPlanPreviewPredictions,
  starFromThresholds,
  type AccruedMeasureScore,
} from "./predictions";
import { parsePlanPreviewWorkbook } from "./workbook";
import type { PlanPreviewCaiParseResult, PlanPreviewMeasureParseResult } from "./types";

const SAMPLE_MEASURE_PATH = path.join(process.cwd(), "data/2027/SAMPLE_SR_2026_measure_data_v2.xlsx");
const SAMPLE_CAI_PATH = path.join(process.cwd(), "data/2027/SAMPLE_SR_2026_cai (1).xlsx");

function loadSampleAccruedRows(): AccruedMeasureScore[] {
  const parsed = parsePlanPreviewWorkbook(
    readFileSync(SAMPLE_MEASURE_PATH)
  ) as PlanPreviewMeasureParseResult;
  return parsed.rows
    .filter((row) => row.status === "scored" && row.score !== null)
    .map((row) => ({
      contractId: row.contractId,
      contractName: row.contractName,
      organizationMarketingName: row.organizationMarketingName,
      parentOrganization: row.parentOrganization,
      measureCode: row.measureCode,
      measureDisplayName: row.measureDisplayName,
      measureNormalized: row.measureNormalized,
      score: row.score as number,
    }));
}

test("starFromThresholds assigns whole stars for normal and inverted measures", () => {
  const thresholds = { twoStar: 40, threeStar: 60, fourStar: 75, fiveStar: 88 };
  assert.equal(starFromThresholds(90, thresholds, false), 5);
  assert.equal(starFromThresholds(75, thresholds, false), 4);
  assert.equal(starFromThresholds(59.9, thresholds, false), 2);
  assert.equal(starFromThresholds(10, thresholds, false), 1);

  const inverted = { fiveStar: 0.1, fourStar: 0.3, threeStar: 0.6, twoStar: 1.0 };
  assert.equal(starFromThresholds(0.05, inverted, true), 5);
  assert.equal(starFromThresholds(0.5, inverted, true), 3);
  assert.equal(starFromThresholds(2, inverted, true), 1);
});

test(
  "builds anchored cut point predictions and contract stars from the sample file",
  { skip: !existsSync(SAMPLE_MEASURE_PATH) },
  () => {
    const rows = loadSampleAccruedRows();
    assert.ok(rows.length > 30, "expected scored rows from the sample file");

    const result = buildPlanPreviewPredictions(rows, 2027);

    assert.equal(result.baselineYear, 2026, "baseline should be the latest published year");
    assert.ok(result.summary.readyCount > 20, `expected most measures ready, got ${result.summary.readyCount}`);

    // S-prefix PDP contracts are excluded from MA predictions.
    assert.ok(result.contracts.every((contract) => /^[HR]/.test(contract.contractId)));

    const breastCancer = result.cutPoints.find((cp) => cp.measureCode === "C01");
    assert.ok(breastCancer, "C01 prediction missing");
    assert.equal(breastCancer.status, "ready");
    assert.equal(breastCancer.method, "clustering");
    assert.ok(breastCancer.baselineMarketCount > 100, "should anchor to the full published market");
    assert.equal(breastCancer.accruedContractCount, 1, "only H8003 carries C01 in the sample");
    const c01 = Object.fromEntries(
      (breastCancer.thresholds ?? []).map((item) => [item.key, item.projected])
    );
    assert.ok(
      c01.twoStar < c01.threeStar && c01.threeStar < c01.fourStar && c01.fourStar < c01.fiveStar,
      "non-inverted thresholds must ascend"
    );

    // Shorthand medication adherence names resolve via the code fallback.
    for (const code of ["D08", "D09", "D10"]) {
      const adherence = result.cutPoints.find((cp) => cp.measureCode === code);
      assert.ok(adherence, `${code} prediction missing`);
      assert.equal(
        adherence.status,
        "ready",
        `${code} (${adherence.displayName}) should match the universe: ${adherence.reason}`
      );
      assert.match(adherence.displayName, /medication adherence/i);
    }

    // Quality Improvement is excluded by the methodology.
    const qi = result.cutPoints.find((cp) => cp.measureCode === "C30");
    if (qi) assert.equal(qi.status, "unsupported");

    // CAHPS measures use the percentile method.
    const gettingNeededCare = result.cutPoints.find((cp) => cp.measureCode === "C22");
    assert.ok(gettingNeededCare);
    assert.equal(gettingNeededCare.method, "cahps-percentile");

    const h8003 = result.contracts.find((contract) => contract.contractId === "H8003");
    assert.ok(h8003, "H8003 contract prediction missing");
    assert.ok(h8003.ratedMeasureCount > 20, `expected most measures rated, got ${h8003.ratedMeasureCount}`);
    assert.ok(
      h8003.weightedMeanStar !== null && h8003.weightedMeanStar >= 1 && h8003.weightedMeanStar <= 5,
      `weighted mean star out of range: ${h8003.weightedMeanStar}`
    );
    for (const measure of h8003.measures) {
      if (measure.predictedStar !== null) {
        assert.ok(Number.isInteger(measure.predictedStar), "measure stars must be whole");
      }
    }
    const withBaselineStar = h8003.measures.filter((m) => m.baselineOfficialStar !== null);
    assert.ok(withBaselineStar.length > 20, "expected baseline official stars for most measures");
  }
);

test(
  "computes predicted final scores with recomputed thresholds and uploaded CAI",
  { skip: !existsSync(SAMPLE_MEASURE_PATH) || !existsSync(SAMPLE_CAI_PATH) },
  () => {
    const rows = loadSampleAccruedRows();
    const predictions = buildPlanPreviewPredictions(rows, 2027);

    const caiParsed = parsePlanPreviewWorkbook(
      readFileSync(SAMPLE_CAI_PATH)
    ) as PlanPreviewCaiParseResult;
    const cai = { overall: {} as Record<string, number>, partC: {} as Record<string, number> };
    for (const row of caiParsed.rows) {
      if (row.overallCai !== null) cai.overall[row.contractId] = row.overallCai;
      if (row.partCCai !== null) cai.partC[row.contractId] = row.partCCai;
    }

    const scenarios = buildPlanPreviewScenarios(predictions, cai);
    assert.deepEqual(
      scenarios.map((scenario) => scenario.id),
      ["baseline", "removal2028", "removal2029", "cloverRecalc"]
    );
    const result = scenarios[0];

    assert.equal(result.baselineYear, 2026);
    assert.ok(result.populationSize > 300, `population too small: ${result.populationSize}`);
    for (const leg of [result.thresholds.withQi, result.thresholds.withoutQi]) {
      assert.ok(leg, "thresholds missing");
      assert.ok(leg.mean65th < leg.mean85th);
      assert.ok(leg.variance30th < leg.variance70th);
    }

    const h8003 = result.contracts.find((contract) => contract.contractId === "H8003");
    assert.ok(h8003, "H8003 final score missing");
    assert.ok(h8003.qualifiesOverall, `H8003 should qualify: ${h8003.reason}`);
    assert.ok(h8003.caiValue !== null, "CAI should come from the uploaded file");
    assert.ok(h8003.withQi, "with-QI leg should carry forward H8003's 2026 QI stars");
    assert.ok(h8003.withoutQi, "without-QI leg missing");

    // Hold-harmless: final = max of the two legs.
    const expectedRaw = Math.max(h8003.withQi.finalScoreRaw, h8003.withoutQi.finalScoreRaw);
    assert.equal(h8003.finalScoreRaw, expectedRaw);
    assert.equal(
      h8003.finalRating,
      Math.round(Math.min(5, Math.max(1, expectedRaw)) * 2) / 2
    );

    // Each leg must decompose into clamp(base mean + RF) + CAI.
    for (const leg of [h8003.withQi, h8003.withoutQi]) {
      const legRaw =
        Math.min(5, Math.max(1, leg.baseMean + leg.rewardFactor)) + (h8003.caiValue ?? 0);
      assert.ok(
        Math.abs(leg.finalScoreRaw - legRaw) < 1e-9,
        `leg score should decompose: ${leg.finalScoreRaw} vs ${legRaw}`
      );
    }

    // Validation context: the sample is 2026 data, so the predicted rating
    // should land within a half star of the official 2026 overall (4.0);
    // disaster/EUC uplift is the known un-modeled gap.
    assert.ok(
      h8003.finalRating !== null && Math.abs(h8003.finalRating - 4.0) <= 0.5,
      `H8003 predicted ${h8003.finalRating}, expected near official 4.0`
    );

    // Removal scenarios drop the retired measures from the contract's calc.
    const removal2029 = scenarios.find((scenario) => scenario.id === "removal2029");
    assert.ok(removal2029);
    const h8003Removal = removal2029.contracts.find((c) => c.contractId === "H8003");
    assert.ok(h8003Removal?.qualifiesOverall, "H8003 should still qualify under 2029 removals");
    assert.ok(
      (h8003Removal.withoutQi?.measureCount ?? 0) < (h8003.withoutQi?.measureCount ?? 0),
      "2029 removals should reduce the measure count"
    );

    // Clover-style recalc is a Part C summary and uses the Part C CAI.
    const clover = scenarios.find((scenario) => scenario.id === "cloverRecalc");
    assert.ok(clover);
    assert.equal(clover.caiSource, "part_c");
    const h8003Clover = clover.contracts.find((c) => c.contractId === "H8003");
    assert.ok(h8003Clover?.qualifiesOverall, "H8003 should qualify in the recalc scenario");
    assert.equal(h8003Clover.caiValue, cai.partC["H8003"]);
    for (const measureCode of ["D05", "C28", "C33"]) {
      assert.ok(
        clover.removedCodes.includes(measureCode),
        `${measureCode} should be removed in the recalc scenario`
      );
    }
  }
);
