import { resolveMeasureForPlanPreview } from "./measure-resolve";
import type {
  ParsedPlanPreviewDecimalScore,
  PlanPreviewDecimalParseResult,
  PlanPreviewDecimalSource,
} from "./types";

const CONTRACT_ID_PATTERN = /^[HRS]\d{4}$/;
const STARS_YEAR_PATTERN = /CY\s*(\d{4})\s*Star Ratings/i;
const CAHPS_MEASURE_CODE_PATTERN = /\(([CD]\d{2})\)\s*$/i;
const MEASURE_ID_PATTERN = /^([CD]\d{2})$/i;

const SNP_CARE_MANAGEMENT_NAME = "Special Needs Plan (SNP) Care Management";

/**
 * HPMS CAHPS domain files label measures with MCAHPS VariableNames
 * (e.g. "gnc_comp (C21)") rather than Star Ratings display names. Map those
 * codes to the canonical measure name before universe / cut-point matching.
 */
const CAHPS_FPP_VARIABLE_TO_MEASURE: Record<string, string> = {
  gnc_comp: "Getting Needed Care",
  gcq_comp: "Getting Appointments and Care Quickly",
  cs_comp: "Customer Service",
  coc_comp: "Care Coordination",
  rate_care: "Rating of Health Care Quality",
  rate_plan: "Rating of Health Plan",
  mapd_rate_pdp: "Rating of Drug Plan",
  pdp_rate_pdp: "Rating of Drug Plan",
  mapd_gneeded_comp: "Getting Needed Prescription Drugs",
  pdp_gneeded_comp: "Getting Needed Prescription Drugs",
  im_flu1last: "Annual Flu Vaccine",
};

/** Resolve an HPMS CAHPS domain label (VariableName or display name) to a Star measure name. */
export function resolveCahpsDomainMeasureName(measureLabelWithoutCode: string): string {
  const cleaned = measureLabelWithoutCode.trim();
  if (!cleaned) return cleaned;
  return CAHPS_FPP_VARIABLE_TO_MEASURE[cleaned.toLowerCase()] ?? cleaned;
}

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
  return cleaned || null;
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

function headerIndex(headerCells: string[], name: string): number {
  return headerCells.indexOf(name);
}

function requireColumn(headerCells: string[], name: string): number {
  const index = headerIndex(headerCells, name);
  if (index < 0) {
    throw new Error(`Expected a "${name}" column in the domain workbook.`);
  }
  return index;
}

