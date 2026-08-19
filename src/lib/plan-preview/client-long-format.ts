import { normalizeMeasureName } from "@/lib/percentile-analysis/measure-matching";
import { loadContractMetadata, type ContractMetadata } from "@/lib/reward-factor/backtest";

import { resolveMeasureForPlanPreview } from "./measure-resolve";
import type { ParsedPlanPreviewMeasureScore, PlanPreviewMeasureParseResult } from "./types";
import { classifyMeasureValue, isComplaintRateMeasure } from "./workbook";

const CONTRACT_ID_PATTERN = /^[HRS]\d{4}$/;

type MeasureTarget = { code: string; name: string };
type LongFormatMapping =
  | { kind: "skip" }
  | { kind: "measure"; target: MeasureTarget }
  | { kind: "twin"; first: MeasureTarget; second: MeasureTarget };

/**
 * Official SY2027 PP1 names. Client extracts omit codes and use shorthand
 * (ECDS, Adjusted PCR, TOC Average, Part C/D Call Center, …).
 */
const LONG_FORMAT_MEASURES: Record<string, LongFormatMapping> = {
  "breast cancer screening": { kind: "measure", target: { code: "C01", name: "Breast Cancer Screening" } },
  "colorectal cancer screening": { kind: "measure", target: { code: "C02", name: "Colorectal Cancer Screening" } },
  "colorectal cancer screening ecds": { kind: "measure", target: { code: "C02", name: "Colorectal Cancer Screening" } },
  "annual flu vaccine": { kind: "measure", target: { code: "C03", name: "Annual Flu Vaccine" } },
  "improving or maintaining physical health": {
    kind: "measure",
    target: { code: "C04", name: "Improving or Maintaining Physical Health" },
  },
  "improving or maintaining mental health": {
    kind: "measure",
    target: { code: "C05", name: "Improving or Maintaining Mental Health" },
  },
  "monitoring physical activity": { kind: "measure", target: { code: "C06", name: "Monitoring Physical Activity" } },
  "special needs plan snp care management": {
    kind: "measure",
    target: { code: "C07", name: "Special Needs Plan (SNP) Care Management" },
  },
  "care for older adults medication review": {
    kind: "measure",
    target: { code: "C08", name: "Care for Older Adults - Medication Review" },
  },
  "care for older adults functional status assessment": {
    kind: "measure",
    target: { code: "C09", name: "Care for Older Adults - Functional Status Assessment" },
  },
  "osteoporosis management in women who had a fracture": {
    kind: "measure",
    target: { code: "C10", name: "Osteoporosis Management in Women who had a Fracture" },
  },
  "diabetes care eye exam": { kind: "measure", target: { code: "C11", name: "Diabetes Care - Eye Exam" } },
  "diabetes care blood sugar controlled": {
    kind: "measure",
    target: { code: "C12", name: "Diabetes Care - Blood Sugar Controlled" },
  },
  "kidney health evaluation for patients with diabetes": {
    kind: "measure",
    target: { code: "C13", name: "Kidney Health Evaluation for Patients with Diabetes" },
  },
  "controlling high blood pressure": {
    kind: "measure",
    target: { code: "C14", name: "Controlling High Blood Pressure" },
  },
  "reducing the risk of falling": { kind: "measure", target: { code: "C15", name: "Reducing the Risk of Falling" } },
  "improving bladder control": { kind: "measure", target: { code: "C16", name: "Improving Bladder Control" } },
  "plan all cause readmissions": { kind: "measure", target: { code: "C17", name: "Plan All-Cause Readmissions" } },
  "adjusted plan all cause readmissions": {
    kind: "measure",
    target: { code: "C17", name: "Plan All-Cause Readmissions" },
  },
  "statin therapy for patients with cardiovascular disease": {
    kind: "measure",
    target: { code: "C18", name: "Statin Therapy for Patients with Cardiovascular Disease" },
  },
  "transitions of care": { kind: "measure", target: { code: "C19", name: "Transitions of Care" } },
  "transitions of care average": { kind: "measure", target: { code: "C19", name: "Transitions of Care" } },
  "follow up after ed patients with multiple chronic conditions": {
    kind: "measure",
    target: {
      code: "C20",
      name: "Follow-up after Emergency Department Visit for People with Multiple High-Risk Chronic Conditions",
    },
  },
  "getting needed care": { kind: "measure", target: { code: "C21", name: "Getting Needed Care" } },
  "getting appointments and care quickly": {
    kind: "measure",
    target: { code: "C22", name: "Getting Appointments and Care Quickly" },
  },
  "customer service": { kind: "measure", target: { code: "C23", name: "Customer Service" } },
  "rating of health care quality": { kind: "measure", target: { code: "C24", name: "Rating of Health Care Quality" } },
  "rating of health plan": { kind: "measure", target: { code: "C25", name: "Rating of Health Plan" } },
  "care coordination": { kind: "measure", target: { code: "C26", name: "Care Coordination" } },
  "complaints about the plan": {
    kind: "twin",
    first: { code: "C27", name: "Complaints about the Health Plan" },
    second: { code: "D02", name: "Complaints about the Drug Plan" },
  },
  "members choosing to leave the plan": {
    kind: "twin",
    first: { code: "C28", name: "Members Choosing to Leave the Plan" },
    second: { code: "D03", name: "Members Choosing to Leave the Plan" },
  },
  "plan makes timely decisions about appeals": {
    kind: "measure",
    target: { code: "C30", name: "Plan Makes Timely Decisions about Appeals" },
  },
  "reviewing appeals decisions": { kind: "measure", target: { code: "C31", name: "Reviewing Appeals Decisions" } },
  "partc call center foreign language interpreter and tty availability": {
    kind: "measure",
    target: { code: "C32", name: "Call Center - Foreign Language Interpreter and TTY Availability" },
  },
  "partd call center foreign language interpreter and tty availability": {
    kind: "measure",
    target: { code: "D01", name: "Call Center - Foreign Language Interpreter and TTY Availability" },
  },
  "rating of drug plan": { kind: "measure", target: { code: "D05", name: "Rating of Drug Plan" } },
  "getting needed prescription drugs": {
    kind: "measure",
    target: { code: "D06", name: "Getting Needed Prescription Drugs" },
  },
  "mpf price accuracy": { kind: "measure", target: { code: "D07", name: "MPF Price Accuracy" } },
  "mpf pricing accuracy": { kind: "measure", target: { code: "D07", name: "MPF Price Accuracy" } },
  "medication adherence for diabetes medications": {
    kind: "measure",
    target: { code: "D08", name: "Medication Adherence for Diabetes Medications" },
  },
  "medication adherence for hypertension ras antagonists": {
    kind: "measure",
    target: { code: "D09", name: "Medication Adherence for Hypertension (RAS antagonists)" },
  },
  "medication adherence for cholesterol statins": {
    kind: "measure",
    target: { code: "D10", name: "Medication Adherence for Cholesterol (Statins)" },
  },
  "statin use in persons with diabetes": {
    kind: "measure",
    target: { code: "D11", name: "Statin Use in Persons with Diabetes (SUPD)" },
  },
  "statin use in persons with diabetes supd": {
    kind: "measure",
    target: { code: "D11", name: "Statin Use in Persons with Diabetes (SUPD)" },
  },
  "concurrent use of opioids and benzodiazepines": {
    kind: "measure",
    target: { code: "D12", name: "Concurrent Use of Opioids and Benzodiazepines (COB)" },
  },
  "use of multiple anticholinergic medications in older adults": {
    kind: "measure",
    target: {
      code: "D13",
      name: "Polypharmacy: Use of Multiple Anticholinergic Medications in Older Adults (Poly-ACH)",
    },
  },
  "transitions of care medication reconciliation post discharge": { kind: "skip" },
  "transitions of care patient engagement after inpatient discharge": { kind: "skip" },
  "transitions of care receipt of discharge information": { kind: "skip" },
  "transitions of care notification of inpatient admission": { kind: "skip" },
  "health plan quality improvement": { kind: "skip" },
  "drug plan quality improvement": { kind: "skip" },
};

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

