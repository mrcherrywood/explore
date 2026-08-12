import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import * as XLSX from "xlsx";

import { getMeasureByNormalizedName } from "@/lib/band-movement/analysis";
import { isCahpsMeasure } from "@/lib/band-movement/cut-point-methodology";

import {
  buildMeasureDataExportWorkbook,
  formatExportCellValue,
} from "./export-workbook";
import { resolveCahpsDomainMeasureName } from "./domain-workbooks";
import type {
  PlanPreviewDecimalParseResult,
  PlanPreviewExportRow,
  PlanPreviewMeasureParseResult,
} from "./types";
import { parsePlanPreviewWorkbook } from "./workbook";

const FPP_DIR = path.join(process.cwd(), "data/2027/SR_2027_FPP");
const CAHPS_PATH = path.join(FPP_DIR, "SR_2027_cahps.xlsx");
const HEDIS_PATH = path.join(FPP_DIR, "SR_2027_hedis.xlsx");
const SNP_CM_PATH = path.join(FPP_DIR, "SR_2027_snp_cm.xlsx");
const MEASURE_PATH = path.join(FPP_DIR, "SR_2027_measure_data.xlsx");
const APPEALS_PATH = path.join(FPP_DIR, "SR_2027_appeals_c.xlsx");
const CTM_PATH = path.join(FPP_DIR, "SR_2027_ctm.xlsx");
const CTM_SUMMARY_PATH = path.join(FPP_DIR, "SR_2027_ctm_summary.xlsx");
const DISENROLL_PATH = path.join(FPP_DIR, "SR_2027_disenroll.xlsx");
const MD_PATH = path.join(FPP_DIR, "SR_2027_md.xlsx");

const hasFpp = existsSync(CAHPS_PATH) && existsSync(HEDIS_PATH) && existsSync(SNP_CM_PATH);

test("resolveCahpsDomainMeasureName maps HPMS VariableNames to Star measure names", () => {
  assert.equal(resolveCahpsDomainMeasureName("gnc_comp"), "Getting Needed Care");
  assert.equal(resolveCahpsDomainMeasureName("GCQ_COMP"), "Getting Appointments and Care Quickly");
  assert.equal(resolveCahpsDomainMeasureName("cs_comp"), "Customer Service");
  assert.equal(resolveCahpsDomainMeasureName("coc_comp"), "Care Coordination");
  assert.equal(resolveCahpsDomainMeasureName("rate_care"), "Rating of Health Care Quality");
  assert.equal(resolveCahpsDomainMeasureName("rate_plan"), "Rating of Health Plan");
  assert.equal(resolveCahpsDomainMeasureName("mapd_rate_pdp"), "Rating of Drug Plan");
  assert.equal(resolveCahpsDomainMeasureName("pdp_rate_pdp"), "Rating of Drug Plan");
  assert.equal(
    resolveCahpsDomainMeasureName("mapd_gneeded_comp"),
    "Getting Needed Prescription Drugs"
  );
  assert.equal(resolveCahpsDomainMeasureName("im_flu1last"), "Annual Flu Vaccine");
  assert.equal(resolveCahpsDomainMeasureName("Getting Needed Care"), "Getting Needed Care");
});

