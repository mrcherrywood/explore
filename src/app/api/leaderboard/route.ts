import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  fetchContractLandscape,
  fetchLatestEnrollmentPeriod,
} from "@/lib/leaderboard/data";
import {
  ENROLLMENT_LEVELS,
  getEnrollmentLevel,
  type EnrollmentLevelId,
} from "@/lib/peer/enrollment-levels";
import {
  type ContractLeaderboardFilters,
  type ContractLeaderboardSelection,
  type LeaderboardRequest,
  type LeaderboardResponse,
  type LeaderboardSection,
  type OrganizationBucket,
  type OrganizationLeaderboardFilters,
  type OrganizationLeaderboardSelection,
} from "@/lib/leaderboard/types";
import { isInverseMeasure } from "@/lib/metrics/inverse-measures";
import { US_STATE_NAMES } from "@/lib/leaderboard/states";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const DOMINANT_SHARE_THRESHOLD = 0.4;
const DEFAULT_TOP_LIMIT = 10;
const MIN_TOP_LIMIT = 5;
const MAX_TOP_LIMIT = 20;

const PLAN_TYPES = new Set(["ALL", "SNP", "NOT"]);
const CONTRACT_SERIES = new Set(["H_ONLY", "S_ONLY"] as const);
const STATE_OPTIONS = new Set(["all", "state"]);
const VALID_ENROLLMENT_LEVELS = new Set<EnrollmentLevelId>(
  ENROLLMENT_LEVELS.map((level) => level.id)
);
const ORGANIZATION_BUCKET_RULES: Record<OrganizationBucket, (count: number) => boolean> = {
  all: (count) => count > 1,
  lt5: (count) => count >= 2 && count <= 4,
  "5to10": (count) => count >= 5 && count <= 10,
  "10to20": (count) => count >= 11 && count <= 20,
  "20plus": (count) => count >= 21,
};

type ServiceSupabaseClient = SupabaseClient<Database>;

type ContractRecord = {
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

type OrganizationRecord = {
  organization: string;
  contractCount: number;
  contracts: string[];
  hasBlueContracts: boolean;
  blueContractCount: number;
};

type MetricSnapshots = Map<string, { current: number | null; prior: number | null }>;

type NormalizedContractRequest = {
  mode: "contract";
  selection: ContractLeaderboardSelection;
  topLimit: number;
  includeMeasures: boolean;
};

type NormalizedOrganizationRequest = {
  mode: "organization";
  selection: OrganizationLeaderboardSelection;
  topLimit: number;
  includeMeasures: boolean;
};

type NormalizedRequest = NormalizedContractRequest | NormalizedOrganizationRequest;

type ContractSnapshots = {
  overall: MetricSnapshots;
  partC: MetricSnapshots;
  partD: MetricSnapshots;
  dataYear: number | null;
  priorYear: number | null;
};

type LeaderboardEntryDraft = {
  entityId: string;
  entityLabel: string;
  contractId?: string;
  parentOrganization?: string | null;
  dominantShare?: number | null;
  dominantState?: string | null;
  stateEligible?: boolean;
  isBlueCrossBlueShield?: boolean;
  metadata?: Record<string, unknown>;
  value: number | null;
  priorValue: number | null;
  delta: number | null;
};

type RankedEntry = LeaderboardEntryDraft & { rank: number };

type MetricAggregate = {
  currentSum: number;
  currentWeight: number;
  priorSum: number;
  priorWeight: number;
  metricType: "stars" | "rate";
};

type MetricRow = Pick<
  Database["public"]["Tables"]["ma_metrics"]["Row"],
  | "contract_id"
  | "metric_code"
  | "metric_label"
  | "metric_category"
  | "rate_percent"
  | "star_rating"
  | "year"
>;

type MeasureRow = {
  code: string | null;
  name: string | null;
  domain: string | null;
};

function toSectionKey(prefix: string, label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized ? `${prefix}-${normalized}` : prefix;
}

function formatMetricSectionTitle(context: string, label: string) {
  const trimmed = label.trim();
  return trimmed ? `${context}: ${trimmed}` : context;
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as LeaderboardRequest;
    const normalized = normalizeRequest(payload);

    let supabase: ServiceSupabaseClient;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("Leaderboard API configuration error:", clientError);
      return NextResponse.json(
        { error: "Supabase credentials not configured", code: "SUPABASE_CONFIG_MISSING" },
        { status: 503 }
      );
    }

    const period = await fetchLatestEnrollmentPeriod(supabase);
    if (!period) {
      return NextResponse.json(emptyResponse(normalized));
    }

    const landscapeRows = await fetchContractLandscape(supabase, period);
    const contractRecords = buildContractRecords(landscapeRows);

    if (normalized.mode === "contract") {
      const response = await buildContractLeaderboardResponse(
        supabase,
        normalized,
        contractRecords
      );
      return NextResponse.json(response);
    }

    const response = await buildOrganizationLeaderboardResponse(
      supabase,
      normalized,
      contractRecords
    );
    return NextResponse.json(response);
  } catch (error) {
    console.error("Leaderboard API error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate leaderboard",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function emptyResponse(request: NormalizedRequest): LeaderboardResponse {
  if (request.mode === "contract") {
    const filters: ContractLeaderboardFilters = {
      ...request.selection,
      topLimit: request.topLimit,
      mode: "contract",
    };
    return {
      generatedAt: new Date().toISOString(),
      mode: "contract",
      filters,
      dataYear: null,
      priorYear: null,
      sections: [],
    };
  }

  const filters: OrganizationLeaderboardFilters = {
    ...request.selection,
    topLimit: request.topLimit,
    mode: "organization",
  };
  return {
    generatedAt: new Date().toISOString(),
    mode: "organization",
    filters,
    dataYear: null,
    priorYear: null,
    sections: [],
  };
}

function clampTopLimit(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_TOP_LIMIT;
  }
  return Math.min(MAX_TOP_LIMIT, Math.max(MIN_TOP_LIMIT, Math.round(value)));
}

function normalizeState(value: string | undefined | null): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return upper.length ? upper : null;
}

