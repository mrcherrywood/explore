import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildPlanPreviewPredictions, type AccruedMeasureScore } from "./predictions";
import { parsePlanPreviewWorkbook } from "./workbook";
import type { PlanPreviewCahpsAdjustedParseResult } from "./types";

const FIXTURE_PATH = path.join(
  process.cwd(),
  "data/fixtures/2026_MCAHPS_Final_Output_ENRICHED_sample.xlsx"
);

test(
  "parses MCAHPS Adjusted_Base_Star workbook and maps VariableName to measures",
  { skip: !existsSync(FIXTURE_PATH) },
  () => {
    const parsed = parsePlanPreviewWorkbook(
      readFileSync(FIXTURE_PATH)
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
  "overlays adjusted base stars onto CAHPS contract predictions",
  { skip: !existsSync(FIXTURE_PATH) },
  () => {
    const parsed = parsePlanPreviewWorkbook(
      readFileSync(FIXTURE_PATH)
    ) as PlanPreviewCahpsAdjustedParseResult;

    const accrued: AccruedMeasureScore[] = [
      {
        contractId: "H0885",
        contractName: "Test",
        organizationMarketingName: null,
        parentOrganization: null,
        measureCode: "C21",
        measureDisplayName: "Getting Needed Care",
        measureNormalized: "getting needed care partc",
        // Score that would band to 5★ under typical high cut points — overlay must win.
        score: 95,
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

    const result = buildPlanPreviewPredictions(accrued, 2027, {
      cahpsAdjustedStars: parsed.rows.map((row) => ({
        contractId: row.contractId,
        measureNormalized: row.measureNormalized,
        adjustedBaseStar: row.adjustedBaseStar,
      })),
    });

    const contract = result.contracts.find((item) => item.contractId === "H0885");
    assert.ok(contract);
    const gnc = contract.measures.find((m) => m.measureCode === "C21");
    assert.ok(gnc);
    assert.equal(gnc.predictedStar, 4);
    assert.equal(gnc.starSource, "cahps_case_mix_reliability");

    const bcs = contract.measures.find((m) => m.measureCode === "C01");
    assert.ok(bcs);
    assert.notEqual(bcs.starSource, "cahps_case_mix_reliability");
    assert.ok(result.summary.cahpsAdjustedStarCount >= 1);
  }
);