test(
  "parses CAHPS domain Scaled Mean decimals",
  { skip: !existsSync(CAHPS_PATH) },
  () => {
    const parsed = parsePlanPreviewWorkbook(readFileSync(CAHPS_PATH));
    assert.equal(parsed.fileType, "cahps");
    const result = parsed as PlanPreviewDecimalParseResult;

    assert.equal(result.detectedStarsYear, 2027);
    assert.ok(result.summary.contractCount >= 2);
    assert.ok(result.summary.measureCount >= 8);

    const h0885C26 = result.rows.find(
      (row) => row.contractId === "H0885" && row.measureCode === "C26"
    );
    assert.ok(h0885C26);
    assert.ok(Math.abs(h0885C26.decimalScore - 86.03890753) < 1e-6);
    assert.equal(h0885C26.decimalSource, "cahps");
    assert.equal(h0885C26.planStar, 3);
    assert.equal(h0885C26.measureDisplayName, "Care Coordination");
    assert.match(h0885C26.measureNormalized, /care coordination/);
    assert.ok(getMeasureByNormalizedName(h0885C26.measureNormalized));
    assert.equal(isCahpsMeasure(h0885C26.measureDisplayName), true);

    const h0885C03 = result.rows.find(
      (row) => row.contractId === "H0885" && row.measureCode === "C03"
    );
    assert.ok(h0885C03);
    assert.ok(Math.abs(h0885C03.decimalScore - 65.024001888) < 1e-6);
    assert.equal(h0885C03.planStar, 3);
    assert.equal(h0885C03.measureDisplayName, "Annual Flu Vaccine");

    const h0885C24 = result.rows.find(
      (row) => row.contractId === "H0885" && row.measureCode === "C24"
    );
    assert.ok(h0885C24);
    assert.equal(h0885C24.planStar, 4, "Star Rating (not Base Group) for Rating of Health Care Quality");
    assert.equal(h0885C24.baseGroupStar, 5, "Base Group before adjustment for Rating of Health Care Quality");

    const s5993D05 = result.rows.find(
      (row) => row.contractId === "S5993" && row.measureCode === "D05"
    );
    assert.ok(s5993D05);
    assert.ok(Math.abs(s5993D05.decimalScore - 78.887461295) < 1e-6);
    assert.equal(s5993D05.measureDisplayName, "Rating of Drug Plan");

    // Every CAHPS VariableName in the FPP file must land in the published universe.
    const byMeasure = new Map(result.rows.map((row) => [row.measureNormalized, row]));
    for (const row of byMeasure.values()) {
      assert.ok(
        getMeasureByNormalizedName(row.measureNormalized),
        `${row.measureCode} (${row.measureDisplayName}) should match the published measure universe`
      );
      assert.equal(
        isCahpsMeasure(row.measureDisplayName),
        true,
        `${row.measureDisplayName} should be recognized as CAHPS`
      );
      assert.doesNotMatch(row.measureDisplayName, /_/);
    }
  }
);

test(
  "parses HEDIS domain rates and averages Transitions of Care components",
  { skip: !existsSync(HEDIS_PATH) },
  () => {
    const parsed = parsePlanPreviewWorkbook(readFileSync(HEDIS_PATH));
    assert.equal(parsed.fileType, "hedis");
    const result = parsed as PlanPreviewDecimalParseResult;

    assert.equal(result.detectedStarsYear, 2027);

    const h0885C19 = result.rows.find(
      (row) => row.contractId === "H0885" && row.measureCode === "C19"
    );
    assert.ok(h0885C19);
    // (92.94 + 50.85 + 41.36 + 97.57) / 4 = 70.68
    assert.ok(Math.abs(h0885C19.decimalScore - 70.68) < 1e-6);

    const h8298C08 = result.rows.find(
      (row) => row.contractId === "H8298" && row.measureCode === "C08"
    );
    assert.ok(h8298C08);
    assert.equal(h8298C08.decimalScore, 92);

    // C17 rows have empty Rate — skipped
    assert.equal(
      result.rows.some((row) => row.measureCode === "C17"),
      false,
      "Plan All-Cause Readmissions should be skipped when Rate is empty"
    );
  }
);

test(
  "parses SNP Care Management percent as C07 decimal",
  { skip: !existsSync(SNP_CM_PATH) },
  () => {
    const parsed = parsePlanPreviewWorkbook(readFileSync(SNP_CM_PATH));
    assert.equal(parsed.fileType, "snp_cm");
    const result = parsed as PlanPreviewDecimalParseResult;

    assert.equal(result.summary.contractCount, 1);
    assert.equal(result.summary.measureCount, 1);

    const row = result.rows[0];
    assert.equal(row.contractId, "H8298");
    assert.equal(row.measureCode, "C07");
    assert.ok(Math.abs(row.decimalScore - 88.435507) < 1e-6);
    assert.equal(row.decimalSource, "snp_cm");
  }
);

function assertRejects(filePath: string, pattern: RegExp) {
  assert.throws(() => parsePlanPreviewWorkbook(readFileSync(filePath)), pattern);
}

test("rejects unsupported domain files with clear errors", { skip: !hasFpp }, () => {
  assertRejects(APPEALS_PATH, /Appeals detail files are not supported/i);
  assertRejects(CTM_PATH, /CTM detail files are not supported/i);
  assertRejects(CTM_SUMMARY_PATH, /CTM summary files are not supported/i);
  assertRejects(DISENROLL_PATH, /Disenrollment files are not supported/i);
  assertRejects(MD_PATH, /Disaster/i);
});

