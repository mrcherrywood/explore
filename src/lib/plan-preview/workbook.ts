import * as XLSX from "xlsx";

import { parseCahpsAdjustedWorkbook } from "./cahps-adjusted-workbook";
import {
  detectDomainFileKind,
  parseDomainWorkbook,
  rejectUnsupportedDomainFile,
} from "./domain-workbooks";
import { resolveMeasureForPlanPreview } from "./measure-resolve";
import type {
  ParsedPlanPreviewCaiRow,
  ParsedPlanPreviewMeasureScore,
  PlanPreviewCaiParseResult,
  PlanPreviewMeasureParseResult,
  PlanPreviewMeasureStatus,
  PlanPreviewParseResult,
} from "./types";

export { resolveMeasureForPlanPreview } from "./measure-resolve";

const CONTRACT_ID_PATTERN = /^[HRS]\d{4}$/;
const MEASURE_HEADER_PATTERN = /^([CD]\d{2}):\s*(.+)$/;
const STARS_YEAR_PATTERN = /CY\s*(\d{4})\s*Star Ratings/i;

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

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[%,$]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** CMS data-integrity message in place of a PP1 score — assigned 1 star. */
export function isCmsDataIssueValue(rawValue: string): boolean {
  return rawValue.toLowerCase().includes("cms identified issues");
}

export function classifyMeasureValue(rawValue: string): {
  score: number | null;
  status: PlanPreviewMeasureStatus;
} {
  const lowered = rawValue.toLowerCase();
  if (lowered.startsWith("plan not required")) return { score: null, status: "not_required" };
  if (lowered.startsWith("not applicable")) return { score: null, status: "not_applicable" };
  if (lowered.startsWith("not enough data") || lowered.includes("no data available")) {
    return { score: null, status: "insufficient_data" };
  }
  if (isCmsDataIssueValue(rawValue)) return { score: null, status: "cms_data_issue" };
  const score = parseNumber(rawValue);
  if (score !== null) return { score, status: "scored" };
  return { score: null, status: "other" };
}

function parseNullableText(value: unknown): string | null {
  const cleaned = cleanCell(value);
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
  return cleaned;
}

function parseYesNo(value: unknown): boolean | null {
  const cleaned = cleanCell(value).toLowerCase();
  if (cleaned === "yes") return true;
  if (cleaned === "no") return false;
  return null;
}

function parseNullableNumberCell(value: unknown): number | null {
  const cleaned = cleanCell(value);
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
  return parseNumber(cleaned);
}

function detectStarsYear(rows: unknown[][]): number | null {
  for (const row of rows.slice(0, 6)) {
    for (const cell of row) {
      const match = STARS_YEAR_PATTERN.exec(cleanCell(cell));
      if (match) return Number(match[1]);
    }
  }
  return null;
}

function findContractHeaderRow(rows: unknown[][]): number {
  for (let index = 0; index < Math.min(rows.length, 12); index += 1) {
    if (cleanCell(rows[index][0]).toLowerCase() === "contract number") return index;
  }
  throw new Error(
    'Could not find the "Contract Number" header row. Expected a CMS plan preview master table export (measure data or CAI).'
  );
}

function inferMetricCategory(measureCode: string): "Part C" | "Part D" | "Other" {
  if (measureCode.startsWith("C")) return "Part C";
  if (measureCode.startsWith("D")) return "Part D";
  return "Other";
}

type MeasureColumn = {
  columnIndex: number;
  measureCode: string;
  measureName: string;
  measureDisplayName: string;
  measureNormalized: string;
  metricCategory: "Part C" | "Part D" | "Other";
};

function buildMeasureColumns(measureHeaderRow: unknown[]): MeasureColumn[] {
  const columns: MeasureColumn[] = [];
  for (let columnIndex = 0; columnIndex < measureHeaderRow.length; columnIndex += 1) {
    const match = MEASURE_HEADER_PATTERN.exec(cleanCell(measureHeaderRow[columnIndex]));
    if (!match) continue;
    const measureCode = match[1].toUpperCase();
    const measureName = match[2];
    const resolved = resolveMeasureForPlanPreview(measureCode, measureName);
    columns.push({
      columnIndex,
      measureCode,
      measureName,
      measureDisplayName: resolved.displayName,
      measureNormalized: resolved.normalizedName,
      // The file's own code prefix is authoritative for Part C/D, not the
      // fuzzy-matched measure's latest-year code (codes shift between years).
      metricCategory: inferMetricCategory(measureCode),
    });
  }
  return columns;
}

function parseMeasureWorkbook(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number
): PlanPreviewMeasureParseResult {
  const measureColumns = buildMeasureColumns(rows[headerRowIndex + 1] ?? []);
  if (measureColumns.length === 0) {
    throw new Error(
      "Found the contract header row but no measure columns (e.g. \"C01: Breast Cancer Screening\") beneath it."
    );
  }

  const parsedRows: ParsedPlanPreviewMeasureScore[] = [];
  const contractIds = new Set<string>();
  const measureCodes = new Set<string>();
  let scoredCount = 0;

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const contractId = parseContractId(row[0]);
    if (!contractId) continue;

    const organizationMarketingName = parseNullableText(row[1]);
    const contractName = parseNullableText(row[2]);
    const parentOrganization = parseNullableText(row[3]);

    for (const column of measureColumns) {
      const rawValue = cleanCell(row[column.columnIndex]);
      if (!rawValue) continue;

      const { score, status } = classifyMeasureValue(rawValue);
      if (status === "scored") scoredCount += 1;

      parsedRows.push({
        sourceRowNumber: rowIndex + 1,
        contractId,
        organizationMarketingName,
        contractName,
        parentOrganization,
        measureCode: column.measureCode,
        measureName: column.measureName,
        measureDisplayName: column.measureDisplayName,
        measureNormalized: column.measureNormalized,
        metricCategory: column.metricCategory,
        rawValue,
        score,
        status,
      });
      measureCodes.add(column.measureCode);
    }

    contractIds.add(contractId);
  }

  return {
    fileType: "measure_data",
    sheetName,
    detectedStarsYear: detectStarsYear(rows),
    rows: parsedRows,
    summary: {
      rowCount: parsedRows.length,
      contractCount: contractIds.size,
      measureCount: measureCodes.size,
      scoredCount,
    },
  };
}

