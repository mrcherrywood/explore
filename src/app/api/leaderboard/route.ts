import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  fetchContractLandscape,
  fetchLatestEnrollmentPeriod,
} from "@/lib/leaderboard/data";
import type { EnrollmentLevelId } from "@/lib/peer/enrollment-levels";
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
import type { Database } from "@/lib/supabase/database.types";
import {
  CONTRACT_SERIES_SET,
  PLAN_TYPE_SET,
  STATE_OPTION_SET,
  VALID_ENROLLMENT_LEVELS,
} from "@/lib/leaderboard/filters";
import {
  buildContractRecords,
  fetchSummarySnapshots,
  filterContracts,
  normalizeContractId,
  toNumeric,
  type ContractRecord,
  type ContractSnapshots,
  type MetricSnapshots,
  type ServiceSupabaseClient,
} from "@/lib/leaderboard/contracts";

export const runtime = "nodejs";
const DEFAULT_TOP_LIMIT = 10;
const MIN_TOP_LIMIT = 5;
const MAX_TOP_LIMIT = 20;

const ORGANIZATION_BUCKET_RULES: Record<OrganizationBucket, (count: number) => boolean> = {
  all: (count) => count > 1,
  lt5: (count) => count >= 2 && count <= 4,
  "5to10": (count) => count >= 5 && count <= 10,
  "10to20": (count) => count >= 11 && count <= 20,
  "20plus": (count) => count >= 21,
};

type OrganizationRecord = {
  organization: string;
  contractCount: number;
  contracts: string[];
  hasBlueContracts: boolean;
  blueContractCount: number;
};

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

type LeaderboardEntryDraft = {
  entityId: string;
  entityLabel: string;
  contractId?: string;
  parentOrganization?: string | null;
  dominantShare?: number | null;
  dominantState?: string | null;
  stateEligible?: boolean;
  totalEnrollment?: number | null;
  isBlueCrossBlueShield?: boolean;
  metadata?: Record<string, unknown>;
  value: number | null;
  priorValue: number | null;
  delta: number | null;
  reportYear?: number | null;
  priorYear?: number | null;
};

type RankedEntry = LeaderboardEntryDraft & { rank: number };

