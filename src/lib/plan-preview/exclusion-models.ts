export type ExclusionMeasure = {
  code: string;
  name: string;
};

export type ExclusionModelId = "cms" | "statutory" | "notice" | "clover";

/** CMS June 2026 industry-wide recalculation. Stars 2027 Poly-ACH (D13) is not on this list. */
export const CMS_RECALC_EXCLUSIONS: ExclusionMeasure[] = [
  { code: "C07", name: "Special Needs Plan (SNP) Care Management" },
  { code: "C28", name: "Complaints about the Health Plan" },
  { code: "C29", name: "Members Choosing to Leave the Plan" },
  { code: "C31", name: "Plan Makes Timely Decisions about Appeals" },
  { code: "C32", name: "Reviewing Appeals Decisions" },
  { code: "C33", name: "Call Center – Foreign Language Interpreter and TTY Availability" },
  { code: "D01", name: "Call Center – Foreign Language Interpreter and TTY Availability" },
  { code: "D02", name: "Complaints about the Drug Plan" },
  { code: "D03", name: "Members Choosing to Leave the Plan" },
  { code: "D04", name: "Drug Plan Quality Improvement" },
  { code: "D05", name: "Rating of Drug Plan" },
  { code: "D06", name: "Getting Needed Prescription Drugs" },
  { code: "D07", name: "Medicare Plan Finder Price Accuracy" },
  { code: "D08", name: "Medication Adherence for Diabetes Medications" },
  { code: "D09", name: "Medication Adherence for Hypertension (RAS Antagonists)" },
  { code: "D10", name: "Medication Adherence for Cholesterol (Statins)" },
  { code: "D11", name: "MTM Program Completion Rate for CMR" },
  { code: "D12", name: "Statin Use in Persons with Diabetes" },
];

/** Clover statutory-authority exclusions. */
export const CLOVER_STATUTORY_EXCLUSIONS: ExclusionMeasure[] = [
  { code: "C32", name: "Reviewing Appeals Decisions" },
  { code: "C33", name: "Call Center – Foreign Language Interpreter and TTY Availability" },
  { code: "D01", name: "Call Center – Foreign Language Interpreter and TTY Availability" },
  { code: "D05", name: "Rating of Drug Plan" },
  { code: "D06", name: "Getting Needed Prescription Drugs" },
  { code: "D08", name: "Medication Adherence for Diabetes Medications" },
  { code: "D09", name: "Medication Adherence for Hypertension" },
  { code: "D10", name: "Medication Adherence for Cholesterol" },
  { code: "D11", name: "Medication Therapy Management Completion" },
  { code: "D12", name: "Statin Use in Persons with Diabetes" },
];

/** Clover notice-and-comment exclusions. */
export const CLOVER_NOTICE_EXCLUSIONS: ExclusionMeasure[] = [
  { code: "C03", name: "Annual Flu Vaccine" },
  { code: "C04", name: "Improving or Maintaining Physical Health" },
  { code: "C05", name: "Improving or Maintaining Mental Health" },
  { code: "C15", name: "Reducing the Risk of Falling" },
  { code: "C16", name: "Improving Bladder Control" },
  { code: "C22", name: "Getting Needed Care" },
  { code: "C23", name: "Getting Appointments and Care Quickly" },
  { code: "C24", name: "Customer Service" },
  { code: "C25", name: "Rating of Health Care Quality" },
  { code: "C27", name: "Care Coordination" },
];

export type ExclusionModel = {
  id: ExclusionModelId;
  label: string;
  shortLabel: string;
  measures: ExclusionMeasure[];
  codes: string[];
};

function codesOf(measures: readonly ExclusionMeasure[]): string[] {
  return measures.map((measure) => measure.code);
}

const cloverMeasures = [...CLOVER_STATUTORY_EXCLUSIONS, ...CLOVER_NOTICE_EXCLUSIONS];

export const EXCLUSION_MODELS: ExclusionModel[] = [
  {
    id: "cms",
    label: "CMS 2026 industry-wide recalculation",
    shortLabel: "CMS recalc",
    measures: CMS_RECALC_EXCLUSIONS,
    codes: codesOf(CMS_RECALC_EXCLUSIONS),
  },
  {
    id: "statutory",
    label: "Clover statutory authority",
    shortLabel: "Statutory",
    measures: CLOVER_STATUTORY_EXCLUSIONS,
    codes: codesOf(CLOVER_STATUTORY_EXCLUSIONS),
  },
  {
    id: "notice",
    label: "Clover notice and comment",
    shortLabel: "Notice",
    measures: CLOVER_NOTICE_EXCLUSIONS,
    codes: codesOf(CLOVER_NOTICE_EXCLUSIONS),
  },
  {
    id: "clover",
    label: "All Clover exclusions",
    shortLabel: "All Clover",
    measures: cloverMeasures,
    codes: codesOf(cloverMeasures),
  },
];

export type ExclusionCrosswalkRow = {
  category: string;
  codes: string[];
};

export function exclusionCrosswalk(): ExclusionCrosswalkRow[] {
  const cms = new Set(codesOf(CMS_RECALC_EXCLUSIONS));
  const clover = new Set(codesOf(cloverMeasures));
  const both = [...cms].filter((code) => clover.has(code)).sort(byCode);
  const cmsOnly = [...cms].filter((code) => !clover.has(code)).sort(byCode);
  const cloverOnly = [...clover].filter((code) => !cms.has(code)).sort(byCode);
  return [
    { category: "Excluded by both CMS and Clover", codes: both },
    { category: "Excluded by CMS, but not Clover", codes: cmsOnly },
    { category: "Excluded by Clover, but not the CMS recalculation", codes: cloverOnly },
    { category: "Total CMS exclusions", codes: [...cms].sort(byCode) },
    { category: "Total Clover exclusions", codes: [...clover].sort(byCode) },
  ];
}

function byCode(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true });
}
