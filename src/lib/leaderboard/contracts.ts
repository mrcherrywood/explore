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

export type MetricSnapshot = {
  current: number | null;
  prior: number | null;
  currentYear: number | null;
  priorYear: number | null;
};

export type MetricSnapshots = Map<string, MetricSnapshot>;

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

  const overall: MetricSnapshots = new Map();
  const partC: MetricSnapshots = new Map();
  const partD: MetricSnapshots = new Map();

  const rowsByContract = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.contractId || !Number.isFinite(row.year)) continue;
    if (!rowsByContract.has(row.contractId)) {
      rowsByContract.set(row.contractId, []);
    }
    rowsByContract.get(row.contractId)!.push(row);
  }

  for (const row of rows) {
    if (!row.contractId) continue;
    if (dataYear !== null && row.year === dataYear) {
      const overallSnap = ensureSnapshot(overall, row.contractId);
      overallSnap.current = row.overall;
      overallSnap.currentYear = row.year;

      const partCSnap = ensureSnapshot(partC, row.contractId);
      partCSnap.current = row.partC;
      partCSnap.currentYear = row.year;

      const partDSnap = ensureSnapshot(partD, row.contractId);
      partDSnap.current = row.partD;
      partDSnap.currentYear = row.year;
    }
    if (priorYear !== null && row.year === priorYear) {
      const overallSnap = ensureSnapshot(overall, row.contractId);
      if (row.overall !== null) {
        overallSnap.prior = row.overall;
        overallSnap.priorYear = row.year;
      }

      const partCSnap = ensureSnapshot(partC, row.contractId);
      if (row.partC !== null) {
        partCSnap.prior = row.partC;
        partCSnap.priorYear = row.year;
      }

      const partDSnap = ensureSnapshot(partD, row.contractId);
      if (row.partD !== null) {
        partDSnap.prior = row.partD;
        partDSnap.priorYear = row.year;
      }
    }
  }

  for (const [contractId, contractRows] of rowsByContract.entries()) {
    const sorted = contractRows
      .filter((row) => Number.isFinite(row.year))
      .sort((a, b) => b.year - a.year);

    const overallSnap = overall.get(contractId);
    const partCSnap = partC.get(contractId);
    const partDSnap = partD.get(contractId);

    if (overallSnap && overallSnap.current !== null && overallSnap.prior === null) {
      const priorRow = sorted.find((row) => row.year < (overallSnap.currentYear ?? dataYear ?? Number.POSITIVE_INFINITY));
      if (priorRow && priorRow.overall !== null) {
        overallSnap.prior = priorRow.overall;
        overallSnap.priorYear = priorRow.year;
      }
    }

    if (overallSnap && overallSnap.current === null) {
      const fallbackRow = sorted.find((row) => row.overall !== null && (dataYear === null || row.year <= dataYear));
      if (fallbackRow) {
        overallSnap.current = fallbackRow.overall;
        overallSnap.currentYear = fallbackRow.year;
        const priorRow = sorted.find((row) => row.year < fallbackRow.year && row.overall !== null);
        if (priorRow) {
          overallSnap.prior = priorRow.overall;
          overallSnap.priorYear = priorRow.year;
        }
      }
    }

    if (partCSnap && partCSnap.current !== null && partCSnap.prior === null) {
      const priorRow = sorted.find((row) => row.year < (partCSnap.currentYear ?? dataYear ?? Number.POSITIVE_INFINITY));
      if (priorRow && priorRow.partC !== null) {
        partCSnap.prior = priorRow.partC;
        partCSnap.priorYear = priorRow.year;
      }
    }

    if (partCSnap && partCSnap.current === null) {
      const fallbackRow = sorted.find((row) => row.partC !== null && (dataYear === null || row.year <= dataYear));
      if (fallbackRow) {
        partCSnap.current = fallbackRow.partC;
        partCSnap.currentYear = fallbackRow.year;
        const priorRow = sorted.find((row) => row.year < fallbackRow.year && row.partC !== null);
        if (priorRow) {
          partCSnap.prior = priorRow.partC;
          partCSnap.priorYear = priorRow.year;
        }
      }
    }

    if (partDSnap && partDSnap.current !== null && partDSnap.prior === null) {
      const priorRow = sorted.find((row) => row.year < (partDSnap.currentYear ?? dataYear ?? Number.POSITIVE_INFINITY));
      if (priorRow && priorRow.partD !== null) {
        partDSnap.prior = priorRow.partD;
        partDSnap.priorYear = priorRow.year;
      }
    }

    if (partDSnap && partDSnap.current === null) {
      const fallbackRow = sorted.find((row) => row.partD !== null && (dataYear === null || row.year <= dataYear));
      if (fallbackRow) {
        partDSnap.current = fallbackRow.partD;
        partDSnap.currentYear = fallbackRow.year;
        const priorRow = sorted.find((row) => row.year < fallbackRow.year && row.partD !== null);
        if (priorRow) {
          partDSnap.prior = priorRow.partD;
          partDSnap.priorYear = priorRow.year;
        }
      }
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
    map.set(id, { current: null, prior: null, currentYear: null, priorYear: null });
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
