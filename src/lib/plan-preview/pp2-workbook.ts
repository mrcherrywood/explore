import { resolveMeasureForPlanPreview } from "./measure-resolve";
import type {
  ParsedPlanPreviewImprovement,
  ParsedPlanPreviewOfficialStar,
  ParsedPlanPreviewOfficialSummary,
  PlanPreviewImprovementParseResult,
  PlanPreviewOfficialRatingType,
  PlanPreviewOfficialStarParseResult,
  PlanPreviewOfficialStarStatus,
  PlanPreviewOfficialSummaryParseResult,
} from "./types";

const CONTRACT_ID_PATTERN = /^[HRS]\d{4}$/;
const MEASURE_HEADER_PATTERN = /^([CD]\d{2}):\s*(.+)$/;
const STARS_YEAR_PATTERN = /CY\s*(\d{4})\s*Star Ratings/i;
const DISASTER_HEADER_PATTERN = /major disaster percentage\s+(\d{4})/i;

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

function parseNullableText(value: unknown): string | null {
  const cleaned = cleanCell(value);
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
  return cleaned;
}

function inferMetricCategory(measureCode: string): "Part C" | "Part D" | "Other" {
  if (measureCode.startsWith("C")) return "Part C";
  if (measureCode.startsWith("D")) return "Part D";
  return "Other";
}

export function detectPlanPreviewStarsYear(rows: unknown[][]): number | null {
  for (const row of rows.slice(0, 6)) {
    for (const cell of row) {
      const match = STARS_YEAR_PATTERN.exec(cleanCell(cell));
      if (match) return Number(match[1]);
    }
  }
  return null;
}

export function classifyOfficialStarValue(rawValue: string): {
  star: number | null;
  status: PlanPreviewOfficialStarStatus;
} {
  const lowered = rawValue.toLowerCase();
  if (lowered.includes("plan too small")) return { star: null, status: "too_small" };
  if (lowered.startsWith("plan not required")) return { star: null, status: "not_required" };
  if (lowered.startsWith("not applicable")) return { star: null, status: "not_applicable" };
  if (lowered.startsWith("not enough data") || lowered.includes("no data available")) {
    return { star: null, status: "insufficient_data" };
  }
  if (lowered.includes("cms identified issues")) return { star: null, status: "cms_data_issue" };
  // Official measure stars are bare 1–5. Reject rates ("5%", "95") so a
  // mis-routed measure_data file cannot mint fake stars.
  if (/^\s*[1-5](\.0+)?\s*$/.test(rawValue)) {
    return { star: Number(rawValue), status: "scored" };
  }
  return { star: null, status: "other" };
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
      metricCategory: inferMetricCategory(measureCode),
    });
  }
  return columns;
}

function headerJoin(headerCells: string[]): string {
  return headerCells.join(" | ");
}

/** CMS measure-score files share the star-file legend; name is the discriminator. */
export function isPp2MeasureDataSource(sheetName: string, fileName = ""): boolean {
  const source = `${sheetName} ${fileName}`.toLowerCase();
  return /measure[_\s-]*data/.test(source) && !/measure[_\s-]*star/.test(source);
}

export function detectPp2FileKind(
  rows: unknown[][],
  headerRowIndex: number,
  headerCells: string[],
  sheetName: string,
  fileName = "",
): "measure_star" | "improvement" | "summary_rating" | null {
  if (isPp2MeasureDataSource(sheetName, fileName)) return null;

  const joined = headerJoin(headerCells);
  if (joined.includes("calculated summary mean") && joined.includes("final summary")) {
    return "summary_rating";
  }

  const source = `${sheetName} ${fileName}`.toLowerCase();
  if (source.includes("improve")) return "improvement";
  if (source.includes("measure_star") || source.includes("measure star")) return "measure_star";

  const blob = rows
    .slice(0, Math.min(rows.length, 40))
    .flat()
    .map((cell) => cleanCell(cell).toLowerCase())
    .join("\n");

  if (
    blob.includes("significant improvement") ||
    blob.includes("hold harmless") ||
    blob.includes("no significant change")
  ) {
    return "improvement";
  }
  // Shared CMS sentinels like "plan too small to be measured" also appear on
  // measure_data files — do not treat them as official stars.
  if (blob.includes("star rating legend")) {
    return "measure_star";
  }
  return null;
}

