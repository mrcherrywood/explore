const INVERSE_KEYWORDS = [
  "members choosing to leave",
  "complaints about",
  "disenrollment",
  "leaving the plan",
  "plan makes it easy to leave",
];

const INVERSE_METRIC_CODES = new Set<string>([
  "C28",
  "C29",
  "C30",
  "D87",
  "D88",
  "D89",
]);

export function isInverseMeasure(label: string | null | undefined, code?: string | null | undefined): boolean {
  const normalizedLabel = (label ?? "").trim().toLowerCase();
  const normalizedCode = (code ?? "").trim().toUpperCase();

  if (normalizedLabel.length === 0 && normalizedCode.length === 0) {
    return false;
  }

  if (normalizedCode && INVERSE_METRIC_CODES.has(normalizedCode)) {
    return true;
  }

  return INVERSE_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword));
}
