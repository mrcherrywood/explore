export const SUPPORTED_ENROLLMENT_YEARS = [2026, 2025] as const;

export const DEFAULT_ENROLLMENT_YEAR = SUPPORTED_ENROLLMENT_YEARS[0];

export type SupportedEnrollmentYear = (typeof SUPPORTED_ENROLLMENT_YEARS)[number];

export function isSupportedEnrollmentYear(value: number | null | undefined): value is SupportedEnrollmentYear {
  if (value === null || value === undefined) {
    return false;
  }
  return SUPPORTED_ENROLLMENT_YEARS.includes(value as SupportedEnrollmentYear);
}
