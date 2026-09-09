const INVERTED_KEYWORDS = [
  "complaint",
  "choosing to leave",
  "readmission",
  "anticholinerg", // Poly-ACH / Poly Rx Multi-Anticholinergics (lower is better)
  "opioid", // Concurrent Use of Opioids and Benzodiazepines (COB)
  "opiod", // workbook spelling
  "benzo",
];

/** True when a higher numeric score is worse (Complaints, MCL, readmissions, etc.). */
export function isInvertedMeasure(name: string) {
  const normalized = name.toLowerCase();
  return INVERTED_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
