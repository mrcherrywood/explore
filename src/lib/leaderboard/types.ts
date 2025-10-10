import type { EnrollmentLevelId } from "@/lib/peer/enrollment-levels";

export type LeaderboardMode = "contract" | "organization";

export type ContractLeaderboardSelection = {
  stateOption: "all" | "state";
  state?: string;
  planTypeGroup: "ALL" | "SNP" | "NOT";
  enrollmentLevel: EnrollmentLevelId;
  contractSeries: "H_ONLY" | "S_ONLY";
  topLimit?: number;
  blueOnly?: boolean;
};

export type OrganizationBucket = "all" | "lt5" | "5to10" | "10to20" | "20plus";

export type OrganizationLeaderboardSelection = {
  bucket: OrganizationBucket;
  topLimit?: number;
  blueOnly?: boolean;
};

export type LeaderboardRequest = {
  mode: LeaderboardMode;
  selection: ContractLeaderboardSelection | OrganizationLeaderboardSelection;
  includeMeasures?: boolean;
  topLimit?: number;
};

export type LeaderboardEntry = {
  entityId: string;
  entityLabel: string;
  parentOrganization?: string | null;
  contractId?: string;
  dominantState?: string | null;
  dominantShare?: number | null;
  stateEligible?: boolean;
  totalEnrollment?: number | null;
  value: number | null;
  valueLabel: string;
  priorValue: number | null;
  priorLabel: string;
  delta: number | null;
  deltaLabel: string;
  rank: number;
  reportYear: number | null;
  priorYear: number | null;
  metadata?: Record<string, unknown>;
  isBlueCrossBlueShield?: boolean | null;
};

export type LeaderboardSection = {
  key: string;
  title: string;
  metricType: "stars" | "rate";
  unitLabel: string;
  direction: "higher" | "lower";
  topPerformers: LeaderboardEntry[];
  biggestMovers: LeaderboardEntry[];
  biggestDecliners: LeaderboardEntry[];
};

export type ContractLeaderboardFilters = ContractLeaderboardSelection & { mode: "contract" };

export type OrganizationLeaderboardFilters = OrganizationLeaderboardSelection & { mode: "organization" };

export type LeaderboardResponse = {
  generatedAt: string;
  mode: LeaderboardMode;
  filters: ContractLeaderboardFilters | OrganizationLeaderboardFilters;
  dataYear: number | null;
  priorYear: number | null;
  sections: LeaderboardSection[];
  diagnostics?: Record<string, unknown>;
};
