import * as XLSX from "xlsx";

import { normalizeMeasureName } from "@/lib/percentile-analysis/measure-matching";
import type { GlidepathConfidenceLabel, GlidepathProjection } from "./types";
import { resolveMeasure } from "./workbook";

/**
 * Forecast runs are keyed by stars year. Non-CAHPS uploads use the file's stars
 * year directly; the CAHPS reporting year is one year behind the stars year
 * (reporting 2026 = stars 2027), so add one to get the stars year.
 */
export const CAHPS_REPORTING_TO_STARS_OFFSET = 1;

export function cahpsReportingYearToForecastYear(reportingYear: number): number {
  return reportingYear + CAHPS_REPORTING_TO_STARS_OFFSET;
}

/**
 * CAHPS in-progress survey data (separate upload from the HL-code non-CAHPS
 * file). Surveys are collected between weeks 10 and 22; the cumulative rate
 * firms up toward week 22. We take the latest cumulative week per survey mode,
 * then combine modes (respondent-weighted by cum_count) into one measure rate
 * per contract. These are CURRENT rates, not year-end projections.
 */

export const SURVEY_START_WEEK = 10;
export const SURVEY_END_WEEK = 22;

/**
 * Maps the file's VariableName to the canonical star-measure display name.
 * Composite rows (CC, GNC, …) already combine their underlying questions, so
 * we use those plus the single-question rating/flu rows directly.
 */
const VARIABLE_TO_MEASURE: Record<string, string> = {
  GNC: "Getting Needed Care",
  GCQ: "Getting Appointments and Care Quickly",
  HPCS: "Customer Service",
  CC: "Care Coordination",
  GNPD: "Getting Needed Prescription Drugs",
  MA_9: "Rating of Health Care Quality",
  MA_38: "Rating of Health Plan",
  MA_70: "Rating of Drug Plan",
  MA_52: "Annual Flu Vaccine",
};

const REQUIRED_HEADERS = [
  "variablename",
  "contractnumber",
  "surveyweek",
  "surveymodelabel",
  "cum_count",
  "sms",
] as const;

export type CahpsSurveyRawRow = {
  variableName: string;
  contractId: string;
  surveyWeek: number;
  mode: string;
  cumCount: number | null;
  sms: number | null;
  reportingYear: number | null;
};

export type CahpsMeasureRate = {
  contractId: string;
  variableName: string;
  measureDisplayName: string;
  measureNormalized: string;
  reportingYear: number | null;
  /** Respondent-weighted 0-100 rate combined across survey modes. */
  rate: number;
  respondentCount: number;
  latestSurveyWeek: number;
  modeCount: number;
  confidence: number;
  confidenceLabel: GlidepathConfidenceLabel;
};

const CONTRACT_ID_PATTERN = /^[HRS]\d{4}(?:-[A-Z0-9]+)?$/i;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

export function isCahpsSurveyHeaderRow(headers: unknown[]): boolean {
  const normalized = headers.map(normalizeHeader);
  return REQUIRED_HEADERS.every((header) => normalized.includes(header));
}

function confidenceFromWeek(latestSurveyWeek: number): {
  confidence: number;
  confidenceLabel: GlidepathConfidenceLabel;
} {
  const progress = clamp(
    (latestSurveyWeek - SURVEY_START_WEEK) / (SURVEY_END_WEEK - SURVEY_START_WEEK),
    0,
    1
  );
  const confidence = round2(clamp(0.2 + 0.75 * progress, 0.1, 0.95));
  const confidenceLabel: GlidepathConfidenceLabel =
    confidence >= 0.75 ? "high" : confidence >= 0.45 ? "medium" : "low";
  return { confidence, confidenceLabel };
}

/** Parse the raw CAHPS survey CSV/XLSX buffer into typed rows. */
export function parseCahpsSurveyBuffer(buffer: Buffer): CahpsSurveyRawRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("CAHPS file is empty or could not be parsed.");

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
  });

  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rawRows.length, 10); i += 1) {
    if (isCahpsSurveyHeaderRow(rawRows[i])) {
      headerRowIndex = i;
      break;
    }
  }
  if (headerRowIndex === -1) {
    throw new Error(
      "Could not find the CAHPS survey header row. Expected columns like " +
        "[VariableName, ContractNumber, SurveyWeek, SurveyModeLabel, cum_count, SMS]."
    );
  }

  const headerMap = new Map<string, number>(
    rawRows[headerRowIndex].map((cell, index) => [normalizeHeader(cell), index])
  );
  const col = (name: string) => headerMap.get(name) ?? -1;

  const rows: CahpsSurveyRawRow[] = [];
  for (const row of rawRows.slice(headerRowIndex + 1)) {
    const contractId = toText(row[col("contractnumber")]).toUpperCase();
    const variableName = toText(row[col("variablename")]);
    if (!variableName || !CONTRACT_ID_PATTERN.test(contractId)) continue;
    const surveyWeek = toNumber(row[col("surveyweek")]);
    if (surveyWeek === null) continue;

    rows.push({
      variableName,
      contractId,
      surveyWeek,
      mode: toText(row[col("surveymodelabel")]),
      cumCount: toNumber(row[col("cum_count")]),
      sms: toNumber(row[col("sms")]),
      reportingYear: toNumber(row[col("reportingyear")]),
    });
  }
  return rows;
}

