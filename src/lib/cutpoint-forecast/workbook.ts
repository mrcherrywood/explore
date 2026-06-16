import * as XLSX from "xlsx";

import { getAvailableMeasureYears, getAvailableOptions, type UnifiedMeasure } from "@/lib/band-movement/analysis";
import {
  loadMeasureCutPoints,
  matchCutPointToMeasureName,
  normalizeMeasureName,
} from "@/lib/percentile-analysis/measure-matching";
import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";
import { isCahpsMeasure } from "@/lib/band-movement/cut-point-methodology";
import {
  type ForecastWorkbookParseResult,
  type ImportedMonthlyMeasureRow,
} from "./types";

const CUT_POINTS_PATH = `${process.cwd()}/data/Stars 2016-2028 Cut Points 12.2025_with_weights.xlsx`;
const REQUIRED_HEADERS = ["hl code", "contract", "measure", "year", "month"] as const;
const COMPACT_HL_CODE_ALIASES = ["hlcode", "measureid", "eqcode"] as const;
const COMPACT_CONTRACT_ALIASES = ["contractid", "contract", "contractcode"] as const;
const COMPACT_STARS_YEAR_ALIASES = ["starsyear", "year"] as const;
const COMPACT_MONTH_ALIASES = ["monthnum", "monthnume", "monthnumber", "month"] as const;
const COMPACT_VALUE_ALIASES = ["measurevalue", "measureval", "rate"] as const;
const OPTIONAL_HEADERS = ["rate", "numerator - all", "denominator - all"] as const;

type HeaderFormat = "canonical" | "compact";

export type ResolvedMeasure = {
  displayName: string;
  normalizedName: string;
  measureCode: string | null;
  metricCategory: "Part C" | "Part D" | "Other";
};

const CONTRACT_ID_PATTERN = /^[HRS]\d{4}(?:-[A-Z0-9]+)?$/i;

