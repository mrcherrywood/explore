/**
 * Short measure acronyms for Plan Preview scenario copy. Keys are Stars 2026
 * baseline codes — the same coding scenario removal sets use after
 * toBaselineMeasureCode translation.
 */
const MEASURE_ACRONYMS_BY_CODE: Record<string, string> = {
  C03: "Flu",
  C04: "Physical Health",
  C05: "Mental Health",
  C07: "SNP",
  C09: "COA",
  C15: "Falls",
  C16: "Bladder Control",
  C22: "Getting Needed Care",
  C23: "Getting Care Quickly",
  C27: "Care Coordination",
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

/**
 * A new measure whose file code already belongs to a different measure is
 * stored as `D:` plus its name. The Path to 4 report should show the measure,
 * not that internal key.
 */
export function nameKeyedMeasureLabel(code: string): { code: string; name: string } | null {
  if (!/^[CD]:/i.test(code)) return null;
  const name = code.slice(2).trim().toLowerCase();
  if (name.includes("opioid") || name.includes("benzo") || /\bcob\b/.test(name)) {
    return { code: "COB", name: "Concurrent Use of Opioids and Benzodiazepines (COB)" };
  }
  const readable = name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  return { code: readable, name: readable };
}

/** Acronym for a baseline measure code; falls back to the code itself. */
export function measureAcronym(code: string): string {
  const labeled = nameKeyedMeasureLabel(code);
  if (labeled) return labeled.code;
  const upper = code.toUpperCase();
  return MEASURE_ACRONYMS_BY_CODE[upper] ?? upper;
}

export function formatMeasureAcronyms(codes: string[]): string {
  return codes.map(measureAcronym).join(", ");
}