function inferMetricCategory(measureCode: string): "Part C" | "Part D" | "Other" {
  if (measureCode.startsWith("C")) return "Part C";
  if (measureCode.startsWith("D")) return "Part D";
  return "Other";
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finalizeDecimalRows(
  fileType: PlanPreviewDecimalSource,
  sheetName: string,
  rows: unknown[][],
  parsedRows: ParsedPlanPreviewDecimalScore[]
): PlanPreviewDecimalParseResult {
  const contractIds = new Set(parsedRows.map((row) => row.contractId));
  const measureCodes = new Set(parsedRows.map((row) => row.measureCode));
  return {
    fileType,
    sheetName,
    detectedStarsYear: detectStarsYear(rows),
    rows: parsedRows,
    summary: {
      rowCount: parsedRows.length,
      contractCount: contractIds.size,
      measureCount: measureCodes.size,
    },
  };
}

/**
 * Unsupported PP1 domain files that look like master tables but do not carry
 * printed measure decimals we can overlay. Reject early so they are not
 * misparsed as measure_data.
 */
export function rejectUnsupportedDomainFile(headerCells: string[]): void {
  const headers = new Set(headerCells);
  if (headers.has("appeal number") || headers.has("appeal priority")) {
    throw new Error(
      "Appeals detail files are not supported for decimal import. Upload the measure data file for appeals scores."
    );
  }
  if (headers.has("complaint id")) {
    throw new Error(
      "CTM detail files are not supported for decimal import. Upload the measure data file for complaint scores."
    );
  }
  if (
    headers.has("total number of complaints") &&
    headers.has("complaint average enrollment")
  ) {
    throw new Error(
      "CTM summary files are not supported for decimal import. Upload the measure data file for complaint scores."
    );
  }
  if (headers.has("number disenrolled") || headers.has("adjusted rate")) {
    throw new Error(
      "Disenrollment files are not supported for decimal import. Upload the measure data file for Members Choosing to Leave scores."
    );
  }
  if ([...headers].some((header) => header.startsWith("disaster flag"))) {
    throw new Error(
      "Disaster / membership detail files are not supported for plan preview import."
    );
  }
}

export type DomainFileKind = PlanPreviewDecimalSource | "unsupported" | null;

export function detectDomainFileKind(headerCells: string[]): DomainFileKind {
  const headers = new Set(headerCells);
  if (headers.has("cahps measure") && headers.has("scaled mean")) return "cahps";
  if (headers.has("measure id") && headers.has("rate")) return "hedis";
  if (
    headers.has("percent of eligible snp enrollees receiving an assessment") ||
    (headers.has("total number of snp enrollees eligible") &&
      headers.has("total number of assessments performed"))
  ) {
    return "snp_cm";
  }
  if (
    headers.has("appeal number") ||
    headers.has("appeal priority") ||
    headers.has("complaint id") ||
    (headers.has("total number of complaints") &&
      headers.has("complaint average enrollment")) ||
    headers.has("number disenrolled") ||
    headers.has("adjusted rate") ||
    [...headers].some((header) => header.startsWith("disaster flag"))
  ) {
    return "unsupported";
  }
  return null;
}

/** Whole-number 1–5 star from the plan PP1 CAHPS `Star Rating` / `Base Group` columns. */
function parsePlanStar(value: unknown): number | null {
  const parsed = parseNumber(cleanCell(value));
  if (parsed === null) return null;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return null;
  return parsed;
}

function parseCahpsDomain(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number
): PlanPreviewDecimalParseResult {
  const headerCells = rows[headerRowIndex].map((cell) => cleanCell(cell).toLowerCase());
  const measureCol = requireColumn(headerCells, "cahps measure");
  const scaledMeanCol = requireColumn(headerCells, "scaled mean");
  const starRatingCol = headerIndex(headerCells, "star rating");
  const baseGroupCol = headerIndex(headerCells, "base group");

  const parsedRows: ParsedPlanPreviewDecimalScore[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const contractId = parseContractId(row[0]);
    if (!contractId) continue;

    const measureLabel = cleanCell(row[measureCol]);
    const codeMatch = CAHPS_MEASURE_CODE_PATTERN.exec(measureLabel);
    if (!codeMatch) continue;

    const measureCode = codeMatch[1].toUpperCase();
    const decimalScore = parseNumber(cleanCell(row[scaledMeanCol]));
    if (decimalScore === null) continue;

    const rawMeasureName = measureLabel.replace(CAHPS_MEASURE_CODE_PATTERN, "").trim();
    const measureName = resolveCahpsDomainMeasureName(rawMeasureName) || measureCode;
    const resolved = resolveMeasureForPlanPreview(measureCode, measureName);
    const planStar = starRatingCol >= 0 ? parsePlanStar(row[starRatingCol]) : null;
    const baseGroupStar = baseGroupCol >= 0 ? parsePlanStar(row[baseGroupCol]) : null;

    parsedRows.push({
      sourceRowNumber: rowIndex + 1,
      contractId,
      organizationMarketingName: parseNullableText(row[1]),
      contractName: parseNullableText(row[2]),
      parentOrganization: parseNullableText(row[3]),
      measureCode,
      measureName: resolved.displayName,
      measureDisplayName: resolved.displayName,
      measureNormalized: resolved.normalizedName,
      metricCategory: inferMetricCategory(measureCode),
      decimalScore,
      decimalSource: "cahps",
      planStar,
      baseGroupStar,
    });
  }

  return finalizeDecimalRows("cahps", sheetName, rows, parsedRows);
}

function parseHedisDomain(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number
): PlanPreviewDecimalParseResult {
  const headerCells = rows[headerRowIndex].map((cell) => cleanCell(cell).toLowerCase());
  const measureIdCol = requireColumn(headerCells, "measure id");
  const measureNameCol = requireColumn(headerCells, "measure name");
  const rateCol = requireColumn(headerCells, "rate");

  type Accumulator = {
    sourceRowNumber: number;
    contractId: string;
    organizationMarketingName: string | null;
    contractName: string | null;
    parentOrganization: string | null;
    measureCode: string;
    measureName: string;
    measureDisplayName: string;
    measureNormalized: string;
    metricCategory: "Part C" | "Part D" | "Other";
    rates: number[];
  };

  const byKey = new Map<string, Accumulator>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const contractId = parseContractId(row[0]);
    if (!contractId) continue;

    const measureIdRaw = cleanCell(row[measureIdCol]);
    const idMatch = MEASURE_ID_PATTERN.exec(measureIdRaw);
    if (!idMatch) continue;

    const measureCode = idMatch[1].toUpperCase();
    const rate = parseNumber(cleanCell(row[rateCol]));
    // C17 (Plan All-Cause Readmissions) and similar rows often have empty Rate
    // with only observed/expected counts — skip those (no printed decimal).
    if (rate === null) continue;

    const measureName = cleanCell(row[measureNameCol]) || measureCode;
    const resolved = resolveMeasureForPlanPreview(measureCode, measureName);
    const key = `${contractId}|${measureCode}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.rates.push(rate);
      continue;
    }

    byKey.set(key, {
      sourceRowNumber: rowIndex + 1,
      contractId,
      organizationMarketingName: parseNullableText(row[1]),
      contractName: parseNullableText(row[2]),
      parentOrganization: parseNullableText(row[3]),
      measureCode,
      measureName,
      measureDisplayName: resolved.displayName,
      measureNormalized: resolved.normalizedName,
      metricCategory: inferMetricCategory(measureCode),
      rates: [rate],
    });
  }

  const parsedRows: ParsedPlanPreviewDecimalScore[] = [...byKey.values()].map((entry) => ({
    sourceRowNumber: entry.sourceRowNumber,
    contractId: entry.contractId,
    organizationMarketingName: entry.organizationMarketingName,
    contractName: entry.contractName,
    parentOrganization: entry.parentOrganization,
    measureCode: entry.measureCode,
    measureName: entry.measureName,
    measureDisplayName: entry.measureDisplayName,
    measureNormalized: entry.measureNormalized,
    metricCategory: entry.metricCategory,
    decimalScore: average(entry.rates),
    decimalSource: "hedis",
  }));

  return finalizeDecimalRows("hedis", sheetName, rows, parsedRows);
}

function parseSnpCmDomain(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number
): PlanPreviewDecimalParseResult {
  const headerCells = rows[headerRowIndex].map((cell) => cleanCell(cell).toLowerCase());
  const percentCol = requireColumn(
    headerCells,
    "percent of eligible snp enrollees receiving an assessment"
  );

  const resolved = resolveMeasureForPlanPreview("C07", SNP_CARE_MANAGEMENT_NAME);
  const measureCode = resolved.measureCode ?? "C07";
  const parsedRows: ParsedPlanPreviewDecimalScore[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const contractId = parseContractId(row[0]);
    if (!contractId) continue;

    const decimalScore = parseNumber(cleanCell(row[percentCol]));
    if (decimalScore === null) continue;

    parsedRows.push({
      sourceRowNumber: rowIndex + 1,
      contractId,
      organizationMarketingName: parseNullableText(row[1]),
      contractName: parseNullableText(row[2]),
      parentOrganization: parseNullableText(row[3]),
      measureCode,
      measureName: SNP_CARE_MANAGEMENT_NAME,
      measureDisplayName: resolved.displayName,
      measureNormalized: resolved.normalizedName,
      metricCategory: inferMetricCategory(measureCode),
      decimalScore,
      decimalSource: "snp_cm",
    });
  }

  return finalizeDecimalRows("snp_cm", sheetName, rows, parsedRows);
}

export function parseDomainWorkbook(
  rows: unknown[][],
  sheetName: string,
  headerRowIndex: number,
  kind: PlanPreviewDecimalSource
): PlanPreviewDecimalParseResult {
  if (kind === "cahps") return parseCahpsDomain(rows, sheetName, headerRowIndex);
  if (kind === "hedis") return parseHedisDomain(rows, sheetName, headerRowIndex);
  return parseSnpCmDomain(rows, sheetName, headerRowIndex);
}
