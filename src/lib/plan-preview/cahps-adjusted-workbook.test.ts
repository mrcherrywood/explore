import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildPlanPreviewPredictions, type AccruedMeasureScore } from "./predictions";
import { parsePlanPreviewWorkbook } from "./workbook";
import type { PlanPreviewCahpsAdjustedParseResult, PlanPreviewDecimalParseResult } from "./types";

const MCAHPS_FIXTURE_PATH = path.join(
  process.cwd(),
  "data/fixtures/2026_MCAHPS_Final_Output_ENRICHED_sample.xlsx"
);
const CAHPS_DOMAIN_PATH = path.join(process.cwd(), "data/2027/SR_2027_FPP/SR_2027_cahps.xlsx");

test(
  "parses MCAHPS Adjusted_Base_Star workbook and maps VariableName to measures",
  { skip: !existsSync(MCAHPS_FIXTURE_PATH) },
  () => {
    const parsed = parsePlanPreviewWorkbook(
      readFileSync(MCAHPS_FIXTURE_PATH)
    ) as PlanPreviewCahpsAdjustedParseResult;

    assert.equal(parsed.fileType, "cahps_adjusted");
    assert.equal(parsed.sheetName, "Contract Measures");
    assert.equal(parsed.detectedStarsYear, 2027, "ReportingYear 2026 → Stars 2027");
    assert.ok(parsed.rows.length >= 9, `expected fixture rows, got ${parsed.rows.length}`);

    const h0885Gnc = parsed.rows.find(
      (row) => row.contractId === "H0885" && row.measureNormalized === "getting needed care partc"
    );
    assert.ok(h0885Gnc, "H0885 Getting Needed Care missing");
    assert.equal(h0885Gnc.adjustedBaseStar, 4);
    assert.equal(h0885Gnc.unadjustedBaseStar, 5);
    assert.equal(h0885Gnc.variable, "GNC");

    const h0885Cs = parsed.rows.find(
      (row) => row.contractId === "H0885" && row.measureNormalized === "customer service partc"
    );
    assert.ok(h0885Cs);
    assert.equal(h0885Cs.adjustedBaseStar, 2);
  }
);

test(
  "uses plan CAHPS Star Rating for predictions instead of cut-point banding",
  { skip: !existsSync(CAHPS_DOMAIN_PATH) },
  () => {
    const parsed = parsePlanPreviewWorkbook(
      readFileSync(CAHPS_DOMAIN_PATH)
    ) as PlanPreviewDecimalParseResult;
    assert.equal(parsed.fileType, "cahps");

    const h0885C26 = parsed.rows.find(
      (row) => row.contractId === "H0885" && row.measureCode === "C26"
    );
    assert.ok(h0885C26);
    assert.equal(h0885C26.planStar, 3);

    const accrued: AccruedMeasureScore[] = [
      {
        contractId: "H0885",
        contractName: "Test",
        organizationMarketingName: null,
        parentOrganization: null,
        measureCode: "C26",
        measureDisplayName: "Care Coordination",
        measureNormalized: h0885C26.measureNormalized,
        // Score that would band differently under official cuts — plan star must win.
        score: 95,
        planStar: h0885C26.planStar,
      },
      {
        contractId: "H0885",
        contractName: "Test",
        organizationMarketingName: null,
        parentOrganization: null,
        measureCode: "C01",
        measureDisplayName: "Breast Cancer Screening",
        measureNormalized: "breast cancer screening partc",
        score: 80,
      },
    ];

    const result = buildPlanPreviewPredictions(accrued, 2027);
    const contract = result.contracts.find((item) => item.contractId === "H0885");
    assert.ok(contract);
    const careCoord = contract.measures.find((m) => m.measureCode === "C26");
    assert.ok(careCoord);
    assert.equal(careCoord.predictedStar, 3);
    assert.equal(careCoord.starSource, "cahps_plan_file");

    const bcs = contract.measures.find((m) => m.measureCode === "C01");
    assert.ok(bcs);
    assert.notEqual(bcs.starSource, "cahps_plan_file");
    assert.ok(result.summary.cahpsPlanStarCount >= 1);
  }
);

test("falls back to official cut points when plan CAHPS star is missing", () => {
  const accrued: AccruedMeasureScore[] = [
    {
      contractId: "H0885",
      contractName: "Test",
      organizationMarketingName: null,
      parentOrganization: null,
      measureCode: "C21",
      measureDisplayName: "Getting Needed Care",
      measureNormalized: "getting needed care partc",
      score: 83,
      // No planStar — band against official SY2027 CAHPS cuts.
    },
  ];

  const result = buildPlanPreviewPredictions(accrued, 2027);
  const contract = result.contracts.find((item) => item.contractId === "H0885");
  assert.ok(contract);
  const gnc = contract.measures.find((m) => m.measureCode === "C21");
  assert.ok(gnc);
  assert.equal(gnc.starSource, "cut_points");
  assert.ok(gnc.predictedStar !== null);
  assert.equal(result.summary.cahpsPlanStarCount, 0);
});
