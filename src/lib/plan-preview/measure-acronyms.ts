/**
 * Short measure acronyms for Plan Preview scenario copy. Keys are Stars 2026
 * baseline codes — the same coding scenario removal sets use after
 * toBaselineMeasureCode translation.
 */
const MEASURE_ACRONYMS_BY_CODE: Record<string, string> = {
  C07: "SNP",
  C09: "COA",
  C17: "MRP",
  C19: "SPC",
  C24: "CS",
  C25: "HCQ",
  C28: "Complaints (C)",
  C29: "MCL (C)",
  C30: "QI (C)",
  C31: "Timely Appeals",
  C32: "Review Appeals",
  C33: "Call Center (C)",
  D01: "Call Center (D)",
  D02: "Complaints (D)",
  D03: "MCL (D)",
  D04: "QI (D)",
  D05: "DR",
  D06: "GNPD",
  D07: "MPF",
  D08: "Diabetes Adherence",
  D09: "Hypertension Adherence",
  D10: "Cholesterol Adherence",
  D11: "MTM",
  D12: "SUPD",
};

/** Acronym for a baseline measure code; falls back to the code itself. */
export function measureAcronym(code: string): string {
  const upper = code.toUpperCase();
  return MEASURE_ACRONYMS_BY_CODE[upper] ?? upper;
}

export function formatMeasureAcronyms(codes: string[]): string {
  return codes.map(measureAcronym).join(", ");
}
