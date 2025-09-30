export type EnrollmentLevelId =
  | "all"
  | "<1k"
  | "1-10k"
  | "10-25k"
  | "25-100k"
  | "100-250k"
  | ">250k"
  | "null";

export type EnrollmentLevel = {
  id: EnrollmentLevelId;
  label: string;
  min?: number;
  max?: number;
};

export const ENROLLMENT_LEVELS: EnrollmentLevel[] = [
  { id: "all", label: "All Enrollment Levels" },
  { id: "<1k", label: "< 1k", min: 0, max: 999 },
  { id: "1-10k", label: "1k - 9.9k", min: 1000, max: 9999 },
  { id: "10-25k", label: "10k - 24.9k", min: 10000, max: 24999 },
  { id: "25-100k", label: "25k - 99.9k", min: 25000, max: 99999 },
  { id: "100-250k", label: "100k - 249.9k", min: 100000, max: 249999 },
  { id: ">250k", label: "> 250k", min: 250000 },
  { id: "null", label: "Suppressed / Unknown" },
];

export function getEnrollmentLevel(total: number | null | undefined): EnrollmentLevelId {
  if (total === null || total === undefined) {
    return "null";
  }

  for (const bucket of ENROLLMENT_LEVELS) {
    if (bucket.id === "null" || bucket.id === "all") continue;
    const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = bucket;
    if (total >= min && total <= max) {
      return bucket.id;
    }
  }

  return ">250k";
}

export function formatEnrollment(total: number | null | undefined): string {
  if (total === null || total === undefined) {
    return "Suppressed";
  }
  if (total >= 1000000) {
    return `${(total / 1000000).toFixed(1)}M`;
  }
  if (total >= 1000) {
    return `${(total / 1000).toFixed(1)}k`;
  }
  return total.toLocaleString();
}
