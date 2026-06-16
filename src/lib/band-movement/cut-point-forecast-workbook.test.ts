import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { parseForecastWorkbook } from "@/lib/cutpoint-forecast/workbook";

function buildWorkbookBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(output);
}

function buildCsvBuffer(rows: unknown[][]): Buffer {
  const csv = rows.map((row) => row.map((cell) => String(cell ?? "")).join(",")).join("\n");
  return Buffer.from(csv, "utf-8");
}

test("parseForecastWorkbook detects the canonical headers and normalizes measure aliases", () => {
  const buffer = buildWorkbookBuffer([
    ["", "", "", "", "", "Total Membership", "", ""],
    [
      "HL Code",
      "Contract",
      "Measure",
      "Year",
      "Month",
      "Rate",
      "Numerator - All",
      "Denominator - All",
    ],
    [],
    ["HL50", "H9999", "Med Adh for Diabetes Meds", 2026, 13, 88.5, 200, 250],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.rowCount, 1);
  assert.equal(parsed.summary.contractCount, 1);
  assert.equal(parsed.summary.latestObservedMonth, 13);
  assert.equal(parsed.rows[0].metricCategory, "Part D");
  assert.equal(
    parsed.rows[0].measureDisplayName.toLowerCase().includes("adherence"),
    true
  );
});

test("parseForecastWorkbook drops rows with a value of 0 (treated as no data)", () => {
  const buffer = buildWorkbookBuffer([
    ["contract_id", "hl_code", "stars_year", "month_num", "measure_value"],
    ["H9999", "HL50", 2027, 6, 0],
    ["H9999", "HL50", 2027, 12, 88.0],
    ["H8888", "HL50", 2027, 12, 0],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  // Only the single non-zero H9999 month-12 row survives.
  assert.equal(parsed.summary.rowCount, 1);
  assert.equal(parsed.summary.contractCount, 1);
  assert.equal(parsed.rows[0].contractId, "H9999");
  assert.equal(parsed.rows[0].rate, 88.0);
  assert.equal(
    parsed.rows.some((row) => row.rate === 0),
    false,
    "no 0-value rows should remain"
  );
});

test("parseForecastWorkbook supports compact CSV format with hl_code-based measure resolution", () => {
  const buffer = buildWorkbookBuffer([
    ["contract_id", "hl_code", "stars_year", "month_num", "measure_value"],
    ["H9999", "HL01", 2027, 6, 75.2],
    ["H9999", "HL01", 2027, 12, 80.1],
    ["H8888", "HL50", 2027, 12, 88.0],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.contractCount, 2);
  assert.equal(parsed.summary.rowCount, 3);
  assert.deepEqual(parsed.summary.years, [2027], "stars_year should be used directly");

  const h9999Row = parsed.rows.find((r) => r.contractId === "H9999" && r.normalizedMonth === 12);
  assert.ok(h9999Row, "Should have a row for H9999 month 12");
  assert.equal(h9999Row?.hlCode, "HL01");
  assert.equal(h9999Row?.rate, 80.1);
  assert.ok(h9999Row?.measureDisplayName.length > 0);
  assert.ok(h9999Row?.measureNormalized.length > 0);
  assert.notEqual(h9999Row?.measureCode, null);

  const pharmacyRow = parsed.rows.find((r) => r.contractId === "H8888");
  assert.ok(pharmacyRow, "Should have a row for H8888");
  assert.equal(pharmacyRow?.metricCategory, "Part D");
});

test("parseForecastWorkbook supports the eq_code format (EQ codes map to the matching HL code)", () => {
  // Same compact layout but using eq_code/cms_code columns. EQ01 maps to HL01.
  const eqBuffer = buildWorkbookBuffer([
    ["contract_code", "month", "stars_year", "eq_code", "cms_code", "measure_set", "numerator", "denominator", "rate"],
    ["H0137", 4, 2028, "EQ01", "C01", "HEDIS", 6329.0, 10926.0, 57.93],
    ["H0137", 5, 2028, "EQ01", "C01", "HEDIS", 6384.0, 10730.0, 59.5],
  ]);
  const eqParsed = parseForecastWorkbook(eqBuffer);

  const eqRow = eqParsed.rows.find((r) => r.normalizedMonth === 5);
  assert.ok(eqRow, "Should parse the EQ-coded row");
  // EQ01 is normalized to HL01 and resolves to the same measure.
  assert.equal(eqRow?.hlCode, "HL01");
  assert.equal(eqRow?.rate, 59.5);
  assert.equal(eqRow?.year, 2028);
  assert.ok(eqRow?.measureDisplayName.length ?? 0 > 0);

  // The resolved measure should match what HL01 resolves to directly.
  const hlBuffer = buildWorkbookBuffer([
    ["contract_id", "hl_code", "stars_year", "month_num", "measure_value"],
    ["H0137", "HL01", 2028, 5, 59.5],
  ]);
  const hlParsed = parseForecastWorkbook(hlBuffer);
  assert.equal(eqRow?.measureNormalized, hlParsed.rows[0]?.measureNormalized);
});

test("parseForecastWorkbook supports compact format with contract_code and measure_id aliases", () => {
  const buffer = buildCsvBuffer([
    ["contract_code", "month", "stars_year", "numerator", "denominator", "rate", "measure_id"],
    ["H9999", 12, 2027, 4780, 6398, 75.0, "HL01"],
    ["H9999", 6, 2027, 4959, 7104, 69.8, "HL01"],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.rowCount, 2);
  assert.equal(parsed.summary.contractCount, 1);
  const row = parsed.rows.find((r) => r.normalizedMonth === 12);
  assert.equal(row?.hlCode, "HL01");
  assert.equal(row?.rate, 75.0);
  assert.equal(row?.year, 2027, "stars_year should be used directly");
});

test("parseForecastWorkbook excludes CAHPS measures from the non-CAHPS import", () => {
  const buffer = buildCsvBuffer([
    ["HL Code", "Contract", "Measure", "Year", "Month", "Rate"],
    ["HL01", "H9999", "Getting Needed Care", 2026, 12, 88],
    ["HL02", "H9999", "Breast Cancer Screening", 2026, 12, 70],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.rowCount, 1, "CAHPS row should be dropped");
  assert.equal(parsed.rows.length, 1);
  assert.equal(
    parsed.rows[0].measureNormalized.includes("breast cancer"),
    true,
    "only the non-CAHPS measure should remain"
  );
});

test("parseForecastWorkbook handles CSV file buffers", () => {
  const buffer = buildCsvBuffer([
    ["contract_id", "hl_code", "stars_year", "month_num", "measure_value"],
    ["H9999", "HL01", 2027, 6, 75.2],
    ["H9999", "HL01", 2027, 12, 80.1],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.contractCount, 1);
  assert.equal(parsed.summary.rowCount, 2);
  assert.equal(parsed.rows[0].contractId, "H9999");
  assert.equal(parsed.rows[0].hlCode, "HL01");
  assert.equal(parsed.rows[0].rate, 75.2);
  assert.equal(parsed.rows[0].year, 2027, "stars_year should be used directly");
});

test("parseForecastWorkbook accepts measure_val as a column alias for measure_value", () => {
  const buffer = buildCsvBuffer([
    ["contract_id", "hl_code", "stars_year", "month_num", "measure_val"],
    ["H9999", "HL01", 2028, 6, 77.3],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.rowCount, 1);
  assert.equal(parsed.rows[0].rate, 77.3);
  assert.equal(parsed.rows[0].year, 2028, "stars_year should be used directly");
});

test("parseForecastWorkbook accepts month_nume as a column alias for month_num", () => {
  const buffer = buildCsvBuffer([
    ["contract_id", "hl_code", "stars_year", "month_nume", "measure_val"],
    ["H9999", "HL01", 2028, 12, 81.4],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.rowCount, 1);
  assert.equal(parsed.rows[0].normalizedMonth, 12);
  assert.equal(parsed.rows[0].rate, 81.4);
  assert.equal(parsed.rows[0].year, 2028, "stars_year should be used directly");
});

test("parseForecastWorkbook accepts HL-code-only headers using Contract, HL Code, Year, Month, Rate", () => {
  const buffer = buildCsvBuffer([
    ["Contract", "HL Code", "Year", "Month", "Rate"],
    ["H3923", "HL50", 2027, 7, 94],
    ["H3344", "HL02", 2026, 12, ""],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.rowCount, 2);
  assert.equal(parsed.summary.contractCount, 2);
  const h3923 = parsed.rows.find((row) => row.contractId === "H3923");
  const h3344 = parsed.rows.find((row) => row.contractId === "H3344");
  assert.equal(h3923?.year, 2027, "Year should be used directly as the stars year");
  assert.equal(h3923?.rate, 94);
  assert.equal(h3344?.rate, null);
});

test("parseForecastWorkbook dedupes repeated contract-measure-period rows", () => {
  const buffer = buildCsvBuffer([
    ["Contract", "HL Code", "Year", "Month", "Rate"],
    ["H3923", "HL50", 2027, 7, ""],
    ["H3923", "HL50", 2027, 7, 94],
    ["H3923", "HL50", 2027, 7, 95],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.rowCount, 1);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].rate, 95);
  assert.equal(parsed.rows[0].year, 2027, "stars_year should be used directly");
});

test("parseForecastWorkbook skips rows not attached to contract-like ids", () => {
  const buffer = buildCsvBuffer([
    ["Contract", "HL Code", "Year", "Month", "Rate"],
    ["Sentara", "HL50", 2027, 7, 94],
    ["Monitoring Physical Activity", "HL06", 2028, 12, 81.4],
    ["H3923", "HL50", 2027, 7, 94],
    ["s8067", "HL02", 2028, 12, 88],
  ]);

  const parsed = parseForecastWorkbook(buffer);

  assert.equal(parsed.summary.rowCount, 2);
  assert.deepEqual(
    parsed.rows.map((row) => row.contractId),
    ["H3923", "S8067"]
  );
});