/**
 * Aggregate raw survey rows into one rate per (contract, measure):
 * 1. Keep only mapped composite/rating measures.
 * 2. Take the latest cumulative week per (measure, contract, mode).
 * 3. Combine modes weighted by cumulative respondent count.
 */
export function aggregateCahpsSurvey(rows: CahpsSurveyRawRow[]): CahpsMeasureRate[] {
  // latest valid row per measure::contract::mode
  type ModePick = { surveyWeek: number; cumCount: number; sms: number; reportingYear: number | null };
  const latestByMode = new Map<string, ModePick>();

  for (const row of rows) {
    if (!(row.variableName in VARIABLE_TO_MEASURE)) continue;
    // A mode rate (SMS) of 0 means that mode has no reported data, not a true
    // 0% score; skip it so it doesn't pull the combined rate toward zero.
    if (row.sms === null || row.sms === 0 || row.cumCount === null || row.cumCount <= 0) continue;

    const key = `${row.variableName}::${row.contractId}::${row.mode}`;
    const existing = latestByMode.get(key);
    if (!existing || row.surveyWeek > existing.surveyWeek) {
      latestByMode.set(key, {
        surveyWeek: row.surveyWeek,
        cumCount: row.cumCount,
        sms: row.sms,
        reportingYear: row.reportingYear,
      });
    }
  }

  type Accumulator = {
    weightedSum: number;
    respondentCount: number;
    latestSurveyWeek: number;
    modeCount: number;
    reportingYear: number | null;
  };
  const byMeasureContract = new Map<string, Accumulator>();

  for (const [key, pick] of latestByMode) {
    const [variableName, contractId] = key.split("::");
    const measureKey = `${variableName}::${contractId}`;
    const acc = byMeasureContract.get(measureKey) ?? {
      weightedSum: 0,
      respondentCount: 0,
      latestSurveyWeek: 0,
      modeCount: 0,
      reportingYear: pick.reportingYear,
    };
    acc.weightedSum += pick.sms * pick.cumCount;
    acc.respondentCount += pick.cumCount;
    acc.latestSurveyWeek = Math.max(acc.latestSurveyWeek, pick.surveyWeek);
    acc.modeCount += 1;
    acc.reportingYear = acc.reportingYear ?? pick.reportingYear;
    byMeasureContract.set(measureKey, acc);
  }

  const results: CahpsMeasureRate[] = [];
  for (const [measureKey, acc] of byMeasureContract) {
    if (acc.respondentCount <= 0) continue;
    // A combined rate of 0 means no usable survey data; exclude the measure.
    const rate = round2(acc.weightedSum / acc.respondentCount);
    if (rate === 0) continue;
    const [variableName, contractId] = measureKey.split("::");
    const measureDisplayName = VARIABLE_TO_MEASURE[variableName];
    const { confidence, confidenceLabel } = confidenceFromWeek(acc.latestSurveyWeek);

    results.push({
      contractId,
      variableName,
      measureDisplayName,
      measureNormalized: normalizeMeasureName(measureDisplayName),
      reportingYear: acc.reportingYear,
      rate,
      respondentCount: acc.respondentCount,
      latestSurveyWeek: acc.latestSurveyWeek,
      modeCount: acc.modeCount,
      confidence,
      confidenceLabel,
    });
  }

  return results.sort(
    (left, right) =>
      left.contractId.localeCompare(right.contractId) ||
      left.measureDisplayName.localeCompare(right.measureDisplayName)
  );
}

const PART_D_MEASURES = new Set([
  "getting needed prescription drugs",
  "rating of drug plan",
]);

/**
 * Convert aggregated CAHPS rates into projection records. The current rate IS
 * the projected score (no glidepath/year-end modeling for CAHPS); confidence
 * reflects how close the latest survey week is to the week-22 close.
 */
export function buildCahpsProjections(rates: CahpsMeasureRate[]): GlidepathProjection[] {
  return rates.map((rate) => {
    // Resolve to the canonical measure (display name, "(Part C)"-suffixed
    // normalized name, code, category) so CAHPS projections key the same way as
    // every other measure in the analysis universe.
    const resolved = resolveMeasure(rate.measureDisplayName);
    const metricCategory =
      resolved.metricCategory !== "Other"
        ? resolved.metricCategory
        : PART_D_MEASURES.has(rate.measureNormalized)
          ? "Part D"
          : "Part C";

    return {
      contractId: rate.contractId,
      measureName: resolved.displayName,
      measureDisplayName: resolved.displayName,
      measureNormalized: resolved.normalizedName,
      measureCode: resolved.measureCode,
      hlCode: null,
      metricCategory,
      measureType: "cahps",
      projectedScore: rate.rate,
      modelScore: rate.rate,
      confidence: rate.confidence,
      confidenceLabel: rate.confidenceLabel,
      trendSlope: null,
      seasonalityDelta: null,
      lastObservedYear: rate.reportingYear,
      lastObservedMonth: rate.latestSurveyWeek,
      lastObservedScore: rate.rate,
      supportingPoints: rate.respondentCount,
      notes: [
        `Current CAHPS rate through survey week ${rate.latestSurveyWeek} (${rate.respondentCount} respondents across ${rate.modeCount} mode${rate.modeCount === 1 ? "" : "s"}).`,
        "Current rate, not a year-end projection; rates firm up toward survey week 22.",
      ],
    };
  });
}
