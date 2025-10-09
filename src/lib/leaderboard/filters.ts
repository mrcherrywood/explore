import { ENROLLMENT_LEVELS, type EnrollmentLevelId } from "@/lib/peer/enrollment-levels";

export const PLAN_TYPES = ["ALL", "SNP", "NOT"] as const;
export const PLAN_TYPE_SET = new Set(PLAN_TYPES);

export const CONTRACT_SERIES = ["H_ONLY", "S_ONLY"] as const;
export const CONTRACT_SERIES_SET = new Set(CONTRACT_SERIES);

export const STATE_OPTIONS = ["all", "state"] as const;
export const STATE_OPTION_SET = new Set(STATE_OPTIONS);

export const VALID_ENROLLMENT_LEVELS = new Set<EnrollmentLevelId>(
  ENROLLMENT_LEVELS.map((level) => level.id)
);
