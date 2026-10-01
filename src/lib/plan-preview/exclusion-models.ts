import { toBaselineMeasureCode } from "./measure-resolve";

export type ExclusionMeasure = {
  code: string;
  name: string;
  /**
   * Normalized measure name. All 30 matches on this, because CMS reuses
   * measure codes from year to year.
   */
  normalized?: string;
  /** File code for the stars year, used only to keep the Part C/D prefix. */
  fileCode?: string;
  /** Why the measure is on the All 30 list. */
  theory?: string;
  basis?: string;
};

export type ExclusionModelId = "cms" | "statutory" | "notice" | "clover" | "combined" | "all30";

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

function scoredCode(measure: ExclusionMeasure, baselineYear: number): string {
  if (!measure.normalized) return measure.code;
  return toBaselineMeasureCode(measure.normalized, measure.fileCode ?? measure.code, baselineYear);
}

function codesOf(measures: readonly ExclusionMeasure[], baselineYear = 2026): string[] {
  return [...new Set(measures.map((measure) => scoredCode(measure, baselineYear)))];
}

/** Removal codes for one model. Named measures resolve against the baseline year. */
export function exclusionRemovalCodes(model: ExclusionModel, baselineYear: number): string[] {
  return codesOf(model.measures, baselineYear);
}

type NamedExclusion = ExclusionMeasure & { normalized: string; fileCode: string };

function named(
  fileCode: string,
  name: string,
  normalized: string,
  theory: string,
  basis: string,
): NamedExclusion {
  return { code: fileCode, fileCode, name, normalized, theory, basis };
}

/**
 * Thirty measures challenged together. Each row is matched by measure name.
 * Medication Therapy Management stays.
 */
export const ALL_THIRTY_EXCLUSIONS: NamedExclusion[] = [
  named("C03", "Annual Flu Vaccine", "annual flu vaccine partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C04", "Improving or Maintaining Physical Health", "improving or maintaining physical health partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C05", "Improving or Maintaining Mental Health", "improving or maintaining mental health partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C07", "Special Needs Plan (SNP) Care Management", "special needs plan snp care management partc", "Unauthorized data source", "Strong Clover extension"),
  named("C15", "Reducing the Risk of Falling", "reducing the risk of falling partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C16", "Improving Bladder Control", "improving bladder control partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C22", "Getting Needed Care", "getting needed care partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C23", "Getting Appointments and Care Quickly", "getting appointments and care quickly partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C24", "Customer Service", "customer service partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C25", "Rating of Health Care Quality", "rating of health care quality partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C27", "Care Coordination", "care coordination partc", "Notice-and-comment", "Clover already held unlawful"),
  named("C28", "Complaints about the Health Plan", "complaints about the health plan partc", "Unauthorized data source", "Strong Clover extension"),
  named("C29", "Members Choosing to Leave the Plan", "members choosing to leave the plan partc", "Unauthorized data source", "Strong Clover extension"),
  named("C30", "Health Plan Quality Improvement", "health plan quality improvement partc", "Derivative unlawfulness", "Recalculation/remedy challenge"),
  named("C31", "Plan Makes Timely Decisions about Appeals", "plan makes timely decisions about appeals partc", "Unauthorized data source", "Very strong Clover extension"),
  named("C32", "Reviewing Appeals Decisions", "reviewing appeals decisions partc", "Unauthorized data source", "Clover already held unlawful"),
  named("C33", "Call Center – Foreign Language Interpreter and TTY Availability (Part C)", "call center foreign language interpreter and tty availability partc", "Unauthorized data source", "Clover already held unlawful"),
  named("D01", "Call Center – Foreign Language Interpreter and TTY Availability (Part D)", "call center foreign language interpreter and tty availability partd", "Unauthorized data source", "Clover already held unlawful"),
  named("D02", "Complaints about the Drug Plan", "complaints about the drug plan partd", "Unauthorized Part D data", "Strong Clover extension"),
  named("D03", "Members Choosing to Leave the Plan (Part D)", "members choosing to leave the plan partd", "Unauthorized Part D data", "Strong Clover extension"),
  named("D04", "Drug Plan Quality Improvement", "drug plan quality improvement partd", "Derivative unlawfulness", "Recalculation/remedy challenge"),
  named("D05", "Rating of Drug Plan", "rating of drug plan partd", "Part D CAHPS not collected under §1852(e)", "Clover already held unlawful"),
  named("D06", "Getting Needed Prescription Drugs", "getting needed prescription drugs partd", "Part D CAHPS not collected under §1852(e)", "Clover already held unlawful"),
  named("D07", "Medicare Plan Finder Price Accuracy", "mpf price accuracy partd", "PDE/MPF data outside §1852(e)", "Strong Clover extension"),
  named("D08", "Medication Adherence for Diabetes Medications", "medication adherence for diabetes medications partd", "PDE data outside §1852(e)", "Clover already held unlawful"),
  named("D09", "Medication Adherence for Hypertension (RAS Antagonists)", "medication adherence for hypertension ras antagonists partd", "PDE data outside §1852(e)", "Clover already held unlawful"),
  named("D10", "Medication Adherence for Cholesterol (Statins)", "medication adherence for cholesterol statins partd", "PDE data outside §1852(e)", "Clover already held unlawful"),
  named("D11", "Statin Use in Persons with Diabetes (SUPD)", "statin use in persons with diabetes supd partd", "PDE data outside §1852(e)", "Clover already held unlawful"),
  named("D12", "Concurrent Use of Opioids and Benzodiazepines (COB)", "concurrent use of opioids and benzodiazepines cob", "PDE data outside §1852(e)", "New 2027; very direct Clover extension"),
  named("D13", "Polypharmacy: Use of Multiple Anticholinergic Medications in Older Adults (Poly-ACH)", "polypharmacy use of multiple anticholinergic medications in older adults poly ach", "PDE data outside §1852(e)", "New 2027; very direct Clover extension"),
];

const cloverMeasures = [...CLOVER_STATUTORY_EXCLUSIONS, ...CLOVER_NOTICE_EXCLUSIONS];

function unionMeasures(...groups: ExclusionMeasure[][]): ExclusionMeasure[] {
  const byCode = new Map<string, ExclusionMeasure>();
  for (const group of groups) {
    for (const measure of group) {
      if (!byCode.has(measure.code)) byCode.set(measure.code, measure);
    }
  }
  return [...byCode.values()];
}

const combinedMeasures = unionMeasures(CMS_RECALC_EXCLUSIONS, cloverMeasures);

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
  {
    id: "combined",
    label: "CMS recalc and all Clover",
    shortLabel: "CMS + Clover",
    measures: combinedMeasures,
    codes: codesOf(combinedMeasures),
  },
  {
    id: "all30",
    label: "All 30 challenged measures",
    shortLabel: "All 30",
    measures: ALL_THIRTY_EXCLUSIONS,
    codes: codesOf(ALL_THIRTY_EXCLUSIONS),
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
    { category: "CMS recalc and all Clover", codes: [...new Set([...cms, ...clover])].sort(byCode) },
  ];
}

function byCode(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true });
}
