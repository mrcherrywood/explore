import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ContractLandscapeRow } from "@/lib/leaderboard/data";
import type { ContractLeaderboardSelection } from "@/lib/leaderboard/types";
import { getEnrollmentLevel, type EnrollmentLevelId } from "@/lib/peer/enrollment-levels";

export type ServiceSupabaseClient = SupabaseClient<Database>;

export const DOMINANT_SHARE_THRESHOLD = 0.4;

export type ContractRecord = {
  contractId: string;
  contractName: string | null;
  marketingName: string | null;
  parentOrganization: string | null;
  dominantState: string | null;
  dominantShare: number | null;
  stateEligible: boolean;
  totalEnrollment: number | null;
  enrollmentLevel: EnrollmentLevelId;
  planTypeGroups: string[];
  isBlueCrossBlueShield: boolean;
};

export type MetricSnapshots = Map<string, { current: number | null; prior: number | null }>;

export type ContractSnapshots = {
  overall: MetricSnapshots;
  partC: MetricSnapshots;
  partD: MetricSnapshots;
  dataYear: number | null;
  priorYear: number | null;
};

type SummaryRow = Pick<
  Database["public"]["Tables"]["summary_ratings"]["Row"],
  | "contract_id"
  | "year"
  | "overall_rating_numeric"
  | "overall_rating"
  | "part_c_summary_numeric"
  | "part_c_summary"
  | "part_d_summary_numeric"
  | "part_d_summary"
>;

export function normalizeContractId(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function buildContractRecords(rows: ContractLandscapeRow[]): Map<string, ContractRecord> {
  const map = new Map<string, ContractRecord>();

  for (const row of rows) {
    const contractId = normalizeContractId(row.contract_id);
    if (!contractId) continue;

    const dominantState = row.dominant_state ? row.dominant_state.trim().toUpperCase() : null;
    const dominantShare = row.dominant_share ?? null;
    const totalEnrollment = row.total_enrollment ?? null;
    const planTypes = Array.isArray(row.plan_type_groups)
      ? row.plan_type_groups.map((value) => String(value).toUpperCase())
      : [];

    map.set(contractId, {
      contractId,
      contractName: row.contract_name ?? null,
      marketingName: row.organization_marketing_name ?? null,
      parentOrganization: row.parent_organization ?? null,
      dominantState,
      dominantShare,
      stateEligible: dominantShare !== null && dominantShare >= DOMINANT_SHARE_THRESHOLD,
      totalEnrollment,
      enrollmentLevel: getEnrollmentLevel(totalEnrollment),
      planTypeGroups: planTypes,
      isBlueCrossBlueShield: Boolean(row.is_blue_cross_blue_shield),
    });
  }

  return map;
}

export function filterContracts(
  contractRecords: Map<string, ContractRecord>,
  selection: ContractLeaderboardSelection
): ContractRecord[] {
  const { stateOption, state, planTypeGroup, enrollmentLevel, contractSeries, blueOnly } = selection;

  return Array.from(contractRecords.values()).filter((record) => {
    if (contractSeries === "H_ONLY" && !record.contractId.startsWith("H")) {
      return false;
    }

    if (contractSeries === "S_ONLY" && !record.contractId.startsWith("S")) {
      return false;
    }

    if (stateOption === "state") {
      if (!record.stateEligible) return false;
      if (!record.dominantState || record.dominantState !== state) return false;
    }

    if (planTypeGroup === "SNP" && !record.planTypeGroups.includes("SNP")) {
      return false;
    }

    if (planTypeGroup === "NOT" && !record.planTypeGroups.includes("NOT")) {
      return false;
    }

    if (enrollmentLevel !== "all" && record.enrollmentLevel !== enrollmentLevel) {
      return false;
    }

    if (blueOnly && !record.isBlueCrossBlueShield) {
      return false;
    }

    return true;
  });
}

export async function fetchSummarySnapshots(
  supabase: ServiceSupabaseClient,
  contractIds: string[],
  preferredYear?: number
): Promise<ContractSnapshots> {
  if (!contractIds.length) {
    return {
      overall: new Map(),
      partC: new Map(),
      partD: new Map(),
      dataYear: null,
      priorYear: null,
    };
  }

  const allData: SummaryRow[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("summary_ratings")
      .select(
        "contract_id, year, overall_rating_numeric, overall_rating, part_c_summary_numeric, part_c_summary, part_d_summary_numeric, part_d_summary"
      )
      .in("contract_id", contractIds)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      allData.push(...(data as SummaryRow[]));
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  const rows = allData.map((row) => ({
    contractId: normalizeContractId(row.contract_id),
    year: Number(row.year),
    overall: toNumeric(row.overall_rating_numeric ?? row.overall_rating),
    partC: toNumeric(row.part_c_summary_numeric ?? row.part_c_summary),
    partD: toNumeric(row.part_d_summary_numeric ?? row.part_d_summary),
  }));

  if (!rows.length) {
    return {
      overall: new Map(),
      partC: new Map(),
      partD: new Map(),
      dataYear: null,
      priorYear: null,
    };
  }

  const uniqueYears = Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => b - a);
  const candidateYears = typeof preferredYear === "number"
    ? uniqueYears.filter((year) => year <= preferredYear)
    : uniqueYears;

  const dataYear = candidateYears[0] ?? null;
  const priorYear = candidateYears.find((year) => year < (dataYear ?? year)) ?? null;

  const overall = new Map<string, { current: number | null; prior: number | null }>();
  const partC = new Map<string, { current: number | null; prior: number | null }>();
  const partD = new Map<string, { current: number | null; prior: number | null }>();

  for (const row of rows) {
    if (!row.contractId) continue;
    if (dataYear !== null && row.year === dataYear) {
      ensureSnapshot(overall, row.contractId).current = row.overall;
      ensureSnapshot(partC, row.contractId).current = row.partC;
      ensureSnapshot(partD, row.contractId).current = row.partD;
    }
    if (priorYear !== null && row.year === priorYear) {
      ensureSnapshot(overall, row.contractId).prior = row.overall;
      ensureSnapshot(partC, row.contractId).prior = row.partC;
      ensureSnapshot(partD, row.contractId).prior = row.partD;
    }
  }

  return {
    overall,
    partC,
    partD,
    dataYear,
    priorYear,
  };
}

export function ensureSnapshot(map: MetricSnapshots, id: string) {
  if (!map.has(id)) {
    map.set(id, { current: null, prior: null });
  }
  return map.get(id)!;
}

export function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