type MetricAggregate = {
  currentRateSum: number;
  currentRateWeight: number;
  currentRateYear: number | null;
  priorRateSum: number;
  priorRateWeight: number;
  priorRateYear: number | null;
  currentStarSum: number;
  currentStarWeight: number;
  currentStarYear: number | null;
  priorStarSum: number;
  priorStarWeight: number;
  priorStarYear: number | null;
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
  alias: string | null;
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
    const stateOption = STATE_OPTION_SET.has(rawStateOption)
      ? (rawStateOption as "all" | "state")
      : "all";

    const rawPlanType = rawSelection.planTypeGroup ?? "ALL";
    const planTypeGroup = PLAN_TYPE_SET.has(rawPlanType) ? rawPlanType : "ALL";

    const rawEnrollment = (rawSelection.enrollmentLevel ?? "all") as EnrollmentLevelId;
    const enrollmentLevel = VALID_ENROLLMENT_LEVELS.has(rawEnrollment)
      ? rawEnrollment
      : "all";

    const rawSeries = (rawSelection.contractSeries ?? "H_ONLY") as ContractLeaderboardSelection["contractSeries"];
    const contractSeries = CONTRACT_SERIES_SET.has(rawSeries) ? rawSeries : "H_ONLY";

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
  
  // Filter to only include contracts with an overall star rating
  const withOverallRating = eligible.filter((record) => {
    const snapshot = snapshots.overall.get(record.contractId);
    return snapshot && snapshot.current !== null;
  });
  
  if (withOverallRating.length === 0) {
    return emptyResponse(request);
  }
  
  const sections = buildSections("contract", snapshots, withOverallRating, request.topLimit);

  if (request.includeMeasures) {
    const metricSections = await buildContractMetricSections(
      supabase,
      withOverallRating,
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
  
  // Filter organizations to only include those with at least one contract that has an overall star rating
  const orgsWithRatings = filteredOrganizations.filter((org) => {
    const orgContracts = contractsByOrganization.get(org.organization) ?? [];
    return orgContracts.some((contractId) => {
      const snapshot = snapshots.overall.get(contractId);
      return snapshot && snapshot.current !== null;
    });
  });
  
  if (orgsWithRatings.length === 0) {
    return emptyResponse(request);
  }
  
  const aggregatedSnapshots = aggregateSnapshotsToOrganizations(
    snapshots,
    orgsWithRatings,
    contractsByOrganization,
    contractRecords
  );

  const sections = buildSections("organization", aggregatedSnapshots, orgsWithRatings, request.topLimit);

  if (request.includeMeasures) {
    const metricSections = await buildOrganizationMetricSections(
      supabase,
      orgsWithRatings,
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
    const snapshotReportYear = snapshot.currentYear ?? dataYear;
    const snapshotPriorYear = snapshot.priorYear ?? priorYear;
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
        totalEnrollment: contract.totalEnrollment ?? null,
        isBlueCrossBlueShield: contract.isBlueCrossBlueShield,
        value: current,
        priorValue: prior,
        delta: current !== null && prior !== null ? current - prior : null,
        reportYear: snapshotReportYear,
        priorYear: snapshotPriorYear,
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
        reportYear: snapshotReportYear,
        priorYear: snapshotPriorYear,
      });
    }
  }

  const topPerformers = rankByValue(drafts, topLimit, direction === "lower");

  const improvementFilter = direction === "lower" ? (delta: number) => delta < 0 : (delta: number) => delta > 0;
  const declineFilter = direction === "lower" ? (delta: number) => delta > 0 : (delta: number) => delta < 0;

  const improvementEntries = drafts.filter(
    (entry) => entry.delta !== null && improvementFilter(entry.delta)
  );
  const declineEntries = drafts.filter(
    (entry) => entry.delta !== null && declineFilter(entry.delta)
  );

  const biggestMovers = rankByDelta(improvementEntries, topLimit, direction === "lower");
  const biggestDecliners = rankByDelta(declineEntries, topLimit, direction !== "lower");

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
    totalEnrollment: entry.totalEnrollment ?? null,
    isBlueCrossBlueShield: entry.isBlueCrossBlueShield ?? false,
    metadata: entry.metadata,
    value: entry.value,
    valueLabel: formatMetric(entry.value, metricType),
    priorValue: entry.priorValue,
    priorLabel: formatMetric(entry.priorValue, metricType),
    delta: entry.delta,
    deltaLabel: entry.delta === null ? "—" : formatDelta(entry.delta, metricType),
    rank: entry.rank,
    reportYear: entry.reportYear ?? dataYear ?? null,
    priorYear: entry.priorYear ?? priorYear ?? null,
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
      .select("code, name, alias, domain")
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
  const groupedMeasureEntries = new Map<string, Array<{ orgId: string; year: number; value: number; metricType: "stars" | "rate"; weight: number }>>();
  const measureYears = new Map<string, { dataYear: number; priorYear: number | null }>();

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
    const canonicalTitle = (measureMeta?.alias ?? measureMeta?.name ?? row.metric_label ?? row.metric_code ?? "Unknown Metric").trim();
    const measureKey = `${domain}:${canonicalTitle.toLowerCase()}`;
    const measureTitle = canonicalTitle;
    measureLabels.set(measureKey, measureTitle);

    const domainAggregate = ensureMetricAggregate(domainAggregates, domain, contractId);
    accumulateMetricAggregate(
      domainAggregate,
      rowYear,
      metricsDataYear,
      metricsPriorYear,
      value,
      metricType
    );

    if (!groupedMeasureEntries.has(measureKey)) {
      groupedMeasureEntries.set(measureKey, []);
    }
    const rateVal = toNumeric(row.rate_percent);
    if (rateVal !== null) {
      const list = groupedMeasureEntries.get(measureKey)!;
      list.push({ orgId: contractId, year: rowYear, value: rateVal, metricType: "rate", weight: 1 });

      if (!measureYears.has(measureKey)) {
        measureYears.set(measureKey, { dataYear: rowYear, priorYear: null });
      } else {
        const y = measureYears.get(measureKey)!;
        if (rowYear > y.dataYear) {
          y.priorYear = y.dataYear;
          y.dataYear = rowYear;
        } else if (rowYear < y.dataYear && (y.priorYear === null || rowYear > y.priorYear)) {
          y.priorYear = rowYear;
        }
      }
    }

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

  for (const [mKey, entries] of groupedMeasureEntries.entries()) {
    const rateEntries = entries.filter((e) => e.metricType === "rate");
    if (!rateEntries.length) {
      continue;
    }

    const years = Array.from(new Set(rateEntries.map((e) => e.year))).sort((a, b) => b - a);
    const mDataYear = years[0] as number;
    const mPriorYear = years.find((y) => y < mDataYear) ?? null;
    measureYears.set(mKey, { dataYear: mDataYear, priorYear: mPriorYear });

    for (const e of rateEntries) {
      const agg = ensureMetricAggregate(measureAggregates, mKey, e.orgId);
      accumulateMetricAggregate(agg, e.year, mDataYear, mPriorYear, e.value, e.metricType, e.weight);
    }
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
    const years = measureYears.get(measureKey);
    const reportDataYear = years?.dataYear ?? metricsDataYear;
    const reportPriorYear = years?.priorYear ?? metricsPriorYear;
    sections.push(
      buildSection(
        "contract",
        toSectionKey("measure", measureKey),
        formatMetricSectionTitle("Measure Performance", label),
        metricType,
        snapshots,
        contractRecordMap,
        topLimit,
        reportDataYear,
        reportPriorYear,
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
      .select("code, name, alias, domain")
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
  const groupedMeasureEntries = new Map<string, Array<{ orgId: string; year: number; value: number; metricType: "stars" | "rate"; weight: number }>>();
  const groupedDomainEntries = new Map<string, Array<{ orgId: string; year: number; value: number; metricType: "stars" | "rate"; weight: number }>>();
  const measureYears = new Map<string, { dataYear: number; priorYear: number | null }>();

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
    const canonicalTitle = (measureMeta?.alias ?? measureMeta?.name ?? row.metric_label ?? row.metric_code ?? "Unknown Metric").trim();
    const measureKey = `${domain}:${canonicalTitle.toLowerCase()}`;
    const measureTitle = canonicalTitle;
    measureLabels.set(measureKey, measureTitle);

    const weight = contractRecords.get(contractId)?.totalEnrollment ?? 1;
    const appliedWeight = weight && weight > 0 ? weight : 1;

    if (!groupedMeasureEntries.has(measureKey)) {
      groupedMeasureEntries.set(measureKey, []);
    }
    const rateVal = toNumeric(row.rate_percent);
    if (rateVal !== null) {
      const list = groupedMeasureEntries.get(measureKey)!;
      list.push({ orgId: organizationId, year: rowYear, value: rateVal, metricType: "rate", weight: appliedWeight });

      if (!measureYears.has(measureKey)) {
        measureYears.set(measureKey, { dataYear: rowYear, priorYear: null });
      } else {
        const y = measureYears.get(measureKey)!;
        if (rowYear > y.dataYear) {
          y.priorYear = y.dataYear;
          y.dataYear = rowYear;
        } else if (rowYear < y.dataYear && (y.priorYear === null || rowYear > y.priorYear)) {
          y.priorYear = rowYear;
        }
      }
    }

    if (!groupedDomainEntries.has(domain)) {
      groupedDomainEntries.set(domain, []);
    }
    const domainList = groupedDomainEntries.get(domain)!;
    domainList.push({ orgId: organizationId, year: rowYear, value, metricType, weight: appliedWeight });

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

  // Accumulate per-domain using the metric type with the most valid YOY pairs
  for (const [domain, entries] of groupedDomainEntries.entries()) {
    const years = Array.from(new Set(entries.map((e) => e.year))).sort((a, b) => b - a);
    const dDataYear = years[0] as number;
    const dPriorYear = years.find((y) => y < dDataYear) ?? null;

    const presence = new Map<string, { rate: { data: boolean; prior: boolean }; stars: { data: boolean; prior: boolean } }>();
    for (const e of entries) {
      if (e.year !== dDataYear && (dPriorYear === null || e.year !== dPriorYear)) continue;
      const rec = presence.get(e.orgId) ?? { rate: { data: false, prior: false }, stars: { data: false, prior: false } };
      const slot = e.metricType === "rate" ? rec.rate : rec.stars;
      if (e.year === dDataYear) slot.data = true;
      if (dPriorYear !== null && e.year === dPriorYear) slot.prior = true;
      presence.set(e.orgId, rec);
    }

    let ratePairs = 0;
    let starPairs = 0;
    for (const rec of presence.values()) {
      if (rec.rate.data && rec.rate.prior) ratePairs += 1;
      if (rec.stars.data && rec.stars.prior) starPairs += 1;
    }
    const rateDataCount = entries.filter((e) => e.metricType === "rate" && e.year === dDataYear).length;
    const starDataCount = entries.filter((e) => e.metricType === "stars" && e.year === dDataYear).length;
    const totalRate = entries.filter((e) => e.metricType === "rate").length;
    const totalStars = entries.filter((e) => e.metricType === "stars").length;

    let chosenType: "rate" | "stars";
    if (ratePairs > starPairs) {
      chosenType = "rate";
    } else if (starPairs > ratePairs) {
      chosenType = "stars";
    } else if (rateDataCount > starDataCount) {
      chosenType = "rate";
    } else if (starDataCount > rateDataCount) {
      chosenType = "stars";
    } else if (totalRate > totalStars) {
      chosenType = "rate";
    } else if (totalStars > totalRate) {
      chosenType = "stars";
    } else if (totalStars > 0) {
      chosenType = "stars";
    } else {
      if (totalRate === 0 && totalStars === 0) {
        continue;
      }
      chosenType = "rate";
    }

    for (const e of entries) {
      if (e.metricType !== chosenType) continue;
      const agg = ensureMetricAggregate(domainAggregates, domain, e.orgId);
      accumulateMetricAggregate(agg, e.year, dDataYear, dPriorYear, e.value, e.metricType, e.weight);
    }
  }

  // Accumulate per-measure using the metric type with the most valid YOY pairs
  for (const [mKey, entries] of groupedMeasureEntries.entries()) {
    const rateEntries = entries.filter((e) => e.metricType === "rate");
    if (!rateEntries.length) {
      continue;
    }

    const years = Array.from(new Set(rateEntries.map((e) => e.year))).sort((a, b) => b - a);
    const mDataYear = years[0] as number;
    const mPriorYear = years.find((y) => y < mDataYear) ?? null;
    measureYears.set(mKey, { dataYear: mDataYear, priorYear: mPriorYear });

    for (const e of rateEntries) {
      const agg = ensureMetricAggregate(measureAggregates, mKey, e.orgId);
      accumulateMetricAggregate(agg, e.year, mDataYear, mPriorYear, e.value, e.metricType, e.weight);
    }
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
    const years = measureYears.get(measureKey);
    const reportDataYear = years?.dataYear ?? orgMetricsDataYear;
    const reportPriorYear = years?.priorYear ?? orgMetricsPriorYear;
    sections.push(
      buildSection(
        "organization",
        toSectionKey("measure", measureKey),
        formatMetricSectionTitle("Measure Performance", label),
        metricType,
        snapshots,
        recordMap,
        topLimit,
        reportDataYear,
        reportPriorYear,
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
): MetricAggregate {
  if (!collection.has(key)) {
    collection.set(key, new Map());
  }
  const aggregates = collection.get(key)!;
  if (!aggregates.has(contractId)) {
    aggregates.set(contractId, {
      currentRateSum: 0,
      currentRateWeight: 0,
      currentRateYear: null,
      priorRateSum: 0,
      priorRateWeight: 0,
      priorRateYear: null,
      currentStarSum: 0,
      currentStarWeight: 0,
      currentStarYear: null,
      priorStarSum: 0,
      priorStarWeight: 0,
      priorStarYear: null,
    });
  }

  const aggregate = aggregates.get(contractId)!;
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
  const isRate = metricType === "rate";

  if (dataYear !== null && year === dataYear) {
    if (isRate) {
      if (aggregate.currentRateYear !== dataYear) {
        aggregate.currentRateYear = dataYear;
        aggregate.currentRateSum = 0;
        aggregate.currentRateWeight = 0;
      }
      aggregate.currentRateSum += value * weight;
      aggregate.currentRateWeight += weight;
    } else {
      if (aggregate.currentStarYear !== dataYear) {
        aggregate.currentStarYear = dataYear;
        aggregate.currentStarSum = 0;
        aggregate.currentStarWeight = 0;
      }
      aggregate.currentStarSum += value * weight;
      aggregate.currentStarWeight += weight;
    }
    return;
  }

  if (priorYear !== null && year === priorYear) {
    if (isRate) {
      if (aggregate.priorRateYear !== priorYear) {
        aggregate.priorRateYear = priorYear;
        aggregate.priorRateSum = 0;
        aggregate.priorRateWeight = 0;
      }
      aggregate.priorRateSum += value * weight;
      aggregate.priorRateWeight += weight;
    } else {
      if (aggregate.priorStarYear !== priorYear) {
        aggregate.priorStarYear = priorYear;
        aggregate.priorStarSum = 0;
        aggregate.priorStarWeight = 0;
      }
      aggregate.priorStarSum += value * weight;
      aggregate.priorStarWeight += weight;
    }
    return;
  }

  if (dataYear !== null && year < dataYear) {
    if (isRate) {
      if (aggregate.priorRateYear === null || year > aggregate.priorRateYear) {
        aggregate.priorRateYear = year;
        aggregate.priorRateSum = value * weight;
        aggregate.priorRateWeight = weight;
      } else if (year === aggregate.priorRateYear) {
        aggregate.priorRateSum += value * weight;
        aggregate.priorRateWeight += weight;
      }
    } else {
      if (aggregate.priorStarYear === null || year > aggregate.priorStarYear) {
        aggregate.priorStarYear = year;
        aggregate.priorStarSum = value * weight;
        aggregate.priorStarWeight = weight;
      } else if (year === aggregate.priorStarYear) {
        aggregate.priorStarSum += value * weight;
        aggregate.priorStarWeight += weight;
      }
    }
  }
}

function snapshotsFromAggregates(aggregates: Map<string, MetricAggregate>) {
  const snapshots: MetricSnapshots = new Map();
  let sectionMetricType: "stars" | "rate" = "stars";
  let anyCurrentRate = false;
  let anyPriorRate = false;
  let anyCurrentStar = false;
  let anyPriorStar = false;

  for (const aggregate of aggregates.values()) {
    if (aggregate.currentRateWeight > 0) anyCurrentRate = true;
    if (aggregate.priorRateWeight > 0) anyPriorRate = true;
    if (aggregate.currentStarWeight > 0) anyCurrentStar = true;
    if (aggregate.priorStarWeight > 0) anyPriorStar = true;
  }

  if (anyCurrentRate && anyPriorRate) {
    sectionMetricType = "rate";
  } else if (anyCurrentStar && anyPriorStar) {
    sectionMetricType = "stars";
  } else {
    sectionMetricType = anyCurrentRate ? "rate" : "stars";
  }

  for (const [contractId, aggregate] of aggregates.entries()) {
    let current: number | null = null;
    let prior: number | null = null;
    let currentYear: number | null = null;
    let priorYear: number | null = null;

    if (sectionMetricType === "rate") {
      current =
        aggregate.currentRateWeight > 0
          ? aggregate.currentRateSum / aggregate.currentRateWeight
          : null;
      prior =
        aggregate.priorRateWeight > 0
          ? aggregate.priorRateSum / aggregate.priorRateWeight
          : null;
      currentYear = aggregate.currentRateWeight > 0 ? aggregate.currentRateYear : null;
      priorYear = aggregate.priorRateWeight > 0 ? aggregate.priorRateYear : null;
    } else {
      current =
        aggregate.currentStarWeight > 0
          ? aggregate.currentStarSum / aggregate.currentStarWeight
          : null;
      prior =
        aggregate.priorStarWeight > 0
          ? aggregate.priorStarSum / aggregate.priorStarWeight
          : null;
      currentYear = aggregate.currentStarWeight > 0 ? aggregate.currentStarYear : null;
      priorYear = aggregate.priorStarWeight > 0 ? aggregate.priorStarYear : null;
    }

    if (current !== null || prior !== null) {
      snapshots.set(contractId, {
        current,
        prior,
        currentYear,
        priorYear,
      });
    }
  }

  return { snapshots, metricType: sectionMetricType };
}

function resolveMetricValue(row: MetricRow): { value: number; metricType: "stars" | "rate" } | null {
  const star = toNumeric(row.star_rating);
  if (star !== null) {
    return { value: star, metricType: "stars" };
  }

  const rate = toNumeric(row.rate_percent);
  if (rate !== null) {
    return { value: rate, metricType: "rate" };
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
      let currentYear: number | null = null;
      let priorYear: number | null = null;

      for (const contractId of contracts) {
        const snapshot = source.get(contractId);
        if (!snapshot) continue;

        const weight = contractRecords.get(contractId)?.totalEnrollment ?? null;
        const appliedWeight = weight && weight > 0 ? weight : 1;

        if (snapshot.current !== null) {
          currentTotal += snapshot.current * appliedWeight;
          currentWeight += appliedWeight;
          if (snapshot.currentYear !== null) {
            if (currentYear === null || snapshot.currentYear > currentYear) {
              currentYear = snapshot.currentYear;
            }
          }
        }

        if (snapshot.prior !== null) {
          priorTotal += snapshot.prior * appliedWeight;
          priorWeight += appliedWeight;
          if (snapshot.priorYear !== null) {
            if (priorYear === null || snapshot.priorYear > priorYear) {
              priorYear = snapshot.priorYear;
            }
          }
        }
      }

      const currentAvg = currentWeight > 0 ? currentTotal / currentWeight : null;
      const priorAvg = priorWeight > 0 ? priorTotal / priorWeight : null;

      if (currentAvg !== null || priorAvg !== null) {
        aggregated.set(organization.organization, {
          current: currentAvg,
          prior: priorAvg,
          currentYear: currentYear ?? snapshots.dataYear ?? null,
          priorYear: priorYear ?? snapshots.priorYear ?? null,
        });
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