function headerCellsOf(row: unknown[] | undefined): string[] {
  return (row ?? []).map((cell) => cleanCell(cell).toLowerCase());
}

function findLongFormatHeaderRow(rows: unknown[][]): number {
  for (let index = 0; index < Math.min(rows.length, 8); index += 1) {
    const headers = headerCellsOf(rows[index]);
    const hasContract = headers.some((cell) => cell === "contract" || cell === "contract id");
    const hasMeasure = headers.includes("measure");
    const hasRate = headers.some((cell) => cell === "pp1 rate" || cell === "rate");
    if (hasContract && hasMeasure && hasRate) return index;
  }
  return -1;
}

export function isClientLongFormat(rows: unknown[][]): boolean {
  return findLongFormatHeaderRow(rows) >= 0;
}

function resolveLongFormatMapping(measureName: string): LongFormatMapping {
  const normalized = normalizeMeasureName(measureName);
  const mapping = LONG_FORMAT_MEASURES[normalized];
  if (!mapping) {
    throw new Error(`Unrecognized client PP1 measure name: "${measureName}".`);
  }
  return mapping;
}

function loadPriorYearMetadata(year: number): Map<string, ContractMetadata> {
  try {
    return loadContractMetadata(year);
  } catch {
    return new Map();
  }
}