function detectSummaryRatingType(headerCells: string[]): PlanPreviewOfficialRatingType {
  const joined = headerJoin(headerCells);
  const hasPartC = /part c summary rating/.test(joined);
  const hasPartD = /part d summary rating/.test(joined);
  const hasOverall = /overall rating/.test(joined);
  if (hasOverall && hasPartC) return "overall";
  if (hasPartD && !hasPartC) return "part_d";
  if (hasPartC) return "part_c";
  if (hasOverall) return "overall";
  throw new Error(
    "Could not detect the summary rating type. Expected a Part C, Part D, or Overall rating column."
  );
}

export function parsePp2MeasureStarWorkbook(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number
): PlanPreviewOfficialStarParseResult {
  const measureColumns = buildMeasureColumns(rows[headerRowIndex + 1] ?? []);
  if (measureColumns.length === 0) {
    throw new Error(
      'Found the contract header row but no measure columns (e.g. "C01: Breast Cancer Screening") beneath it.'
    );
  }

  const parsedRows: ParsedPlanPreviewOfficialStar[] = [];
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
      const { star, status } = classifyOfficialStarValue(rawValue);
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
        star,
        status,
      });
      measureCodes.add(column.measureCode);
    }
    contractIds.add(contractId);
  }

  return {
    fileType: "measure_star",
    sheetName,
    detectedStarsYear: detectPlanPreviewStarsYear(rows),
    rows: parsedRows,
    summary: {
      rowCount: parsedRows.length,
      contractCount: contractIds.size,
      measureCount: measureCodes.size,
      scoredCount,
    },
  };
}

function findImprovementScoreColumn(rows: unknown[][], headerRowIndex: number): number | null {
  for (let rowIndex = Math.max(0, headerRowIndex - 1); rowIndex <= headerRowIndex + 2; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row) continue;
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const cell = cleanCell(row[columnIndex]).toLowerCase();
      if (
        (cell.includes("part c improvement") ||
          cell.includes("part d improvement") ||
          cell === "improvement") &&
        !MEASURE_HEADER_PATTERN.test(cleanCell(row[columnIndex]))
      ) {
        return columnIndex;
      }
    }
  }
  return null;
}

export function parsePp2ImprovementWorkbook(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number
): PlanPreviewImprovementParseResult {
  const measureColumns = buildMeasureColumns(rows[headerRowIndex + 1] ?? []);
  if (measureColumns.length === 0) {
    throw new Error(
      "Found the contract header row but no improvement measure columns beneath it."
    );
  }

  const partCCount = measureColumns.filter((column) => column.metricCategory === "Part C").length;
  const partDCount = measureColumns.filter((column) => column.metricCategory === "Part D").length;
  const ratingType: "part_c" | "part_d" = partDCount > partCCount ? "part_d" : "part_c";
  const scoreColumn = findImprovementScoreColumn(rows, headerRowIndex);

  const parsedRows: ParsedPlanPreviewImprovement[] = [];
  const contractIds = new Set<string>();
  const measureCodes = new Set<string>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const contractId = parseContractId(row[0]);
    if (!contractId) continue;

    const organizationMarketingName = parseNullableText(row[1]);
    const contractName = parseNullableText(row[2]);
    const parentOrganization = parseNullableText(row[3]);
    const improvementScore =
      scoreColumn === null ? null : parseNumber(cleanCell(row[scoreColumn]));

    for (const column of measureColumns) {
      const qiSignificance = cleanCell(row[column.columnIndex]);
      if (!qiSignificance) continue;
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
        qiSignificance,
        improvementScore,
        ratingType,
      });
      measureCodes.add(column.measureCode);
    }
    contractIds.add(contractId);
  }

  return {
    fileType: "improvement",
    sheetName,
    detectedStarsYear: detectPlanPreviewStarsYear(rows),
    rows: parsedRows,
    summary: {
      rowCount: parsedRows.length,
      contractCount: contractIds.size,
      measureCount: measureCodes.size,
    },
  };
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

function findHeaderIndex(headerRow: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headerRow.findIndex((cell) => cell === candidate);
    if (index >= 0) return index;
  }
  return -1;
}

function cellAt(row: unknown[], headerRow: string[], candidates: string[]): string {
  const index = findHeaderIndex(headerRow, candidates);
  return index >= 0 ? cleanCell(row[index]) : "";
}

function numberAt(row: unknown[], headerRow: string[], candidates: string[]): number | null {
  return parseNumber(cellAt(row, headerRow, candidates));
}

function textAt(row: unknown[], headerRow: string[], candidates: string[]): string | null {
  return parseNullableText(cellAt(row, headerRow, candidates));
}

