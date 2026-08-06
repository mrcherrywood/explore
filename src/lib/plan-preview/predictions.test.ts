import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildPlanPreviewScenarios } from "./final-scores";
import {
  buildPlanPreviewPredictions,
  scoreForCutPointBanding,
  starFromThresholds,
  type AccruedMeasureScore,
} from "./predictions";
import { parsePlanPreviewWorkbook } from "./workbook";
import type { PlanPreviewCaiParseResult, PlanPreviewMeasureParseResult } from "./types";

const MEASURE_PATH = path.join(process.cwd(), "data/2027/SR_2027_FPP/SR_2027_measure_data.xlsx");
const CAI_PATH = path.join(process.cwd(), "data/2027/SR_2027_FPP/SR_2027_cai.xlsx");

function loadAccruedRows(): AccruedMeasureScore[] {
  const parsed = parsePlanPreviewWorkbook(
    readFileSync(MEASURE_PATH)
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
      wholeScore: row.score as number,
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

test("scoreForCutPointBanding uses measure_data whole numbers for non-CAHPS", () => {
  // TRC: HEDIS decimal 70.68 must band like measure_data 71 (4★ cut at 71).
  assert.equal(scoreForCutPointBanding(70.68, 71, false), 71);
  assert.equal(scoreForCutPointBanding(70.68, null, false), 71);
  assert.equal(scoreForCutPointBanding(70.4, 71, false), 71);
  // CAHPS keeps continuous decimals for cut-point / percentile paths.
  assert.equal(scoreForCutPointBanding(86.03890753, 86, true), 86.03890753);
});

test(
  "Transitions of Care bands on whole score when decimal overlay is below the cut",
  { skip: !existsSync(MEASURE_PATH) },
  () => {
    const rows = loadAccruedRows().map((row) =>
      row.measureCode === "C19" && row.contractId === "H0885"
        ? { ...row, score: 70.68, wholeScore: 71 }
        : row
    );
    const result = buildPlanPreviewPredictions(rows, 2027);
    const contract = result.contracts.find((item) => item.contractId === "H0885");
    assert.ok(contract);
    const trc = contract.measures.find((measure) => measure.measureCode === "C19");
    assert.ok(trc);
    assert.equal(trc.score, 70.68, "display score keeps the decimal overlay");
    assert.equal(trc.predictedStar, 4, "cut points use rounded/measure_data 71");
  }
);

test(
  "builds anchored cut point predictions and contract stars from the 2027 PP1 file",
  { skip: !existsSync(MEASURE_PATH) },
  () => {
    const rows = loadAccruedRows();
    assert.ok(rows.length > 30, "expected scored rows from the 2027 file");

    const result = buildPlanPreviewPredictions(rows, 2027);

    assert.equal(result.baselineYear, 2026, "baseline should be the latest published year");
    assert.ok(result.summary.readyCount > 20, `expected most measures ready, got ${result.summary.readyCount}`);

    // S-prefix PDP contracts are excluded from MA predictions.
    assert.ok(result.contracts.every((contract) => /^[HR]/.test(contract.contractId)));

    const breastCancer = result.cutPoints.find((cp) => cp.measureCode === "C01");
    assert.ok(breastCancer, "C01 prediction missing");
    assert.equal(breastCancer.status, "ready");
    // Workbook forecast rows are applied while the clustering model runs alongside.
    assert.equal(breastCancer.source, "workbook_forecast");
    assert.equal(breastCancer.method, "clustering");
    assert.ok(breastCancer.modelThresholds, "model thresholds should still be computed");
    assert.ok(breastCancer.baselineMarketCount > 100, "should anchor to the full published market");
    assert.equal(
      breastCancer.accruedContractCount,
      2,
      "H0885 and H8298 carry C01 in the 2027 file"
    );
    const c01 = Object.fromEntries(
      (breastCancer.thresholds ?? []).map((item) => [item.key, item.projected])
    );
    assert.ok(
      c01.twoStar < c01.threeStar && c01.threeStar < c01.fourStar && c01.fourStar < c01.fiveStar,
      "non-inverted thresholds must ascend"
    );

    // Medication adherence measures resolve by full name in the 2027 file.
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

    // Quality Improvement (C29 in the 2027 layout) is excluded by the methodology.
    const qi = result.cutPoints.find((cp) => cp.measureCode === "C29");
    if (qi) assert.equal(qi.status, "unsupported");

    // CAHPS measures apply the official workbook cut points (no model run).
    // Getting Needed Care is C21 in the 2027 layout.
    const gettingNeededCare = result.cutPoints.find((cp) => cp.measureCode === "C21");
    assert.ok(gettingNeededCare);
    assert.equal(gettingNeededCare.source, "official");
    assert.equal(gettingNeededCare.method, null);
    const c21 = Object.fromEntries(
      (gettingNeededCare.thresholds ?? []).map((item) => [item.key, item.projected])
    );
    // Official SY2027 Getting Needed Care cut points from the 07.2026 workbook.
    assert.deepEqual(c21, { twoStar: 78, threeStar: 80, fourStar: 83, fiveStar: 84 });

    const h0885 = result.contracts.find((contract) => contract.contractId === "H0885");
    assert.ok(h0885, "H0885 contract prediction missing");
    assert.ok(h0885.ratedMeasureCount > 20, `expected most measures rated, got ${h0885.ratedMeasureCount}`);
    assert.ok(
      h0885.weightedMeanStar !== null && h0885.weightedMeanStar >= 1 && h0885.weightedMeanStar <= 5,
      `weighted mean star out of range: ${h0885.weightedMeanStar}`
    );
    for (const measure of h0885.measures) {
      if (measure.predictedStar !== null) {
        assert.ok(Number.isInteger(measure.predictedStar), "measure stars must be whole");
      }
    }
    const withBaselineStar = h0885.measures.filter((m) => m.baselineOfficialStar !== null);
    assert.ok(withBaselineStar.length > 20, "expected baseline official stars for most measures");

    // Stars 2027 weights: Call Center Part D is 2-wt (same as Part C); HOS
    // Improving/Maintaining Physical & Mental Health are 3-wt.
    const callCenterD = h0885.measures.find((m) => m.measureCode === "D01");
    const callCenterC = h0885.measures.find((m) => /call center/i.test(m.displayName) && m.measureCode?.startsWith("C"));
    const physical = h0885.measures.find((m) => m.measureCode === "C04");
    const mental = h0885.measures.find((m) => m.measureCode === "C05");
    assert.ok(callCenterD, "D01 Call Center missing");
    assert.equal(callCenterD.weight, 2, "Part D Call Center should be 2-wt");
    if (callCenterC) assert.equal(callCenterC.weight, 2, "Part C Call Center should be 2-wt");
    assert.ok(physical, "C04 Physical Health missing");
    assert.ok(mental, "C05 Mental Health missing");
    assert.equal(physical.weight, 3, "Improving/Maintaining Physical Health should be 3-wt");
    assert.equal(mental.weight, 3, "Improving/Maintaining Mental Health should be 3-wt");

    const d01Cut = result.cutPoints.find((cp) => cp.measureCode === "D01");
    assert.ok(d01Cut);
    assert.equal(d01Cut.source, "workbook_forecast", "mistitled Part C label must still match Part D cut points");
  }
);

test(
  "computes predicted final scores with recomputed thresholds and uploaded CAI",
  { skip: !existsSync(MEASURE_PATH) || !existsSync(CAI_PATH) },
  () => {
    const rows = loadAccruedRows();
    const predictions = buildPlanPreviewPredictions(rows, 2027);

    const caiParsed = parsePlanPreviewWorkbook(
      readFileSync(CAI_PATH)
    ) as PlanPreviewCaiParseResult;
    const cai = {
      overall: {} as Record<string, number>,
      partC: {} as Record<string, number>,
      partD: {} as Record<string, number>,
    };
    for (const row of caiParsed.rows) {
      if (row.overallCai !== null) cai.overall[row.contractId] = row.overallCai;
      if (row.partCCai !== null) cai.partC[row.contractId] = row.partCCai;
      if (row.partDMapdCai !== null) cai.partD[row.contractId] = row.partDMapdCai;
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

    const h0885 = result.contracts.find((contract) => contract.contractId === "H0885");
    assert.ok(h0885, "H0885 final score missing");
    assert.ok(h0885.qualifiesOverall, `H0885 should qualify: ${h0885.reason}`);
    assert.equal(h0885.caiValue, -0.036054, "CAI should come from the uploaded file");
    assert.ok(h0885.withQi, "with-QI leg should carry forward H0885's 2026 QI stars");
    assert.ok(h0885.withoutQi, "without-QI leg missing");

    // QI is not estimable from PP1 data, so the without-QI leg drives the rating.
    assert.equal(h0885.selectedLeg, "without_qi");
    assert.equal(h0885.finalScoreRaw, h0885.withoutQi.finalScoreRaw);
    assert.equal(
      h0885.finalRating,
      Math.round(Math.min(5, Math.max(1, h0885.withoutQi.finalScoreRaw)) * 2) / 2
    );
    assert.ok(
      h0885.finalRating !== null && h0885.finalRating >= 1 && h0885.finalRating <= 5,
      `final rating out of range: ${h0885.finalRating}`
    );
    assert.ok(
      h0885.partCFinalRating !== null &&
        h0885.partCFinalRating >= 1 &&
        h0885.partCFinalRating <= 5,
      `Part C projection missing/out of range: ${h0885.partCFinalRating}`
    );
    assert.ok(
      h0885.partDFinalRating !== null &&
        h0885.partDFinalRating >= 1 &&
        h0885.partDFinalRating <= 5,
      `Part D projection missing/out of range: ${h0885.partDFinalRating}`
    );

    // Each leg must decompose into clamp(base mean + RF) + CAI.
    for (const leg of [h0885.withQi, h0885.withoutQi]) {
      const legRaw =
        Math.min(5, Math.max(1, leg.baseMean + leg.rewardFactor)) + (h0885.caiValue ?? 0);
      assert.ok(
        Math.abs(leg.finalScoreRaw - legRaw) < 1e-9,
        `leg score should decompose: ${leg.finalScoreRaw} vs ${legRaw}`
      );
    }

    // Removal scenarios drop the retired measures from the contract's calc.
    const removal2029 = scenarios.find((scenario) => scenario.id === "removal2029");
    assert.ok(removal2029);
    const h0885Removal = removal2029.contracts.find((c) => c.contractId === "H0885");
    assert.ok(h0885Removal?.qualifiesOverall, "H0885 should still qualify under 2029 removals");
    assert.ok(
      (h0885Removal.withoutQi?.measureCount ?? 0) < (h0885.withoutQi?.measureCount ?? 0),
      "2029 removals should reduce the measure count"
    );

    // Clover-style recalc is a Part C summary and uses the Part C CAI.
    const clover = scenarios.find((scenario) => scenario.id === "cloverRecalc");
    assert.ok(clover);
    assert.equal(clover.caiSource, "part_c");
    const h0885Clover = clover.contracts.find((c) => c.contractId === "H0885");
    assert.ok(h0885Clover?.qualifiesOverall, "H0885 should qualify in the recalc scenario");
    assert.equal(h0885Clover.caiValue, cai.partC["H0885"]);
    for (const measureCode of ["D05", "C28", "C33"]) {
      assert.ok(
        clover.removedCodes.includes(measureCode),
        `${measureCode} should be removed in the recalc scenario`
      );
    }
  }
);