function normalizeContractId(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function normalizeRequest(payload: LeaderboardRequest): NormalizedRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid leaderboard request");
  }

  const requestedTopLimit = clampTopLimit(
    payload.topLimit ?? (payload.selection as { topLimit?: number })?.topLimit
  );

  if (payload.mode === "contract") {
    const rawSelection = (payload.selection ?? {}) as Partial<ContractLeaderboardSelection>;
    const rawStateOption = rawSelection.stateOption ?? "all";
    const stateOption = STATE_OPTIONS.has(rawStateOption)
      ? (rawStateOption as "all" | "state")
      : "all";

    const rawPlanType = rawSelection.planTypeGroup ?? "ALL";
    const planTypeGroup = PLAN_TYPES.has(rawPlanType) ? rawPlanType : "ALL";

    const rawEnrollment = (rawSelection.enrollmentLevel ?? "all") as EnrollmentLevelId;
    const enrollmentLevel = VALID_ENROLLMENT_LEVELS.has(rawEnrollment)
      ? rawEnrollment
      : "all";

    const rawSeries = (rawSelection.contractSeries ?? "H_ONLY") as ContractLeaderboardSelection["contractSeries"];
    const contractSeries = CONTRACT_SERIES.has(rawSeries) ? rawSeries : "H_ONLY";

    const state = stateOption === "state" ? normalizeState(rawSelection.state) : null;
    if (stateOption === "state") {
      if (!state) {
        throw new Error("state is required when stateOption is 'state'");
      }
      if (!Object.prototype.hasOwnProperty.call(US_STATE_NAMES, state)) {
        throw new Error(`Unknown state code '${state}'`);
      }
    }

    const blueOnly = Boolean(rawSelection.blueOnly);

    const selection: ContractLeaderboardSelection = {
      stateOption,
      state: state ?? undefined,
      planTypeGroup,
      enrollmentLevel,
      contractSeries,
      topLimit: requestedTopLimit,
      blueOnly,
    };

    return {
      mode: "contract",
      selection,
      topLimit: requestedTopLimit,
      includeMeasures: Boolean(payload.includeMeasures),
    };
  }

  if (payload.mode === "organization") {
    const rawSelection = (payload.selection ?? {}) as Partial<OrganizationLeaderboardSelection>;
    const rawBucket = rawSelection.bucket ?? "all";
    const bucket = (Object.prototype.hasOwnProperty.call(ORGANIZATION_BUCKET_RULES, rawBucket)
      ? rawBucket
      : "all") as OrganizationBucket;

    const blueOnly = Boolean(rawSelection.blueOnly);

    const selection: OrganizationLeaderboardSelection = {
      bucket,
      topLimit: requestedTopLimit,
      blueOnly,
    };

    return {
      mode: "organization",
      selection,
      topLimit: requestedTopLimit,
      includeMeasures: Boolean(payload.includeMeasures),
    };
  }

  throw new Error("Unsupported leaderboard mode");
}

