/**
 * Measure Removal Definitions
 *
 * Defines which measures CMS has announced will be retired in specific
 * future star rating years. Used by the reward factor overview to project
 * thresholds when 2028/2029 are selected.
 */

export type MeasureRemovalDef = {
  code: string;
  name: string;
};

export type MeasureRemovalYear = {
  year: number;
  label: string;
  sourceYear: number;
  removedCodes: Set<string>;
  removedMeasures: MeasureRemovalDef[];
};

export const MEASURE_REMOVAL_YEARS: MeasureRemovalYear[] = [
  {
    year: 2028,
    label: "Stars 2028 (Projected)",
    sourceYear: 2026,
    removedCodes: new Set(["C33", "D01", "C19"]),
    removedMeasures: [
      { code: "C33", name: "Call Center – Foreign Language Interpreter and TTY Availability (Part C)" },
      { code: "D01", name: "Call Center – Foreign Language Interpreter and TTY Availability (Part D)" },
      { code: "C19", name: "Statin Therapy for Patients with Cardiovascular Disease" },
    ],
  },
  {
    year: 2029,
    label: "Stars 2029 (Projected)",
    sourceYear: 2026,
    removedCodes: new Set([
      "C33", "D01", "C19",
      "C31", "C32", "C07", "C28", "D02", "D07", "C29", "D03", "C24", "C25",
    ]),
    removedMeasures: [
      { code: "C33", name: "Call Center – Foreign Language Interpreter and TTY Availability (Part C)" },
      { code: "D01", name: "Call Center – Foreign Language Interpreter and TTY Availability (Part D)" },
      { code: "C19", name: "Statin Therapy for Patients with Cardiovascular Disease" },
      { code: "C31", name: "Plan Makes Timely Decisions about Appeals" },
      { code: "C32", name: "Reviewing Appeals Decisions" },
      { code: "C07", name: "Special Needs Plan (SNP) Care Management" },
      { code: "C28", name: "Complaints about the Health Plan" },
      { code: "D02", name: "Complaints about the Drug Plan" },
      { code: "D07", name: "Medicare Plan Finder Price Accuracy" },
      { code: "C29", name: "Members Choosing to Leave the Plan (Part C)" },
      { code: "D03", name: "Members Choosing to Leave the Plan (Part D)" },
      { code: "C24", name: "Customer Service" },
      { code: "C25", name: "Rating of Health Care Quality" },
    ],
  },
];

export function getMeasureRemovalForYear(year: number): MeasureRemovalYear | null {
  return MEASURE_REMOVAL_YEARS.find((r) => r.year === year) ?? null;
}

export function isProjectedYear(year: number): boolean {
  return MEASURE_REMOVAL_YEARS.some((r) => r.year === year);
}

export function getAllAvailableYears(backtestYears: number[]): number[] {
  const projectedYears = MEASURE_REMOVAL_YEARS.map((r) => r.year);
  return [...backtestYears, ...projectedYears].sort((a, b) => b - a);
}