const CAI_HEADER_FIELDS: Array<[string, keyof Omit<ParsedPlanPreviewCaiRow, "sourceRowNumber">]> = [
  ["organization marketing name", "organizationMarketingName"],
  ["contract name", "contractName"],
  ["parent organization", "parentOrganization"],
  ["puerto rico only", "puertoRicoOnly"],
  ["contract type", "contractType"],
  ["part d offered", "partDOffered"],
  ["enrolled", "enrolled"],
  ["num lis/de", "numLisDe"],
  ["num disabled", "numDisabled"],
  ["% lis/de", "pctLisDe"],
  ["% disabled", "pctDisabled"],
  ["part c lis/de initial group", "partCLisDeGroup"],
  ["part c disabled quintile", "partCDisabledQuintile"],
  ["part c fac", "partCFac"],
  ["part c cai value", "partCCai"],
  ["part d ma-pd lis/de initial group", "partDMapdLisDeGroup"],
  ["part d ma-pd disabled quintile", "partDMapdDisabledQuintile"],
  ["part d ma-pd fac", "partDMapdFac"],
  ["part d ma-pd cai value", "partDMapdCai"],
  ["part d pdp lis/de quartile", "partDPdpLisDeQuartile"],
  ["part d pdp disabled quartile", "partDPdpDisabledQuartile"],
  ["part d pdp fac", "partDPdpFac"],
  ["part d pdp cai value", "partDPdpCai"],
  ["overall lis/de initial group", "overallLisDeGroup"],
  ["overall disabled quintile", "overallDisabledQuintile"],
  ["overall fac", "overallFac"],
  ["overall cai value", "overallCai"],
];

const CAI_BOOLEAN_FIELDS = new Set(["puertoRicoOnly", "partDOffered"]);
const CAI_NUMERIC_FIELDS = new Set([
  "enrolled",
  "numLisDe",
  "numDisabled",
  "pctLisDe",
  "pctDisabled",
  "partCCai",
  "partDMapdCai",
  "partDPdpCai",
  "overallCai",
]);

function parseCaiWorkbook(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number
): PlanPreviewCaiParseResult {
  const headerRow = rows[headerRowIndex].map((cell) => cleanCell(cell).toLowerCase());
  const columnIndexByField = new Map<string, number>();
  for (const [header, field] of CAI_HEADER_FIELDS) {
    const index = headerRow.indexOf(header);
    if (index >= 0) columnIndexByField.set(field, index);
  }

  const parsedRows: ParsedPlanPreviewCaiRow[] = [];
  const contractIds = new Set<string>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const contractId = parseContractId(row[0]);
    if (!contractId) continue;

    const parsed = { sourceRowNumber: rowIndex + 1, contractId } as ParsedPlanPreviewCaiRow;
    for (const [, field] of CAI_HEADER_FIELDS) {
      const columnIndex = columnIndexByField.get(field);
      const cell = columnIndex === undefined ? null : row[columnIndex];
      const record = parsed as unknown as Record<string, unknown>;
      if (CAI_BOOLEAN_FIELDS.has(field)) {
        record[field] = parseYesNo(cell);
      } else if (CAI_NUMERIC_FIELDS.has(field)) {
        record[field] = parseNullableNumberCell(cell);
      } else {
        record[field] = parseNullableText(cell);
      }
    }

    parsedRows.push(parsed);
    contractIds.add(contractId);
  }

  return {
    fileType: "cai",
    sheetName,
    detectedStarsYear: detectStarsYear(rows),
    rows: parsedRows,
    summary: {
      rowCount: parsedRows.length,
      contractCount: contractIds.size,
    },
  };
}

export function parsePlanPreviewWorkbook(buffer: Buffer): PlanPreviewParseResult {
  const cahpsAdjusted = parseCahpsAdjustedWorkbook(buffer);
  if (cahpsAdjusted) return cahpsAdjusted;

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("File is empty or could not be parsed.");
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const headerRowIndex = findContractHeaderRow(rows);
  const headerCells = rows[headerRowIndex].map((cell) => cleanCell(cell).toLowerCase());

  const domainKind = detectDomainFileKind(headerCells);
  if (domainKind === "unsupported") {
    rejectUnsupportedDomainFile(headerCells);
  }
  if (domainKind === "cahps" || domainKind === "hedis" || domainKind === "snp_cm") {
    return parseDomainWorkbook(rows, sheetName, headerRowIndex, domainKind);
  }

  const isCaiFile = headerCells.some(
    (cell) => cell === "overall cai value" || cell === "part c fac"
  );

  return isCaiFile
    ? parseCaiWorkbook(rows, sheetName, headerRowIndex)
    : parseMeasureWorkbook(rows, sheetName, headerRowIndex);
}