function buildContractRecords(rows: Awaited<ReturnType<typeof fetchContractLandscape>>): Map<string, ContractRecord> {
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

async function buildContractLeaderboardResponse(
  supabase: ServiceSupabaseClient,
  request: NormalizedContractRequest,
  contractRecords: Map<string, ContractRecord>
): Promise<LeaderboardResponse> {
  const eligible = filterContracts(contractRecords, request.selection);
  if (eligible.length === 0) {
    return emptyResponse(request);
  }

  const eligibleIds = eligible.map((record) => record.contractId);
  const snapshots = await fetchSummarySnapshots(supabase, eligibleIds);
  const sections = buildSections("contract", snapshots, eligible, request.topLimit);

  if (request.includeMeasures) {
    const metricSections = await buildContractMetricSections(
      supabase,
      eligible,
      request.topLimit,
      snapshots.dataYear,
      snapshots.priorYear
    );
    sections.push(...metricSections);
  }

  const filters: ContractLeaderboardFilters = {
    ...request.selection,
    topLimit: request.topLimit,
    mode: "contract",
  };

  return {
    generatedAt: new Date().toISOString(),
    mode: "contract",
    filters,
    dataYear: snapshots.dataYear,
    priorYear: snapshots.priorYear,
    sections,
  };
}

function filterContracts(
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

async function buildOrganizationLeaderboardResponse(
  supabase: ServiceSupabaseClient,
  request: NormalizedOrganizationRequest,
  contractRecords: Map<string, ContractRecord>
): Promise<LeaderboardResponse> {
  const { organizations, contractsByOrganization } = buildOrganizationRecords(contractRecords);
  const rule = ORGANIZATION_BUCKET_RULES[request.selection.bucket];
  let filteredOrganizations = Array.from(organizations.values()).filter((org) => rule(org.contractCount));
  
  if (request.selection.blueOnly) {
    filteredOrganizations = filteredOrganizations.filter((org) => org.hasBlueContracts);
  }

  if (!filteredOrganizations.length) {
    return emptyResponse(request);
  }

  const contractIds = Array.from(
    new Set(filteredOrganizations.flatMap((org) => contractsByOrganization.get(org.organization) ?? []))
  );

  const snapshots = await fetchSummarySnapshots(supabase, contractIds);
  const aggregatedSnapshots = aggregateSnapshotsToOrganizations(
    snapshots,
    filteredOrganizations,
    contractsByOrganization,
    contractRecords
  );

  const sections = buildSections("organization", aggregatedSnapshots, filteredOrganizations, request.topLimit);

  if (request.includeMeasures) {
    const metricSections = await buildOrganizationMetricSections(
      supabase,
      filteredOrganizations,
      contractsByOrganization,
      contractRecords,
      request.topLimit
    );
    sections.push(...metricSections);
  }

  const filters: OrganizationLeaderboardFilters = {
    ...request.selection,
    topLimit: request.topLimit,
    mode: "organization",
  };

  return {
    generatedAt: new Date().toISOString(),
    mode: "organization",
    filters,
    dataYear: aggregatedSnapshots.dataYear,
    priorYear: aggregatedSnapshots.priorYear,
    sections,
  };
}

function buildOrganizationRecords(contractRecords: Map<string, ContractRecord>) {
  const organizations = new Map<string, OrganizationRecord>();
  const contractsByOrganization = new Map<string, string[]>();

  for (const record of contractRecords.values()) {
    const parent = (record.parentOrganization ?? "").trim();
    if (!parent) continue;

    if (!contractsByOrganization.has(parent)) {
      contractsByOrganization.set(parent, []);
    }
    contractsByOrganization.get(parent)!.push(record.contractId);
  }

  contractsByOrganization.forEach((contracts, organization) => {
    let hasBlueContracts = false;
    let blueContractCount = 0;
    
    for (const contractId of contracts) {
      const contract = contractRecords.get(contractId);
      if (contract?.isBlueCrossBlueShield) {
        hasBlueContracts = true;
        blueContractCount++;
      }
    }
    
    organizations.set(organization, {
      organization,
      contractCount: contracts.length,
      contracts,
      hasBlueContracts,
      blueContractCount,
    });
  });

  return { organizations, contractsByOrganization };
}

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

async function fetchSummarySnapshots(
  supabase: ServiceSupabaseClient,
  contractIds: string[]
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

  // Supabase has a default limit of 1000 rows, we need to fetch in batches
  // Expected: ~3 years of data per contract = ~2800 rows for 948 contracts
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

  const years = Array.from(new Set(rows.map((row) => row.year))).sort((a, b) => b - a);
  const dataYear = years[0] ?? null;
  const priorYear = years.find((year) => year < (dataYear ?? year)) ?? null;

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

function ensureSnapshot(map: MetricSnapshots, id: string) {
  if (!map.has(id)) {
    map.set(id, { current: null, prior: null });
  }
  return map.get(id)!;
}

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildSections(
  mode: NormalizedRequest["mode"],
  snapshots: ContractSnapshots,
  records: ContractRecord[] | OrganizationRecord[],
  topLimit: number
): LeaderboardSection[] {
  const recordMap = new Map<string, ContractRecord | OrganizationRecord>();
  if (mode === "contract") {
    for (const record of records as ContractRecord[]) {
      recordMap.set(record.contractId, record);
    }
  } else {
    for (const record of records as OrganizationRecord[]) {
      recordMap.set(record.organization, record);
    }
  }

  const sections: LeaderboardSection[] = [];

  sections.push(
    buildSection(
      mode,
      "overall",
      "Overall Star Rating",
      "stars",
      snapshots.overall,
      recordMap,
      topLimit,
      snapshots.dataYear,
      snapshots.priorYear
    )
  );

  sections.push(
    buildSection(
      mode,
      "partC",
      "Part C Star Rating",
      "stars",
      snapshots.partC,
      recordMap,
      topLimit,
      snapshots.dataYear,
      snapshots.priorYear
    )
  );

  sections.push(
    buildSection(
      mode,
      "partD",
      "Part D Star Rating",
      "stars",
      snapshots.partD,
      recordMap,
      topLimit,
      snapshots.dataYear,
      snapshots.priorYear
    )
  );

  return sections;
}

async function fetchMetricRows(
  supabase: ServiceSupabaseClient,
  contractIds: string[]
): Promise<MetricRow[]> {
  if (!contractIds.length) {
    return [];
  }

  const pageSize = 1000;
  let page = 0;
  const allRows: MetricRow[] = [];
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("ma_metrics")
      .select(
        "contract_id, metric_code, metric_label, metric_category, rate_percent, star_rating, year"
      )
      .in("contract_id", contractIds)
      .order("contract_id", { ascending: true })
      .order("metric_code", { ascending: true })
      .order("year", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows.push(...(data as MetricRow[]));
    hasMore = data.length === pageSize;
    page += 1;
  }

  return allRows;
}

function buildSection(
  mode: NormalizedRequest["mode"],
  key: string,
  title: string,
  metricType: "stars" | "rate",
  snapshots: MetricSnapshots,
  records: Map<string, ContractRecord | OrganizationRecord>,
  topLimit: number,
  dataYear: number | null,
  priorYear: number | null,
  direction: "higher" | "lower" = "higher"
): LeaderboardSection {
  const drafts: LeaderboardEntryDraft[] = [];

  for (const [id, snapshot] of snapshots.entries()) {
    const record = records.get(id);
    if (!record) continue;

    const { current, prior } = snapshot;
    if (current === null && prior === null) {
      continue;
    }

    if (mode === "contract") {
      const contract = record as ContractRecord;
      const planName = contract.marketingName ?? contract.contractName ?? "Unknown";
      const labelWithId = `${id} - ${planName}`;
      
      drafts.push({
        entityId: id,
        entityLabel: labelWithId,
        contractId: id,
        parentOrganization: contract.parentOrganization,
        dominantShare: contract.dominantShare ?? null,
        dominantState: contract.dominantState ?? null,
        stateEligible: contract.stateEligible,
        isBlueCrossBlueShield: contract.isBlueCrossBlueShield,
        value: current,
        priorValue: prior,
        delta: current !== null && prior !== null ? current - prior : null,
      });
    } else {
      const organization = record as OrganizationRecord;
      drafts.push({
        entityId: id,
        entityLabel: organization.organization,
        metadata: { 
          contractCount: organization.contractCount,
          blueContractCount: organization.blueContractCount,
        },
        value: current,
        priorValue: prior,
        delta: current !== null && prior !== null ? current - prior : null,
      });
    }
  }

  const topPerformers = rankByValue(drafts, topLimit, direction === "lower");
  const biggestMovers = rankByDelta(drafts, topLimit, direction === "lower");
  const biggestDecliners = rankByDelta(drafts, topLimit, direction !== "lower");

  return {
    key,
    title,
    metricType,
    unitLabel: metricType === "stars" ? "Stars" : "%",
    direction,
    topPerformers: finalizeEntries(topPerformers, metricType, dataYear, priorYear),
    biggestMovers: finalizeEntries(biggestMovers, metricType, dataYear, priorYear),
    biggestDecliners: finalizeEntries(biggestDecliners, metricType, dataYear, priorYear),
  };
}

function rankByValue(entries: LeaderboardEntryDraft[], topLimit: number, ascending = false): RankedEntry[] {
  return entries
    .filter((entry) => entry.value !== null)
    .sort((a, b) => {
      const aValue = a.value ?? Number.NEGATIVE_INFINITY;
      const bValue = b.value ?? Number.NEGATIVE_INFINITY;
      if (aValue === bValue) {
        return a.entityLabel.localeCompare(b.entityLabel);
      }
      return ascending ? aValue - bValue : bValue - aValue;
    })
    .slice(0, topLimit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function rankByDelta(
  entries: LeaderboardEntryDraft[],
  topLimit: number,
  ascending: boolean
): RankedEntry[] {
  return entries
    .filter((entry) => entry.delta !== null)
    .sort((a, b) => {
      const aDelta = a.delta ?? 0;
      const bDelta = b.delta ?? 0;
      if (aDelta === bDelta) {
        return a.entityLabel.localeCompare(b.entityLabel);
      }
      return ascending ? aDelta - bDelta : bDelta - aDelta;
    })
    .slice(0, topLimit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function finalizeEntries(
  entries: RankedEntry[],
  metricType: "stars" | "rate",
  dataYear: number | null,
  priorYear: number | null
) {
  return entries.map((entry) => ({
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
    parentOrganization: entry.parentOrganization ?? null,
    contractId: entry.contractId,
    dominantState: entry.dominantState ?? null,
    dominantShare: entry.dominantShare ?? null,
    stateEligible: entry.stateEligible,
    isBlueCrossBlueShield: entry.isBlueCrossBlueShield ?? false,
    metadata: entry.metadata,
    value: entry.value,
    valueLabel: formatMetric(entry.value, metricType),
    priorValue: entry.priorValue,
    priorLabel: formatMetric(entry.priorValue, metricType),
    delta: entry.delta,
    deltaLabel: entry.delta === null ? "—" : formatDelta(entry.delta, metricType),
    rank: entry.rank,
    reportYear: dataYear,
    priorYear,
  }));
}

function formatMetric(value: number | null, metricType: "stars" | "rate") {
  if (value === null || value === undefined) {
    return "—";
  }
  return metricType === "rate" ? `${value.toFixed(1)}%` : value.toFixed(1);
}

function formatDelta(value: number, metricType: "stars" | "rate") {
  const prefix = value > 0 ? "+" : "";
  return metricType === "rate" ? `${prefix}${value.toFixed(1)}%` : `${prefix}${value.toFixed(1)}`;
}

async function buildContractMetricSections(
  supabase: ServiceSupabaseClient,
  contracts: ContractRecord[],
  topLimit: number,
  dataYear: number | null,
  priorYear: number | null
): Promise<LeaderboardSection[]> {
  if (!contracts.length) {
    return [];
  }

  const contractIds = contracts.map((record) => record.contractId);
  const typedMetricRows = await fetchMetricRows(
    supabase,
    contractIds
  );
  if (!typedMetricRows.length) {
    return [];
  }

  // Determine the latest available metrics years for this cohort
  const metricsYearsPresent = Array.from(
    new Set(
      typedMetricRows
        .map((r) => Number(r.year))
        .filter((y): y is number => Number.isFinite(y))
    )
  ).sort((a, b) => b - a);
  const metricsDataYear = metricsYearsPresent[0] ?? dataYear!;
  const metricsPriorYear = metricsYearsPresent.find((y) => y < metricsDataYear) ?? (priorYear ?? null);

  const metricCodes = Array.from(
    new Set(
      typedMetricRows
        .map((row) => row.metric_code)
        .filter((code): code is string => Boolean(code))
    )
  );

  const measureLookup = new Map<string, MeasureRow>();
  if (metricCodes.length) {
    const { data: measureRows, error: measureError } = await supabase
      .from("ma_measures")
      .select("code, name, domain")
      .in("code", metricCodes);

    if (measureError) {
      throw new Error(measureError.message);
    }

    const typedMeasureRows = (measureRows ?? []) as MeasureRow[];
    for (const row of typedMeasureRows) {
      if (!row.code) continue;
      measureLookup.set(row.code, row);
    }
  }

  const domainAggregates = new Map<string, Map<string, MetricAggregate>>();
  const measureAggregates = new Map<string, Map<string, MetricAggregate>>();
  const measureLabels = new Map<string, string>();
  const measureDirections = new Map<string, "higher" | "lower">();
  const domainDirections = new Map<string, { inverseCount: number; totalCount: number }>();

  const contractMap = new Map<string, ContractRecord>();
  for (const contract of contracts) {
    contractMap.set(contract.contractId, contract);
  }

  for (const row of typedMetricRows) {
    const contractId = normalizeContractId(row.contract_id);
    if (!contractId || !contractMap.has(contractId)) {
      continue;
    }

    const rowYear = Number(row.year);
    if (!Number.isFinite(rowYear)) {
      continue;
    }

    const valueInfo = resolveMetricValue(row);
    if (!valueInfo) {
      continue;
    }

    const { value, metricType } = valueInfo;
    const measureMeta = row.metric_code ? measureLookup.get(row.metric_code) : undefined;
    const domainRaw = measureMeta?.domain ?? row.metric_category ?? "Other";
    const domain = String(domainRaw ?? "Other").trim() || "Other";
    const measureKey = row.metric_code ?? `${domain}-${row.metric_label ?? "unknown"}`;
    const measureTitle = measureMeta?.name ?? row.metric_label ?? row.metric_code ?? "Unknown Metric";
    measureLabels.set(measureKey, measureTitle);

    const domainAggregate = ensureMetricAggregate(domainAggregates, domain, contractId, metricType);
    accumulateMetricAggregate(
      domainAggregate,
      rowYear,
      metricsDataYear,
      metricsPriorYear,
      value,
      metricType
    );

    const measureAggregate = ensureMetricAggregate(measureAggregates, measureKey, contractId, metricType);
    accumulateMetricAggregate(
      measureAggregate,
      rowYear,
      metricsDataYear,
      metricsPriorYear,
      value,
      metricType
    );

    const isInverse = isInverseMeasure(measureTitle, row.metric_code ?? undefined);
    if (!measureDirections.has(measureKey)) {
      measureDirections.set(measureKey, isInverse ? "lower" : "higher");
    }

    const stats = domainDirections.get(domain) ?? { inverseCount: 0, totalCount: 0 };
    stats.totalCount += 1;
    if (isInverse) {
      stats.inverseCount += 1;
    }
    domainDirections.set(domain, stats);
  }

  const contractRecordMap = new Map<string, ContractRecord | OrganizationRecord>();
  for (const [id, record] of contractMap.entries()) {
    contractRecordMap.set(id, record);
  }

  const sections: LeaderboardSection[] = [];

  const sortedDomains = Array.from(domainAggregates.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [domain, aggregates] of sortedDomains) {
    const { snapshots, metricType } = snapshotsFromAggregates(aggregates);
    if (!snapshots.size) continue;
    const stats = domainDirections.get(domain);
    const direction = stats && stats.totalCount > 0 && stats.inverseCount >= stats.totalCount / 2 ? "lower" : "higher";
    sections.push(
      buildSection(
        "contract",
        toSectionKey("domain", domain),
        formatMetricSectionTitle("Domain Performance", domain),
        metricType,
        snapshots,
        contractRecordMap,
        topLimit,
        metricsDataYear,
        metricsPriorYear,
        direction
      )
    );
  }

  const sortedMeasures = Array.from(measureAggregates.entries()).sort((a, b) =>
    (measureLabels.get(a[0]) ?? a[0]).localeCompare(measureLabels.get(b[0]) ?? b[0])
  );
  for (const [measureKey, aggregates] of sortedMeasures) {
    const { snapshots, metricType } = snapshotsFromAggregates(aggregates);
    if (!snapshots.size) continue;
    const label = measureLabels.get(measureKey) ?? measureKey;
    const direction = measureDirections.get(measureKey) ?? "higher";
    sections.push(
      buildSection(
        "contract",
        toSectionKey("measure", measureKey),
        formatMetricSectionTitle("Measure Performance", label),
        metricType,
        snapshots,
        contractRecordMap,
        topLimit,
        metricsDataYear,
        metricsPriorYear,
        direction
      )
    );
  }

  return sections;
}

async function buildOrganizationMetricSections(
  supabase: ServiceSupabaseClient,
  organizations: OrganizationRecord[],
  contractsByOrganization: Map<string, string[]>,
  contractRecords: Map<string, ContractRecord>,
  topLimit: number
): Promise<LeaderboardSection[]> {
  if (!organizations.length) {
    return [];
  }

  const allContracts = new Set<string>();
  const contractToOrganization = new Map<string, string>();
  for (const organization of organizations) {
    const contracts = contractsByOrganization.get(organization.organization) ?? [];
    for (const contractId of contracts) {
      const normalized = normalizeContractId(contractId);
      if (!normalized) continue;
      allContracts.add(normalized);
      contractToOrganization.set(normalized, organization.organization);
    }
  }

  if (!allContracts.size) {
    return [];
  }

  const typedMetricRows = await fetchMetricRows(
    supabase,
    Array.from(allContracts)
  );
  if (!typedMetricRows.length) {
    return [];
  }

  // Determine effective metrics years present for these organizations' contracts
  const orgMetricsYears = Array.from(
    new Set(
      typedMetricRows
        .map((r) => Number(r.year))
        .filter((y): y is number => Number.isFinite(y))
    )
  ).sort((a, b) => b - a);
  const orgMetricsDataYear = orgMetricsYears[0] as number;
  const orgMetricsPriorYear = orgMetricsYears.find((y) => y < orgMetricsDataYear) ?? null;

  const metricCodes = Array.from(
    new Set(
      typedMetricRows
        .map((row) => row.metric_code)
        .filter((code): code is string => Boolean(code))
    )
  );

  const measureLookup = new Map<string, MeasureRow>();
  if (metricCodes.length) {
    const { data: measureRows, error: measureError } = await supabase
      .from("ma_measures")
      .select("code, name, domain")
      .in("code", metricCodes);

    if (measureError) {
      throw new Error(measureError.message);
    }

    const typedMeasureRows = (measureRows ?? []) as MeasureRow[];
    for (const row of typedMeasureRows) {
      if (!row.code) continue;
      measureLookup.set(row.code, row);
    }
  }

  const domainAggregates = new Map<string, Map<string, MetricAggregate>>();
  const measureAggregates = new Map<string, Map<string, MetricAggregate>>();
  const measureLabels = new Map<string, string>();
  const measureDirections = new Map<string, "higher" | "lower">();
  const domainDirections = new Map<string, { inverseCount: number; totalCount: number }>();

  const organizationRecords = new Map<string, OrganizationRecord>();
  for (const organization of organizations) {
    organizationRecords.set(organization.organization, organization);
  }

  for (const row of typedMetricRows) {
    const contractId = normalizeContractId(row.contract_id);
    const organizationId = contractId ? contractToOrganization.get(contractId) : undefined;
    if (!contractId || !organizationId) {
      continue;
    }

    const rowYear = Number(row.year);
    if (!Number.isFinite(rowYear)) {
      continue;
    }

    const valueInfo = resolveMetricValue(row);
    if (!valueInfo) {
      continue;
    }

    const { value, metricType } = valueInfo;
    const measureMeta = row.metric_code ? measureLookup.get(row.metric_code) : undefined;
    const domainRaw = measureMeta?.domain ?? row.metric_category ?? "Other";
    const domain = String(domainRaw ?? "Other").trim() || "Other";
    const measureKey = row.metric_code ?? `${domain}-${row.metric_label ?? "unknown"}`;
    const measureTitle = measureMeta?.name ?? row.metric_label ?? row.metric_code ?? "Unknown Metric";
    measureLabels.set(measureKey, measureTitle);

    const weight = contractRecords.get(contractId)?.totalEnrollment ?? 1;
    const appliedWeight = weight && weight > 0 ? weight : 1;

    const domainAggregate = ensureMetricAggregate(domainAggregates, domain, organizationId, metricType);
    accumulateMetricAggregate(
      domainAggregate,
      rowYear,
      orgMetricsDataYear,
      orgMetricsPriorYear,
      value,
      metricType,
      appliedWeight
    );

    const measureAggregate = ensureMetricAggregate(measureAggregates, measureKey, organizationId, metricType);
    accumulateMetricAggregate(
      measureAggregate,
      rowYear,
      orgMetricsDataYear,
      orgMetricsPriorYear,
      value,
      metricType,
      appliedWeight
    );

    const isInverse = isInverseMeasure(measureTitle, row.metric_code ?? undefined);
    if (!measureDirections.has(measureKey)) {
      measureDirections.set(measureKey, isInverse ? "lower" : "higher");
    }

    const stats = domainDirections.get(domain) ?? { inverseCount: 0, totalCount: 0 };
    stats.totalCount += 1;
    if (isInverse) {
      stats.inverseCount += 1;
    }
    domainDirections.set(domain, stats);
  }

  const recordMap = new Map<string, ContractRecord | OrganizationRecord>();
  for (const [id, record] of organizationRecords.entries()) {
    recordMap.set(id, record);
  }

  const sections: LeaderboardSection[] = [];

  const sortedDomains = Array.from(domainAggregates.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [domain, aggregates] of sortedDomains) {
    const { snapshots, metricType } = snapshotsFromAggregates(aggregates);
    if (!snapshots.size) continue;
    const stats = domainDirections.get(domain);
    const direction = stats && stats.totalCount > 0 && stats.inverseCount >= stats.totalCount / 2 ? "lower" : "higher";
    sections.push(
      buildSection(
        "organization",
        toSectionKey("domain", domain),
        formatMetricSectionTitle("Domain Performance", domain),
        metricType,
        snapshots,
        recordMap,
        topLimit,
        orgMetricsDataYear,
        orgMetricsPriorYear,
        direction
      )
    );
  }

  const sortedMeasures = Array.from(measureAggregates.entries()).sort((a, b) =>
    (measureLabels.get(a[0]) ?? a[0]).localeCompare(measureLabels.get(b[0]) ?? b[0])
  );
  for (const [measureKey, aggregates] of sortedMeasures) {
    const { snapshots, metricType } = snapshotsFromAggregates(aggregates);
    if (!snapshots.size) continue;
    const label = measureLabels.get(measureKey) ?? measureKey;
    const direction = measureDirections.get(measureKey) ?? "higher";
    sections.push(
      buildSection(
        "organization",
        toSectionKey("measure", measureKey),
        formatMetricSectionTitle("Measure Performance", label),
        metricType,
        snapshots,
        recordMap,
        topLimit,
        orgMetricsDataYear,
        orgMetricsPriorYear,
        direction
      )
    );
  }

  return sections;
}

function ensureMetricAggregate(
  collection: Map<string, Map<string, MetricAggregate>>,
  key: string,
  contractId: string,
  metricType: "stars" | "rate"
): MetricAggregate {
  if (!collection.has(key)) {
    collection.set(key, new Map());
  }
  const aggregates = collection.get(key)!;
  if (!aggregates.has(contractId)) {
    aggregates.set(contractId, {
      currentSum: 0,
      currentWeight: 0,
      priorSum: 0,
      priorWeight: 0,
      metricType,
    });
  }

  const aggregate = aggregates.get(contractId)!;
  if (aggregate.metricType === "stars" && metricType === "rate") {
    aggregate.metricType = "rate";
  }
  return aggregate;
}

function accumulateMetricAggregate(
  aggregate: MetricAggregate,
  year: number,
  dataYear: number,
  priorYear: number | null,
  value: number,
  metricType: "stars" | "rate",
  weight = 1
) {
  if (aggregate.metricType === "stars" && metricType === "rate") {
    aggregate.metricType = "rate";
  }

  if (year === dataYear) {
    aggregate.currentSum += value * weight;
    aggregate.currentWeight += weight;
  } else if (priorYear !== null && year === priorYear) {
    aggregate.priorSum += value * weight;
    aggregate.priorWeight += weight;
  }
}

function snapshotsFromAggregates(aggregates: Map<string, MetricAggregate>) {
  const snapshots: MetricSnapshots = new Map();
  let metricType: "stars" | "rate" = "stars";

  for (const [contractId, aggregate] of aggregates.entries()) {
    if (aggregate.metricType === "rate") {
      metricType = "rate";
    }

    const current = aggregate.currentWeight > 0 ? aggregate.currentSum / aggregate.currentWeight : null;
    const prior = aggregate.priorWeight > 0 ? aggregate.priorSum / aggregate.priorWeight : null;

    if (current !== null || prior !== null) {
      snapshots.set(contractId, { current, prior });
    }
  }

  return { snapshots, metricType };
}

function resolveMetricValue(row: MetricRow): { value: number; metricType: "stars" | "rate" } | null {
  const rate = toNumeric(row.rate_percent);
  if (rate !== null) {
    return { value: rate, metricType: "rate" };
  }

  const star = toNumeric(row.star_rating);
  if (star !== null) {
    return { value: star, metricType: "stars" };
  }

  return null;
}

function aggregateSnapshotsToOrganizations(
  snapshots: ContractSnapshots,
  organizations: OrganizationRecord[],
  contractsByOrganization: Map<string, string[]>,
  contractRecords: Map<string, ContractRecord>
): ContractSnapshots {
  const aggregate = (source: MetricSnapshots): MetricSnapshots => {
    const aggregated: MetricSnapshots = new Map();

    for (const organization of organizations) {
      const contracts = contractsByOrganization.get(organization.organization) ?? [];
      if (!contracts.length) continue;

      let currentTotal = 0;
      let currentWeight = 0;
      let priorTotal = 0;
      let priorWeight = 0;

      for (const contractId of contracts) {
        const snapshot = source.get(contractId);
        if (!snapshot) continue;

        const weight = contractRecords.get(contractId)?.totalEnrollment ?? null;
        const appliedWeight = weight && weight > 0 ? weight : 1;

        if (snapshot.current !== null) {
          currentTotal += snapshot.current * appliedWeight;
          currentWeight += appliedWeight;
        }

        if (snapshot.prior !== null) {
          priorTotal += snapshot.prior * appliedWeight;
          priorWeight += appliedWeight;
        }
      }

      const currentAvg = currentWeight > 0 ? currentTotal / currentWeight : null;
      const priorAvg = priorWeight > 0 ? priorTotal / priorWeight : null;

      if (currentAvg !== null || priorAvg !== null) {
        aggregated.set(organization.organization, { current: currentAvg, prior: priorAvg });
      }
    }

    return aggregated;
  };

  return {
    overall: aggregate(snapshots.overall),
    partC: aggregate(snapshots.partC),
    partD: aggregate(snapshots.partD),
    dataYear: snapshots.dataYear,
    priorYear: snapshots.priorYear,
  };
}