function scoredRow(
  sourceRowNumber: number,
  contractId: string,
  meta: ContractMetadata | undefined,
  target: MeasureTarget,
  rawValue: string
): ParsedPlanPreviewMeasureScore {
  const resolved = resolveMeasureForPlanPreview(target.code, target.name);
  const classified = classifyMeasureValue(rawValue, {
    measureCode: target.code,
    measureName: target.name,
  });
  // Client extracts store 0–1 rates; 1.00 means 100, not a one-point score.
  const score =
    classified.score === 1 && !isComplaintRateMeasure(target.code, target.name)
      ? 100
      : classified.score;
  const { status } = classified;
  return {
    sourceRowNumber,
    contractId,
    organizationMarketingName: meta?.organizationMarketingName ?? null,
    contractName: meta?.contractName ?? null,
    parentOrganization: meta?.parentOrganization ?? null,
    measureCode: target.code,
    measureName: target.name,
    measureDisplayName: resolved.displayName,
    measureNormalized: resolved.normalizedName,
    metricCategory: resolved.metricCategory === "Other" ? (target.code.startsWith("D") ? "Part D" : "Part C") : resolved.metricCategory,
    rawValue,
    score,
    status,
  };
}

export function parseClientLongFormat(
  rows: unknown[][],
  sheetName: string,
  priorYear = 2026
): PlanPreviewMeasureParseResult {
  const headerRowIndex = findLongFormatHeaderRow(rows);
  if (headerRowIndex < 0) {
    throw new Error('Could not find a Contract / Measure / PP1 Rate header row.');
  }

  const headers = headerCellsOf(rows[headerRowIndex]);
  const contractCol = headers.findIndex((cell) => cell === "contract" || cell === "contract id");
  const measureCol = headers.indexOf("measure");
  const rateCol = headers.findIndex((cell) => cell === "pp1 rate" || cell === "rate");
  const metadata = loadPriorYearMetadata(priorYear);
  const twinSeen = new Map<string, number>();
  const parsedRows: ParsedPlanPreviewMeasureScore[] = [];
  const contractIds = new Set<string>();
  const measureCodes = new Set<string>();
  let scoredCount = 0;

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const contractId = parseContractId(row[contractCol]);
    const measureName = cleanCell(row[measureCol]);
    const rawValue = cleanCell(row[rateCol]);
    if (!contractId || !measureName || !rawValue) continue;

    const mapping = resolveLongFormatMapping(measureName);
    if (mapping.kind === "skip") continue;

    let target: MeasureTarget;
    if (mapping.kind === "twin") {
      const key = `${contractId}|${normalizeMeasureName(measureName)}`;
      const seen = twinSeen.get(key) ?? 0;
      twinSeen.set(key, seen + 1);
      target = seen === 0 ? mapping.first : mapping.second;
    } else {
      target = mapping.target;
    }

    const parsed = scoredRow(rowIndex + 1, contractId, metadata.get(contractId), target, rawValue);
    if (parsed.status === "scored") scoredCount += 1;
    parsedRows.push(parsed);
    contractIds.add(contractId);
    measureCodes.add(parsed.measureCode);
  }

  return {
    fileType: "measure_data",
    sheetName,
    detectedStarsYear: null,
    rows: parsedRows,
    summary: {
      rowCount: parsedRows.length,
      contractCount: contractIds.size,
      measureCount: measureCodes.size,
      scoredCount,
    },
  };
}
