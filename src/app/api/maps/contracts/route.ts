import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  fetchContractLandscape,
  fetchLatestEnrollmentPeriod,
} from "@/lib/leaderboard/data";
import { NATIONAL_STATE_CODE, NATIONAL_STATE_NAME, US_STATE_NAMES } from "@/lib/leaderboard/states";
import {
  CONTRACT_SERIES_SET,
  PLAN_TYPE_SET,
  VALID_ENROLLMENT_LEVELS,
} from "@/lib/leaderboard/filters";
import {
  buildContractRecords,
  fetchSummarySnapshots,
  filterContracts,
  type ContractRecord,
  type ContractSnapshots,
} from "@/lib/leaderboard/contracts";
import {
  fetchMeasureDetails,
  collectMeasureValues,
  type ContractMeasureValue,
  type MeasurePoint,
  type MeasurePointWithPercentile,
  type MeasureValueType,
} from "@/lib/leaderboard/measure-insights";
import type { ContractLeaderboardSelection } from "@/lib/leaderboard/types";
import type { EnrollmentLevelId } from "@/lib/peer/enrollment-levels";

export const runtime = "nodejs";

const DEFAULT_PLAN_TYPE: ContractLeaderboardSelection["planTypeGroup"] = "ALL";
const DEFAULT_CONTRACT_SERIES: ContractLeaderboardSelection["contractSeries"] = "H_ONLY";
const DEFAULT_ENROLLMENT_LEVEL: EnrollmentLevelId = "all";

export type MapContractResponse = {
  generatedAt: string;
  geography: {
    type: "state" | "national";
    code: string;
    name: string;
  };
  filters: {
    planTypeGroup: ContractLeaderboardSelection["planTypeGroup"];
    enrollmentLevel: EnrollmentLevelId;
    contractSeries: ContractLeaderboardSelection["contractSeries"];
    blueOnly: boolean;
    measureCode: string | null;
  };
  dataYear: number | null;
  priorYear: number | null;
  cohort: CohortSnapshot;
  targetContract?: TargetContractSnapshot;
  contracts: ContractComparisonSnapshot[];
  measure?: {
    summary: MeasureSummary;
    target?: MeasurePointWithPercentile;
  };
};

type CohortSnapshot = {
  contractCount: number;
  overall: MetricStats;
  partC: MetricStats;
  partD: MetricStats;
};

type MetricStats = {
  count: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
};

type MetricPoint = {
  current: number | null;
  prior: number | null;
  delta: number | null;
};

type MeasureSummary = {
  code: string;
  name: string;
  domain: string | null;
  weight: number | null;
  unit: string | null;
  valueType: MeasureValueType;
  latestYear: number | null;
  contractsWithData: number;
  stats: MetricStats;
};

type ContractComparisonSnapshot = {
  contractId: string;
  label: string;
  parentOrganization: string | null;
  dominantShare: number | null;
  dominantState: string | null;
  isBlueCrossBlueShield: boolean;
  totalEnrollment: number | null;
  metrics: {
    overall: MetricPoint;
    partC: MetricPoint;
    partD: MetricPoint;
  };
  measure?: MeasurePoint;
};