test("formatExportCellValue preserves percent style and plain numbers", () => {
  assert.equal(
    formatExportCellValue({
      contractId: "H0885",
      organizationMarketingName: null,
      contractName: null,
      parentOrganization: null,
      measureCode: "C01",
      measureDisplayName: "Breast Cancer Screening",
      rawValue: "76%",
      score: 76,
      status: "scored",
      decimalScore: 76.34,
      decimalSource: "hedis",
    }),
    "76.34%"
  );

  assert.equal(
    formatExportCellValue({
      contractId: "H0885",
      organizationMarketingName: null,
      contractName: null,
      parentOrganization: null,
      measureCode: "C26",
      measureDisplayName: "Care Coordination",
      rawValue: "86",
      score: 86,
      status: "scored",
      decimalScore: 86.03890753,
      decimalSource: "cahps",
    }),
    "86.03890753"
  );

  assert.equal(
    formatExportCellValue({
      contractId: "H0885",
      organizationMarketingName: null,
      contractName: null,
      parentOrganization: null,
      measureCode: "C01",
      measureDisplayName: "Breast Cancer Screening",
      rawValue: "Plan not required to report measure",
      score: null,
      status: "not_required",
      decimalScore: null,
      decimalSource: null,
    }),
    "Plan not required to report measure"
  );
});

test(
  "export workbook replaces decimals and round-trips through the measure_data parser",
  { skip: !hasFpp || !existsSync(MEASURE_PATH) },
  () => {
    const measure = parsePlanPreviewWorkbook(readFileSync(MEASURE_PATH)) as PlanPreviewMeasureParseResult;
    const cahps = parsePlanPreviewWorkbook(readFileSync(CAHPS_PATH)) as PlanPreviewDecimalParseResult;
    const hedis = parsePlanPreviewWorkbook(readFileSync(HEDIS_PATH)) as PlanPreviewDecimalParseResult;
    const snp = parsePlanPreviewWorkbook(readFileSync(SNP_CM_PATH)) as PlanPreviewDecimalParseResult;

    const decimalByKey = new Map<string, number>();
    for (const row of [...cahps.rows, ...hedis.rows, ...snp.rows]) {
      decimalByKey.set(`${row.contractId}|${row.measureCode}`, row.decimalScore);
    }

    const exportRows: PlanPreviewExportRow[] = measure.rows.map((row) => ({
      contractId: row.contractId,
      organizationMarketingName: row.organizationMarketingName,
      contractName: row.contractName,
      parentOrganization: row.parentOrganization,
      measureCode: row.measureCode,
      measureDisplayName: row.measureDisplayName,
      rawValue: row.rawValue,
      score: row.score,
      status: row.status,
      decimalScore: decimalByKey.get(`${row.contractId}|${row.measureCode}`) ?? null,
      decimalSource: decimalByKey.has(`${row.contractId}|${row.measureCode}`) ? "cahps" : null,
    }));

    const buffer = buildMeasureDataExportWorkbook(2027, exportRows);
    const reparsed = parsePlanPreviewWorkbook(buffer);
    assert.equal(reparsed.fileType, "measure_data");
    const result = reparsed as PlanPreviewMeasureParseResult;

    const h0885C26 = result.rows.find(
      (row) => row.contractId === "H0885" && row.measureCode === "C26"
    );
    assert.ok(h0885C26);
    assert.ok(Math.abs((h0885C26.score ?? 0) - 86.03890753) < 1e-6);

    const h0885C19 = result.rows.find(
      (row) => row.contractId === "H0885" && row.measureCode === "C19"
    );
    assert.ok(h0885C19);
    assert.ok(Math.abs((h0885C19.score ?? 0) - 70.68) < 1e-6);
    assert.ok(h0885C19.rawValue.includes("%"));

    const h8298C07 = result.rows.find(
      (row) => row.contractId === "H8298" && row.measureCode === "C07"
    );
    assert.ok(h8298C07);
    assert.ok(Math.abs((h8298C07.score ?? 0) - 88.435507) < 1e-6);

    // Whole-number fallback preserved when no decimal overlay
    const h0885C01 = result.rows.find(
      (row) => row.contractId === "H0885" && row.measureCode === "C01"
    );
    assert.equal(h0885C01?.score, 76);

    // Sentinel statuses pass through
    const s5993C01 = result.rows.find(
      (row) => row.contractId === "S5993" && row.measureCode === "C01"
    );
    assert.equal(s5993C01?.status, "not_required");

    // Title row present in exported workbook
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });
    assert.match(String(rows[0][0]), /CY 2027 Star Ratings/);
  }
);