let latestCutPointsCache: MeasureCutPoint[] | null = null;
let measureResolutionCache: {
  directByDisplayName: Map<string, UnifiedMeasure>;
  measures: UnifiedMeasure[];
} | null = null;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeCompactHeader(value: string): string {
  return value.replace(/[^a-z0-9]+/g, "").toLowerCase();
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[%,$]/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[^\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseContractId(value: unknown): string | null {
  const parsed = parseNullableString(value)?.toUpperCase() ?? null;
  if (!parsed) return null;
  return CONTRACT_ID_PATTERN.test(parsed) ? parsed : null;
}

function normalizeForecastMonth(month: number): number {
  if (!Number.isFinite(month)) return 1;
  if (month < 1) return 1;
  if (month > 13) return 13;
  return Math.round(month);
}

function inferMetricCategory(measureCode: string | null): "Part C" | "Part D" | "Other" {
  if (!measureCode) return "Other";
  if (measureCode.startsWith("C")) return "Part C";
  if (measureCode.startsWith("D")) return "Part D";
  return "Other";
}

function ensureMeasureResolutionCache() {
  if (measureResolutionCache) return measureResolutionCache;
  const { measures } = getAvailableOptions();
  measureResolutionCache = {
    measures,
    directByDisplayName: new Map(
      measures.map((measure) => [normalizeMeasureName(measure.displayName), measure])
    ),
  };
  return measureResolutionCache;
}

function ensureLatestCutPoints() {
  if (latestCutPointsCache) return latestCutPointsCache;
  const latestYear = getAvailableMeasureYears().at(-1);
  if (!latestYear) {
    latestCutPointsCache = [];
    return latestCutPointsCache;
  }
  latestCutPointsCache = loadMeasureCutPoints(CUT_POINTS_PATH, [latestYear]).get(latestYear) ?? [];
  return latestCutPointsCache;
}

let hlCodeToMeasureCache: Map<string, ResolvedMeasure> | null = null;

function inferCategoryFromDomain(domain: string | null): "Part C" | "Part D" | "Other" {
  if (!domain) return "Other";
  const d = domain.toLowerCase();
  if (d === "pharmacy") return "Part D";
  if (d === "hedis" || d === "cahps" || d === "hos") return "Part C";
  return "Other";
}

function ensureHlCodeMap(): Map<string, ResolvedMeasure> {
  if (hlCodeToMeasureCache) return hlCodeToMeasureCache;
  const cutPoints = ensureLatestCutPoints();
  const map = new Map<string, ResolvedMeasure>();

  for (const cp of cutPoints) {
    const key = cp.hlCode.toUpperCase().trim();
    if (!key || map.has(key)) continue;

    const resolved = resolveMeasure(cp.measureName);
    if (resolved.metricCategory === "Other" && cp.domain) {
      resolved.metricCategory = inferCategoryFromDomain(cp.domain);
    }
    map.set(key, resolved);
  }

  hlCodeToMeasureCache = map;
  return map;
}

/**
 * Some uploads use EQ codes (EQ01, EQ02, …) instead of HL codes. The numeric
 * portion corresponds to the same measure as the matching HL code, so EQ01 maps
 * to HL01. Any other code is passed through unchanged.
 */
function normalizeToHlCode(code: string): string {
  const upper = code.toUpperCase().trim();
  if (upper.startsWith("EQ")) return `HL${upper.slice(2)}`;
  return upper;
}

function resolveMeasureFromHlCode(hlCode: string): ResolvedMeasure | null {
  const map = ensureHlCodeMap();
  return map.get(normalizeToHlCode(hlCode)) ?? null;
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function chooseBestMeasure(rawMeasureName: string): UnifiedMeasure | null {
  const normalized = normalizeMeasureName(rawMeasureName);
  const { measures, directByDisplayName } = ensureMeasureResolutionCache();

  const direct = directByDisplayName.get(normalized);
  if (direct) return direct;

  const cutPointMatch = matchCutPointToMeasureName(rawMeasureName, null, ensureLatestCutPoints());
  if (cutPointMatch) {
    const matchedNormalized = normalizeMeasureName(cutPointMatch.measureName);
    const matched = directByDisplayName.get(matchedNormalized);
    if (matched) return matched;
  }

  let best: UnifiedMeasure | null = null;
  let bestScore = 0;
  for (const measure of measures) {
    const candidate = normalizeMeasureName(measure.displayName);
    if (candidate.includes(normalized) || normalized.includes(candidate)) {
      return measure;
    }

    const score = tokenSimilarity(normalized, candidate);
    if (score > bestScore) {
      best = measure;
      bestScore = score;
    }
  }

  return bestScore >= 0.6 ? best : null;
}

export function resolveMeasure(rawMeasureName: string): ResolvedMeasure {
  const matched = chooseBestMeasure(rawMeasureName);
  if (!matched) {
    return {
      displayName: rawMeasureName,
      normalizedName: normalizeMeasureName(rawMeasureName),
      measureCode: null,
      metricCategory: "Other",
    };
  }

  const latestYear = getAvailableMeasureYears().at(-1);
  const measureCode = latestYear
    ? matched.codesByYear[latestYear] ?? Object.values(matched.codesByYear)[0] ?? null
    : Object.values(matched.codesByYear)[0] ?? null;

  return {
    displayName: matched.displayName,
    normalizedName: matched.normalizedName,
    measureCode,
    metricCategory: inferMetricCategory(measureCode),
  };
}

function hasAnyAlias(normalizedHeaders: string[], aliases: readonly string[]): boolean {
  return aliases.some((alias) => normalizedHeaders.includes(alias));
}

function isCompactHeaderRow(normalizedHeaders: string[]): boolean {
  const compactHeaders = normalizedHeaders.map(normalizeCompactHeader);
  return (
    hasAnyAlias(compactHeaders, COMPACT_HL_CODE_ALIASES) &&
    hasAnyAlias(compactHeaders, COMPACT_CONTRACT_ALIASES) &&
    hasAnyAlias(compactHeaders, COMPACT_STARS_YEAR_ALIASES) &&
    hasAnyAlias(compactHeaders, COMPACT_MONTH_ALIASES) &&
    hasAnyAlias(compactHeaders, COMPACT_VALUE_ALIASES)
  );
}

function findColumnIndex(headerMap: Map<string, number>, aliases: readonly string[], compact = false): number {
  for (const [header, index] of headerMap.entries()) {
    const comparableHeader = compact ? normalizeCompactHeader(header) : header;
    if (aliases.includes(comparableHeader)) return index;
  }
  for (const alias of aliases) {
    const idx = headerMap.get(alias);
    if (idx !== undefined) return idx;
  }
  return -1;
}

function findHeaderRow(rows: unknown[][]): { headerRowIndex: number; normalizedHeaders: string[]; format: HeaderFormat } {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 10); rowIndex += 1) {
    const normalizedHeaders = rows[rowIndex].map((cell) => normalizeHeader(cell));
    if (REQUIRED_HEADERS.every((header) => normalizedHeaders.includes(header))) {
      return { headerRowIndex: rowIndex, normalizedHeaders, format: "canonical" };
    }
    if (isCompactHeaderRow(normalizedHeaders)) {
      return { headerRowIndex: rowIndex, normalizedHeaders, format: "compact" };
    }
  }

  throw new Error(
    "Could not find the workbook header row for forecast imports. " +
    "Expected either [HL Code, Contract, Measure, Year, Month] or a compact format like [contract_id, hl_code, stars_year, month_num/month_nume, measure_value/measure_val]."
  );
}

function parseCanonicalRow(
  row: unknown[],
  headerMap: Map<string, number>,
  sourceRowNumber: number
): ImportedMonthlyMeasureRow | null {
  const contractId = parseContractId(row[headerMap.get("contract") ?? -1]);
  const measureName = parseNullableString(row[headerMap.get("measure") ?? -1]);
  const year = parseNullableNumber(row[headerMap.get("year") ?? -1]);
  const month = parseNullableNumber(row[headerMap.get("month") ?? -1]);

  if (!contractId || !measureName || year === null || month === null) return null;

  const resolvedMeasure = resolveMeasure(measureName);
  return {
    sourceRowNumber,
    hlCode: parseNullableString(row[headerMap.get("hl code") ?? -1]),
    contractId,
    measureName,
    measureDisplayName: resolvedMeasure.displayName,
    measureNormalized: resolvedMeasure.normalizedName,
    measureCode: resolvedMeasure.measureCode,
    metricCategory: resolvedMeasure.metricCategory,
    year: Math.round(year),
    month: Math.round(month),
    normalizedMonth: normalizeForecastMonth(month),
    rate: parseNullableNumber(row[headerMap.get("rate") ?? -1]),
    numeratorAll: parseNullableNumber(row[headerMap.get("numerator - all") ?? -1]),
    denominatorAll: parseNullableNumber(row[headerMap.get("denominator - all") ?? -1]),
  };
}

function parseCompactRow(
  row: unknown[],
  headerMap: Map<string, number>,
  sourceRowNumber: number
): ImportedMonthlyMeasureRow | null {
  const contractId = parseContractId(
    row[findColumnIndex(headerMap, COMPACT_CONTRACT_ALIASES, true)]
  );
  const rawCode = parseNullableString(
    row[findColumnIndex(headerMap, COMPACT_HL_CODE_ALIASES, true)]
  );
  const hlCode = rawCode ? normalizeToHlCode(rawCode) : null;
  const starsYear = parseNullableNumber(
    row[findColumnIndex(headerMap, COMPACT_STARS_YEAR_ALIASES, true)]
  );
  const month = parseNullableNumber(
    row[findColumnIndex(headerMap, COMPACT_MONTH_ALIASES, true)]
  );
  const rate = parseNullableNumber(
    row[findColumnIndex(headerMap, COMPACT_VALUE_ALIASES, true)]
  );

  if (!contractId || !hlCode || starsYear === null || month === null) return null;

  const resolvedMeasure = resolveMeasureFromHlCode(hlCode);
  if (!resolvedMeasure) return null;

  return {
    sourceRowNumber,
    hlCode,
    contractId,
    measureName: resolvedMeasure.displayName,
    measureDisplayName: resolvedMeasure.displayName,
    measureNormalized: resolvedMeasure.normalizedName,
    measureCode: resolvedMeasure.measureCode,
    metricCategory: resolvedMeasure.metricCategory,
    year: Math.round(starsYear),
    month: Math.round(month),
    normalizedMonth: normalizeForecastMonth(month),
    rate,
    numeratorAll: null,
    denominatorAll: null,
  };
}

function mergeDuplicateRows(
  existing: ImportedMonthlyMeasureRow,
  incoming: ImportedMonthlyMeasureRow
): ImportedMonthlyMeasureRow {
  const preferIncoming =
    incoming.rate !== null ||
    incoming.numeratorAll !== null ||
    incoming.denominatorAll !== null ||
    incoming.sourceRowNumber > existing.sourceRowNumber;

  if (!preferIncoming) return existing;

  return {
    ...existing,
    ...incoming,
    rate: incoming.rate ?? existing.rate,
    numeratorAll: incoming.numeratorAll ?? existing.numeratorAll,
    denominatorAll: incoming.denominatorAll ?? existing.denominatorAll,
  };
}

function dedupeImportedRows(rows: ImportedMonthlyMeasureRow[]): ImportedMonthlyMeasureRow[] {
  const deduped = new Map<string, ImportedMonthlyMeasureRow>();

  for (const row of rows) {
    const key = [
      row.contractId,
      row.measureNormalized,
      row.year,
      row.month,
    ].join("::");
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      continue;
    }
    deduped.set(key, mergeDuplicateRows(existing, row));
  }

  return [...deduped.values()].sort(
    (left, right) =>
      left.contractId.localeCompare(right.contractId) ||
      left.measureNormalized.localeCompare(right.measureNormalized) ||
      left.year - right.year ||
      left.month - right.month ||
      left.sourceRowNumber - right.sourceRowNumber
  );
}