export function parsePp2SummaryWorkbook(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number
): PlanPreviewOfficialSummaryParseResult {
  const headerRow = rows[headerRowIndex].map((cell) => normalizeHeader(cleanCell(cell)));
  const ratingType = detectSummaryRatingType(headerRow);
  const disasterCols = headerRow
    .map((cell, index) => {
      const match = DISASTER_HEADER_PATTERN.exec(cell);
      return match ? { index, year: Number(match[1]) } : null;
    })
    .filter((entry): entry is { index: number; year: number } => entry !== null)
    .sort((left, right) => left.year - right.year);

  const parsedRows: ParsedPlanPreviewOfficialSummary[] = [];
  const contractIds = new Set<string>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const contractId = parseContractId(row[0]);
    if (!contractId) continue;

    const disaster1 = disasterCols[0];
    const disaster2 = disasterCols[1];
    const finalRatingHeader =
      ratingType === "overall"
        ? headerRow.filter((cell) => cell.endsWith("overall rating"))
        : ratingType === "part_c"
          ? headerRow.filter((cell) => cell.endsWith("part c summary rating"))
          : headerRow.filter((cell) => cell.endsWith("part d summary rating"));
    const finalRating = numberAt(row, headerRow, finalRatingHeader);

    parsedRows.push({
      sourceRowNumber: rowIndex + 1,
      contractId,
      organizationMarketingName: textAt(row, headerRow, ["organization marketing name"]),
      contractName: textAt(row, headerRow, ["contract name"]),
      parentOrganization: textAt(row, headerRow, ["parent organization"]),
      ratingType,
      contractType: textAt(row, headerRow, ["contract type"]),
      snpPlans: textAt(row, headerRow, ["snp plans"]),
      disasterYear1: disaster1?.year ?? null,
      disasterPct1: disaster1 ? parseNumber(cleanCell(row[disaster1.index])) : null,
      disasterYear2: disaster2?.year ?? null,
      disasterPct2: disaster2 ? parseNumber(cleanCell(row[disaster2.index])) : null,
      measuresRequired: textAt(row, headerRow, ["number measures required"]),
      measuresMissing: numberAt(row, headerRow, ["number missing measures"]),
      measuresRated: numberAt(row, headerRow, ["number rated measures"]),
      calculatedMean: numberAt(row, headerRow, ["calculated summary mean"]),
      calculatedVariance: numberAt(row, headerRow, ["calculated variance"]),
      scorePercentileRank: numberAt(row, headerRow, ["calculated score percentile rank"]),
      variancePercentileRank: numberAt(row, headerRow, ["variance percentile rank"]),
      varianceCategory: textAt(row, headerRow, ["variance category"]),
      rewardFactor: numberAt(row, headerRow, ["reward factor"]),
      interimSummary: numberAt(row, headerRow, ["interim summary"]),
      fac: textAt(row, headerRow, [
        ratingType === "part_c"
          ? "part c summary fac"
          : ratingType === "part_d"
            ? "part d summary fac"
            : "overall fac",
        "overall fac",
        "part c summary fac",
        "part d summary fac",
      ]),
      caiValue: numberAt(row, headerRow, ["cai value"]),
      finalSummary: numberAt(row, headerRow, ["final summary"]),
      improvementUsage: textAt(row, headerRow, ["improvement measure usage"]),
      newMeasureUsage: textAt(row, headerRow, ["new measure usage"]),
      finalRating,
      partCSummaryRating: numberAt(row, headerRow, headerRow.filter((cell) =>
        cell.endsWith("part c summary rating")
      )),
      partDSummaryRating: numberAt(row, headerRow, headerRow.filter((cell) =>
        cell.endsWith("part d summary rating")
      )),
    });
    contractIds.add(contractId);
  }

  return {
    fileType: "summary_rating",
    sheetName,
    detectedStarsYear: detectPlanPreviewStarsYear(rows),
    rows: parsedRows,
    summary: {
      rowCount: parsedRows.length,
      contractCount: contractIds.size,
    },
  };
}

export function parsePp2Workbook(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number,
  kind: "measure_star" | "improvement" | "summary_rating"
):
  | PlanPreviewOfficialStarParseResult
  | PlanPreviewImprovementParseResult
  | PlanPreviewOfficialSummaryParseResult {
  if (kind === "measure_star") return parsePp2MeasureStarWorkbook(rows, sheetName, headerRowIndex);
  if (kind === "improvement") return parsePp2ImprovementWorkbook(rows, sheetName, headerRowIndex);
  return parsePp2SummaryWorkbook(rows, sheetName, headerRowIndex);
}