type TargetContractSnapshot = ContractComparisonSnapshot & {
  percentile: {
    overall: number | null;
    partC: number | null;
    partD: number | null;
  };
  measure?: MeasurePointWithPercentile;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const stateParam = normalizeState(searchParams.get("state"));
    if (!stateParam) {
      return NextResponse.json(
        { error: "state query parameter is required" },
        { status: 400 }
      );
    }

    const isNational = stateParam === NATIONAL_STATE_CODE;
    const stateName = isNational ? NATIONAL_STATE_NAME : US_STATE_NAMES[stateParam];
    if (!stateName) {
      return NextResponse.json(
        { error: `Unknown state code '${stateParam}'` },
        { status: 400 }
      );
    }

    const planTypeGroup = parsePlanTypeGroup(searchParams.get("planTypeGroup"));
    const contractSeries = parseContractSeries(searchParams.get("contractSeries"));
    const enrollmentLevel = parseEnrollmentLevel(searchParams.get("enrollmentLevel"));
    const blueOnly = parseBoolean(searchParams.get("blueOnly"));
    const contractId = normalizeContractId(searchParams.get("contractId"));
    const measureCode = parseMeasureCode(searchParams.get("measure"));

    const supabase = createServiceRoleClient();

    const period = await fetchLatestEnrollmentPeriod(supabase);
    if (!period) {
      return NextResponse.json(
        { error: "No enrollment period available" },
        { status: 503 }
      );
    }

    const landscapeRows = await fetchContractLandscape(supabase, period);
    const contractRecords = buildContractRecords(landscapeRows);

    const selection: ContractLeaderboardSelection = {
      stateOption: isNational ? "all" : "state",
      state: isNational ? undefined : stateParam,
      planTypeGroup,
      enrollmentLevel,
      contractSeries,
      blueOnly,
    };

    const filteredContracts = filterContracts(contractRecords, selection);
    if (!filteredContracts.length) {
      return NextResponse.json(
        { error: "No contracts match the requested filters" },
        { status: 404 }
      );
    }

    if (contractId && !filteredContracts.some((record) => record.contractId === contractId)) {
      return NextResponse.json(
        { error: `Contract '${contractId}' not found for ${stateName}` },
        { status: 404 }
      );
    }

    const snapshots = await fetchSummarySnapshots(
      supabase,
      filteredContracts.map((record) => record.contractId)
    );

    const measureDetails = measureCode
      ? await fetchMeasureDetails(
          supabase,
          filteredContracts.map((record) => record.contractId),
          measureCode
        )
      : null;

    if (measureCode && !measureDetails) {
      return NextResponse.json(
        { error: `Measure '${measureCode}' has no associated data` },
        { status: 404 }
      );
    }

    const overallValues = collectMetricValues(snapshots, filteredContracts, "overall");
    const partCValues = collectMetricValues(snapshots, filteredContracts, "partC");
    const partDValues = collectMetricValues(snapshots, filteredContracts, "partD");

    const contracts = filteredContracts.map((record) =>
      buildContractSnapshot(record, snapshots, measureDetails?.contractValues)
    );

    const measureValueArray = measureDetails
      ? collectMeasureValues(filteredContracts, measureDetails.contractValues)
      : [];

    const target = contractId
      ? buildTargetContractSnapshot(
          contractId,
          filteredContracts,
          contractRecords,
          snapshots,
          overallValues,
          partCValues,
          partDValues,
          measureDetails?.contractValues ?? null,
          measureValueArray
        )
      : undefined;

    const response: MapContractResponse = {
      generatedAt: new Date().toISOString(),
      geography: {
        type: isNational ? "national" : "state",
        code: stateParam,
        name: stateName,
      },
      filters: {
        planTypeGroup,
        enrollmentLevel,
        contractSeries,
        blueOnly,
        measureCode,
      },
      dataYear: snapshots.dataYear,
      priorYear: snapshots.priorYear,
      cohort: {
        contractCount: filteredContracts.length,
        overall: computeMetricStats(overallValues),
        partC: computeMetricStats(partCValues),
        partD: computeMetricStats(partDValues),
      },
      targetContract: target,
      contracts,
    };

    if (measureDetails) {
      response.measure = {
        summary: {
          code: measureDetails.code,
          name: measureDetails.name,
          domain: measureDetails.domain,
          weight: measureDetails.weight,
          unit: measureDetails.unit,
          valueType: measureDetails.valueType,
          latestYear: measureDetails.latestYear,
          contractsWithData: measureDetails.contractsWithData,
          stats: computeMetricStats(measureValueArray),
        },
        target: target?.measure,
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Maps contracts API error:", error);
    return NextResponse.json(
      {
        error: "Failed to build contract comparison",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function normalizeState(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed === NATIONAL_STATE_CODE) {
    return trimmed;
  }
  return trimmed.length === 2 ? trimmed : null;
}

function normalizeContractId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

function parseMeasureCode(input: string | null): string | null {
  if (!input) return null;
  const value = input.trim().toUpperCase();
  return value ? value : null;
}

function parsePlanTypeGroup(input: string | null): ContractLeaderboardSelection["planTypeGroup"] {
  if (!input) return DEFAULT_PLAN_TYPE;
  const value = input.trim().toUpperCase() as ContractLeaderboardSelection["planTypeGroup"];
  return PLAN_TYPE_SET.has(value) ? value : DEFAULT_PLAN_TYPE;
}

function parseContractSeries(input: string | null): ContractLeaderboardSelection["contractSeries"] {
  if (!input) return DEFAULT_CONTRACT_SERIES;
  const value = input.trim().toUpperCase() as ContractLeaderboardSelection["contractSeries"];
  return CONTRACT_SERIES_SET.has(value) ? value : DEFAULT_CONTRACT_SERIES;
}

function parseEnrollmentLevel(input: string | null): EnrollmentLevelId {
  if (!input) return DEFAULT_ENROLLMENT_LEVEL;
  const value = input.trim().toLowerCase() as EnrollmentLevelId;
  return VALID_ENROLLMENT_LEVELS.has(value) ? value : DEFAULT_ENROLLMENT_LEVEL;
}

function parseBoolean(input: string | null): boolean {
  if (!input) return false;
  const normalized = input.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

type MetricKey = keyof Pick<ContractSnapshots, "overall" | "partC" | "partD">;

type MetricCollection = {
  overall: MetricPoint;
  partC: MetricPoint;
  partD: MetricPoint;
};

function buildContractSnapshot(
  record: ContractRecord,
  snapshots: ContractSnapshots,
  measureValues?: Map<string, ContractMeasureValue>
): ContractComparisonSnapshot {
  const measure = measureValues?.get(record.contractId);

  return {
    contractId: record.contractId,
    label: contractLabel(record),
    parentOrganization: record.parentOrganization ?? null,
    dominantShare: record.dominantShare ?? null,
    dominantState: record.dominantState ?? null,
    isBlueCrossBlueShield: record.isBlueCrossBlueShield,
    totalEnrollment: record.totalEnrollment ?? null,
    metrics: buildMetricCollection(record.contractId, snapshots),
    measure: measure
      ? {
          value: measure.value,
          unit: measure.unit,
          year: measure.year,
          valueType: measure.valueType,
        }
      : undefined,
  };
}

function buildTargetContractSnapshot(
  contractId: string,
  filteredContracts: ContractRecord[],
  contractRecords: Map<string, ContractRecord>,
  snapshots: ContractSnapshots,
  overallValues: number[],
  partCValues: number[],
  partDValues: number[],
  measureValues: Map<string, ContractMeasureValue> | null,
  measureNumericValues: number[]
): TargetContractSnapshot | undefined {
  const record = contractRecords.get(contractId);
  if (!record) {
    return undefined;
  }

  const base = buildContractSnapshot(record, snapshots, measureValues ?? undefined);
  const percentiles = {
    overall: computePercentile(overallValues, base.metrics.overall.current),
    partC: computePercentile(partCValues, base.metrics.partC.current),
    partD: computePercentile(partDValues, base.metrics.partD.current),
  };

  let measure: MeasurePointWithPercentile | undefined;
  if (measureValues && measureNumericValues.length) {
    const entry = measureValues.get(contractId);
    if (entry && entry.value !== null) {
      measure = {
        value: entry.value,
        unit: entry.unit,
        year: entry.year,
        valueType: entry.valueType,
        percentile: computePercentile(measureNumericValues, entry.value),
      };
    }
  }

  return {
    ...base,
    percentile: percentiles,
    measure,
  };
}

function buildMetricCollection(contractId: string, snapshots: ContractSnapshots): MetricCollection {
  return {
    overall: toMetricPoint(snapshots.overall.get(contractId)),
    partC: toMetricPoint(snapshots.partC.get(contractId)),
    partD: toMetricPoint(snapshots.partD.get(contractId)),
  };
}

function toMetricPoint(source: { current: number | null; prior: number | null } | undefined): MetricPoint {
  if (!source) {
    return { current: null, prior: null, delta: null };
  }

  const { current, prior } = source;
  const delta = current !== null && prior !== null ? current - prior : null;
  return { current, prior, delta };
}

function collectMetricValues(
  snapshots: ContractSnapshots,
  contracts: ContractRecord[],
  key: MetricKey
): number[] {
  const values: number[] = [];
  for (const record of contracts) {
    const entry = snapshots[key].get(record.contractId);
    if (!entry || entry.current === null) {
      continue;
    }
    values.push(entry.current);
  }
  return values;
}

function computeMetricStats(values: number[]): MetricStats {
  if (!values.length) {
    return {
      count: 0,
      average: null,
      median: null,
      min: null,
      max: null,
      q1: null,
      q3: null,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const average = sorted.reduce((sum, value) => sum + value, 0) / count;
  const median = computeMedian(sorted);
  const { q1, q3 } = computeQuartiles(sorted);

  return {
    count,
    average,
    median,
    min,
    max,
    q1,
    q3,
  };
}

function computeMedian(values: number[]): number {
  const length = values.length;
  const mid = Math.floor(length / 2);
  if (length % 2 === 0) {
    return (values[mid - 1] + values[mid]) / 2;
  }
  return values[mid];
}

function computeQuartiles(values: number[]): { q1: number | null; q3: number | null } {
  if (values.length < 2) {
    return { q1: null, q3: null };
  }

  const length = values.length;
  const mid = Math.floor(length / 2);
  const lower = values.slice(0, length % 2 === 0 ? mid : mid);
  const upper = values.slice(length % 2 === 0 ? mid : mid + 1);

  return {
    q1: lower.length ? computeMedian(lower) : null,
    q3: upper.length ? computeMedian(upper) : null,
  };
}

function computePercentile(values: number[], target: number | null): number | null {
  if (target === null || !values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  let rank = 0;
  for (const value of sorted) {
    if (value <= target) {
      rank += 1;
    } else {
      break;
    }
  }

  const percentile = (rank / sorted.length) * 100;
  return Number.isFinite(percentile) ? Number(percentile.toFixed(2)) : null;
}

function contractLabel(contract: ContractRecord): string {
  return contract.marketingName ?? contract.contractName ?? contract.contractId;
}