export function parseForecastWorkbook(buffer: Buffer): ForecastWorkbookParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("File is empty or could not be parsed.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });
  const { headerRowIndex, normalizedHeaders, format } = findHeaderRow(rawRows);
  const rows = rawRows.slice(headerRowIndex + 1);
  const headerMap = new Map<string, number>(
    normalizedHeaders.map((header, index) => [header, index])
  );

  const parsedRows: ImportedMonthlyMeasureRow[] = [];
  const observedYears = new Set<number>();
  const observedMonths = new Set<number>();
  const contractIds = new Set<string>();
  const measureKeys = new Set<string>();

  const knownHeaders: string[] = format === "compact"
    ? [
        ...COMPACT_HL_CODE_ALIASES,
        ...COMPACT_CONTRACT_ALIASES,
        ...COMPACT_STARS_YEAR_ALIASES,
        ...COMPACT_MONTH_ALIASES,
        ...COMPACT_VALUE_ALIASES,
      ]
    : [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

  const rowHasKnownData = (row: unknown[]) =>
    format === "compact"
      ? Array.from(headerMap.entries()).some(([header, idx]) => {
          const comparableHeader = normalizeCompactHeader(header);
          return knownHeaders.includes(comparableHeader) && String(row[idx] ?? "").trim() !== "";
        })
      : knownHeaders.some((header) => {
          const idx = headerMap.get(header);
          return idx !== undefined && String(row[idx] ?? "").trim() !== "";
        });

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!rowHasKnownData(row)) continue;

    const parsedRow = format === "compact"
      ? parseCompactRow(row, headerMap, headerRowIndex + rowIndex + 2)
      : parseCanonicalRow(row, headerMap, headerRowIndex + rowIndex + 2);

    if (!parsedRow) continue;

    // A reported value of 0 on a 0-100 measure means the measure wasn't reported
    // for that month (no data), not a true 0% score. Drop it so it doesn't drag
    // the projected time series toward zero.
    if (parsedRow.rate === 0) {
      continue;
    }

    // CAHPS measures are uploaded separately as survey data; drop them from the
    // non-CAHPS (HL-coded) import so they don't create a second projection here.
    // Use the clean display name — the universe's normalized name carries a
    // "(Part C)" suffix that the CAHPS name set does not include.
    if (isCahpsMeasure(parsedRow.measureDisplayName)) {
      continue;
    }

    parsedRows.push(parsedRow);
    contractIds.add(parsedRow.contractId);
    measureKeys.add(parsedRow.measureNormalized);
    observedYears.add(parsedRow.year);
    observedMonths.add(parsedRow.normalizedMonth);
  }

  const finalRows = dedupeImportedRows(parsedRows);
  const scoredRows = finalRows.filter((row) => row.rate !== null);
  const latestObserved = scoredRows
    .map((row) => ({ year: row.year, month: row.normalizedMonth }))
    .sort((left, right) => right.year - left.year || right.month - left.month)[0];

  return {
    rows: finalRows,
    sheetName,
    summary: {
      rowCount: finalRows.length,
      contractCount: contractIds.size,
      measureCount: measureKeys.size,
      years: [...observedYears].sort((left, right) => left - right),
      months: [...observedMonths].sort((left, right) => left - right),
      latestObservedYear: latestObserved?.year ?? null,
      latestObservedMonth: latestObserved?.month ?? null,
    },
  };
}
