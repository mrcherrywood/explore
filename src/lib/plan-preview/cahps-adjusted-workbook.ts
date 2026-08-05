import * as XLSX from "xlsx";

import { resolveMeasure } from "@/lib/cutpoint-forecast/workbook";

import { alignNormalizedPartToCode } from "./measure-resolve";
import type { PlanPreviewCahpsAdjustedParseResult, ParsedPlanPreviewCahpsAdjustedStar } from "./types";

const CONTRACT_ID_PATTERN = /^[HRS]\d{4}$/;

function cleanCell(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseContractId(value: unknown): string | null {
  const cleaned = cleanCell(value).toUpperCase();
  return CONTRACT_ID_PATTERN.test(cleaned) ? cleaned : null;
}

function parseNullableText(value: unknown): string | null {
  const cleaned = cleanCell(value);
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
  return cleaned;
}

function parseNumber(value: unknown): number | null {
  const cleaned = cleanCell(value).replace(/[%,$]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStar(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function headerIndex(headerCells: string[], ...names: string[]): number {
  for (const name of names) {
    const index = headerCells.indexOf(name);
    if (index >= 0) return index;
  }
  return -1;
}

/** True when the sheet carries MCAHPS Adjusted_Base_Star columns. */
export function isCahpsAdjustedSheet(headerCells: string[]): boolean {
  const headers = new Set(headerCells.map((cell) => cell.toLowerCase()));
  return (
    headers.has("adjusted_base_star") &&
    (headers.has("contractnumber") || headers.has("contract number")) &&
    (headers.has("variablename") || headers.has("variable name"))
  );
}

function detectStarsYearFromReportingYear(rows: unknown[][], headerRowIndex: number): number | null {
  const headerCells = rows[headerRowIndex].map((cell) => cleanCell(cell).toLowerCase());
  const reportingCol = headerIndex(headerCells, "reportingyear", "reporting year");
  if (reportingCol < 0) return null;
  for (let rowIndex = headerRowIndex + 1; rowIndex < Math.min(rows.length, headerRowIndex + 20); rowIndex += 1) {
    const year = parseNumber(rows[rowIndex]?.[reportingCol]);
    if (year !== null && year >= 2015 && year <= 2100) {
      // CAHPS reporting year + 1 = Stars year.
      return Math.round(year) + 1;
    }
  }
  return null;
}

export function parseCahpsAdjustedSheet(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number
): PlanPreviewCahpsAdjustedParseResult {
  const headerCells = rows[headerRowIndex].map((cell) => cleanCell(cell).toLowerCase());
  const contractCol = headerIndex(headerCells, "contractnumber", "contract number");
  const variableNameCol = headerIndex(headerCells, "variablename", "variable name");
  const adjustedCol = headerIndex(headerCells, "adjusted_base_star");
  if (contractCol < 0 || variableNameCol < 0 || adjustedCol < 0) {
    throw new Error("CAHPS adjusted file is missing ContractNumber, VariableName, or Adjusted_Base_Star.");
  }

  const marketingCol = headerIndex(headerCells, "marketingname", "marketing name");
  const parentCol = headerIndex(headerCells, "parentorg", "parent org", "parent organization");
  const variableCol = headerIndex(headerCells, "variable");
  const unadjustedCol = headerIndex(headerCells, "unadjusted_base_star");
  const finalCol = headerIndex(headerCells, "adjusted_final_star");
  const caseMixCol = headerIndex(headerCells, "case_mix_adjustment");
  const reliabilityCol = headerIndex(headerCells, "plan_reliability");
  const significanceCol = headerIndex(headerCells, "plan_significance");

  const parsedRows: ParsedPlanPreviewCahpsAdjustedStar[] = [];
  const contractIds = new Set<string>();
  const measures = new Set<string>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const contractId = parseContractId(row?.[contractCol]);
    if (!contractId) continue;

    const variableName = cleanCell(row?.[variableNameCol]);
    if (!variableName) continue;

    const adjustedBaseStar = parseStar(row?.[adjustedCol]);
    if (adjustedBaseStar === null) continue;

    const resolved = resolveMeasure(variableName);
    if (!resolved.measureCode) {
      throw new Error(
        `Could not resolve CAHPS measure "${variableName}" on row ${rowIndex + 1} to a Star Ratings measure.`
      );
    }

    const measureCode = resolved.measureCode.toUpperCase();
    const measureNormalized = alignNormalizedPartToCode(resolved.normalizedName, measureCode);

    parsedRows.push({
      sourceRowNumber: rowIndex + 1,
      contractId,
      organizationMarketingName: marketingCol >= 0 ? parseNullableText(row?.[marketingCol]) : null,
      parentOrganization: parentCol >= 0 ? parseNullableText(row?.[parentCol]) : null,
      variable: variableCol >= 0 ? parseNullableText(row?.[variableCol]) : null,
      variableName,
      measureCode,
      measureDisplayName: resolved.displayName,
      measureNormalized,
      adjustedBaseStar,
      unadjustedBaseStar: unadjustedCol >= 0 ? parseStar(row?.[unadjustedCol]) : null,
      adjustedFinalStar: finalCol >= 0 ? parseStar(row?.[finalCol]) : null,
      caseMixAdjustment: caseMixCol >= 0 ? parseNumber(row?.[caseMixCol]) : null,
      planReliability: reliabilityCol >= 0 ? parseNullableText(row?.[reliabilityCol]) : null,
      planSignificance: significanceCol >= 0 ? parseNullableText(row?.[significanceCol]) : null,
    });
    contractIds.add(contractId);
    measures.add(measureNormalized);
  }

  return {
    fileType: "cahps_adjusted",
    sheetName,
    detectedStarsYear: detectStarsYearFromReportingYear(rows, headerRowIndex),
    rows: parsedRows,
    summary: {
      rowCount: parsedRows.length,
      contractCount: contractIds.size,
      measureCount: measures.size,
    },
  };
}

/** Find and parse the MCAHPS Contract Measures sheet from a workbook buffer. */
export function parseCahpsAdjustedWorkbook(buffer: Buffer): PlanPreviewCahpsAdjustedParseResult | null {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const preferred = ["Contract Measures", ...workbook.SheetNames];
  const seen = new Set<string>();

  for (const sheetName of preferred) {
    if (!sheetName || seen.has(sheetName) || !workbook.Sheets[sheetName]) continue;
    seen.add(sheetName);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      blankrows: false,
    });
    if (rows.length === 0) continue;
    const headerRowIndex = rows.findIndex((row) =>
      row.some((cell) => cleanCell(cell).toLowerCase() === "adjusted_base_star")
    );
    if (headerRowIndex < 0) continue;
    const headerCells = rows[headerRowIndex].map((cell) => cleanCell(cell));
    if (!isCahpsAdjustedSheet(headerCells)) continue;
    return parseCahpsAdjustedSheet(rows, sheetName, headerRowIndex);
  }

  return null;
}
