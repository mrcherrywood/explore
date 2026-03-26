import { readFileSync } from "node:fs";

import * as XLSX from "xlsx";

import type { MeasureCutPoint, MeasureStarRating } from "@/lib/percentile-analysis/measure-likelihood-types";

const MANUAL_CP_TO_NORM: Record<string, string> = {
  "Glycemic Status Diabetes - GSD": "blood sugar controlled",
  "COA - Medication Review": "care for older adults medication review",
  "COA - Pain Assessment": "care for older adults pain assessment",
  "Call Center - FFI / TTY (Part C)": "call center foreign language interpreter and tty availability partc",
  "Call Center - FFI / TTY (Part D)": "call center foreign language interpreter and tty availability partd",
  "Getting Appts and Care Quickly": "getting appointments and care quickly",
  "Getting Needed RX Drugs": "getting needed prescription drugs",
  "Med Adh for Cholesterol": "medication adherence for cholesterol (statins)",
  "Med Adh for Diabetes Meds": "medication adherence for diabetes medications",
  "Med Adh for Hypertension": "medication adherence for hypertension (ras antagonists)",
  "Med Rec Post-Discharge": "medication reconciliation post-discharge",
  "MTM Program Comp Rate-CMR": "mtm program completion rate for cmr",
  "Osteo Mgmt in Women W Fracture": "osteoporosis management in women who had a fracture",
  "Plan Makes Timely Decs - Appeals": "plan makes timely decisions about appeals",
  "Statin Therapy-Patients with CVD": "statin therapy for patients with cardiovascular disease",
  "Statin Use with Diabetes (Part D)": "statin use in persons with diabetes (supd)",
  "SNP Care Management": "special needs plan (snp) care management",
  "Members Choosing to Leave": "members choosing to leave the plan",
  "Controlling Blood Pressure": "controlling",
  "Transitions of Care (Average)": "transitions of care",
  "Follow-up after Emergency Department Visit for Patients with Multiple Chronic Conditions (FMC)":
    "follow-up after emergency department visit",
  "Kidney Health Evaluation for Patients With Diabetes": "kidney disease monitoring",
  "KED (Kidney Health Evaluation for Patients with Diabetes)": "kidney health evaluation for patients with diabetes",
  "Plan All Cause Readmissions": "plan all-cause readmissions",
};

const INVERTED_KEYWORDS = ["complaint", "choosing to leave", "readmission"];

type RawCutPointRow = {
  HLCode?: string | null;
  MeasureName?: string | null;
  Domain?: string | null;
  StarsYear?: number | string | null;
  ["2Star"]?: number | string | null;
  ["3Star"]?: number | string | null;
  ["4Star"]?: number | string | null;
  ["5Star"]?: number | string | null;
  Weight?: number | string | null;
};

export function normalizeMeasureName(value: string) {
  return value
    .replace(/^[CD]\d+:\s*/i, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\bpart\s+([a-z])\b/gi, "part$1")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isInvertedMeasure(name: string) {
  const normalized = name.toLowerCase();
  return INVERTED_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getAliasesForCutPoint(measureName: string) {
  const normalized = normalizeMeasureName(measureName);
  const manual = MANUAL_CP_TO_NORM[measureName] ? normalizeMeasureName(MANUAL_CP_TO_NORM[measureName]) : "";
  return [normalized, manual].filter((alias): alias is string => Boolean(alias));
}

function respectsSpecialCases(alias: string, measureNorm: string, codePrefix: string | null) {
  if (alias.includes("call center")) {
    if (codePrefix === "C" && (alias.includes("partd") || alias.includes("part d"))) return false;
    if (codePrefix === "D" && (alias.includes("partc") || alias.includes("part c"))) return false;
  }

  if (alias.includes("members choosing") && (measureNorm.includes("partd") || measureNorm.includes("part d"))) {
    return false;
  }

  return true;
}

export function matchCutPointToMeasureName(
  measureName: string,
  codePrefix: string | null,
  cutPoints: MeasureCutPoint[]
) {
  const measureNorm = normalizeMeasureName(measureName);

  for (const cutPoint of cutPoints) {
    const aliases = getAliasesForCutPoint(cutPoint.measureName);
    if (
      aliases.some((alias) => {
        if (!respectsSpecialCases(alias, measureNorm, codePrefix)) return false;
        return alias.includes(measureNorm) || measureNorm.includes(alias);
      })
    ) {
      return cutPoint;
    }
  }

  return null;
}

export function deriveMeasureStarRating(score: number, cutPoint: MeasureCutPoint, inverted: boolean): MeasureStarRating {
  const { thresholds } = cutPoint;

  if (inverted) {
    if (score <= thresholds.fiveStar) return 5;
    if (score <= thresholds.fourStar) return 4;
    if (score <= thresholds.threeStar) return 3;
    if (score <= thresholds.twoStar) return 2;
    return 1;
  }

  if (score >= thresholds.fiveStar) return 5;
  if (score >= thresholds.fourStar) return 4;
  if (score >= thresholds.threeStar) return 3;
  if (score >= thresholds.twoStar) return 2;
  return 1;
}

export function loadMeasureCutPoints(workbookPath: string, supportedYears: number[]) {
  const workbook = XLSX.read(readFileSync(workbookPath), { type: "buffer", cellDates: true });
  const worksheet = workbook.Sheets["Cut Points"];
  if (!worksheet) {
    throw new Error('Cut points workbook is missing the "Cut Points" sheet.');
  }

  const rows = XLSX.utils.sheet_to_json<RawCutPointRow>(worksheet, { defval: null });
  const byYear = new Map<number, MeasureCutPoint[]>();

  for (const row of rows) {
    const year = toNumber(row.StarsYear);
    const measureName = typeof row.MeasureName === "string" ? row.MeasureName.trim() : "";
    const twoStar = toNumber(row["2Star"]);
    const threeStar = toNumber(row["3Star"]);
    const fourStar = toNumber(row["4Star"]);
    const fiveStar = toNumber(row["5Star"]);
    if (!year || !supportedYears.includes(year) || !measureName || twoStar === null || threeStar === null || fourStar === null || fiveStar === null) {
      continue;
    }

    const entry: MeasureCutPoint = {
      hlCode: typeof row.HLCode === "string" ? row.HLCode.trim() : "",
      measureName,
      domain: typeof row.Domain === "string" ? row.Domain.trim() : null,
      year,
      weight: toNumber(row.Weight),
      thresholds: {
        oneStarUpperBound: null,
        twoStar,
        threeStar,
        fourStar,
        fiveStar,
      },
    };

    const current = byYear.get(year) ?? [];
    current.push(entry);
    byYear.set(year, current);
  }

  return byYear;
}
