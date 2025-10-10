import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchContractLandscape, fetchLatestEnrollmentPeriod } from "@/lib/leaderboard/data";
import { buildContractRecords, fetchSummarySnapshots, filterContracts, type ContractRecord } from "@/lib/leaderboard/contracts";
import { CONTRACT_SERIES_SET, PLAN_TYPE_SET, VALID_ENROLLMENT_LEVELS } from "@/lib/leaderboard/filters";
import { fetchMeasureDetails, type ContractMeasureValue, type MeasurePoint } from "@/lib/leaderboard/measure-insights";
import { US_STATE_NAMES } from "@/lib/leaderboard/states";
import { isSupportedEnrollmentYear } from "@/lib/leaderboard/constants";
import type { ContractLeaderboardSelection } from "@/lib/leaderboard/types";
import { formatEnrollment } from "@/lib/peer/enrollment-levels";

export const runtime = "nodejs";

type StateAggregate = {
  code: string;
  count: number;
  totalEnrollment: number;
  contractIds: string[];
};

type StateResponse = {
  code: string;
  name: string;
  totalEnrollment: number | null;
  formattedEnrollment: string;
  contractCount: number;
  averageStarRating: number | null;
  contractsWithStars: number;
  measure?: {
    code: string;
    average: number | null;
    unit: string | null;
    valueType: MeasurePoint["valueType"];
    contractsWithMeasure: number;
  };
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const measureCode = parseMeasureCode(searchParams.get("measure"));
    const blueOnly = parseBoolean(searchParams.get("blueOnly"));
    const planTypeGroup = parsePlanTypeGroup(searchParams.get("planTypeGroup"));
    const contractSeries = parseContractSeries(searchParams.get("contractSeries"));
    const enrollmentLevel = parseEnrollmentLevel(searchParams.get("enrollmentLevel"));
    const year = parseYear(searchParams.get("year"));

    let supabase;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("Leaderboard states API configuration error", clientError);
      return NextResponse.json(
        { error: "Supabase credentials not configured", code: "SUPABASE_CONFIG_MISSING" },
        { status: 503 }
      );
    }

    const period = await fetchLatestEnrollmentPeriod(supabase, year);
    if (!period) {
      return NextResponse.json({ states: [], measure: null });
    }

    const contracts = await fetchContractLandscape(supabase, period);
    const contractRecords = buildContractRecords(contracts);

    const selection: ContractLeaderboardSelection = {
      stateOption: "all",
      planTypeGroup,
      enrollmentLevel,
      contractSeries,
      blueOnly,
    };

    const filteredContracts = filterContracts(contractRecords, selection);

    const aggregates = buildStateAggregates(filteredContracts);
    const stateAggregates = Array.from(aggregates.values());
    const allContractIds = Array.from(new Set(stateAggregates.flatMap((state) => state.contractIds)));

    let starSnapshots: Awaited<ReturnType<typeof fetchSummarySnapshots>> | null = null;
    if (allContractIds.length > 0) {
      starSnapshots = await fetchSummarySnapshots(supabase, allContractIds);
    }

    const measureDetails = measureCode && allContractIds.length
      ? await fetchMeasureDetails(supabase, allContractIds, measureCode)
      : null;

    const states: StateResponse[] = stateAggregates
      .map((aggregate) => buildStateResponse(aggregate, starSnapshots, measureDetails))
      .sort((a, b) => {
        const aEnroll = a.totalEnrollment ?? -1;
        const bEnroll = b.totalEnrollment ?? -1;
        if (aEnroll === bEnroll) {
          return a.code.localeCompare(b.code);
        }
        return bEnroll - aEnroll;
      });

    return NextResponse.json({
      states,
      measure: measureDetails
        ? {
            code: measureDetails.code,
            name: measureDetails.name,
            unit: measureDetails.unit,
            valueType: measureDetails.valueType,
            latestYear: measureDetails.latestYear,
            contractsWithData: measureDetails.contractsWithData,
            stats: computeMeasureStats(stateAggregates, measureDetails.contractValues),
          }
        : null,
    });
  } catch (error) {
    console.error("Leaderboard states API error", error);
    const detail = serializeError(error);
    return NextResponse.json(
      {
        error: "Failed to fetch leaderboard states",
        details: detail,
      },
      { status: 500 }
    );
  }
}

function serializeError(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }

  if (error instanceof Error) {
    const structured: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if ("code" in error && typeof (error as { code?: unknown }).code !== "undefined") {
      structured.code = (error as { code?: unknown }).code;
    }
    if ("details" in error && typeof (error as { details?: unknown }).details !== "undefined") {
      structured.details = (error as { details?: unknown }).details;
    }
    if ("hint" in error && typeof (error as { hint?: unknown }).hint !== "undefined") {
      structured.hint = (error as { hint?: unknown }).hint;
    }
    if (error.stack) {
      structured.stack = error.stack;
    }
    return safeStringify(structured);
  }

  if (typeof error === "object") {
    return safeStringify(error);
  }

  return String(error);
}

function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(
      value,
      (_key, innerValue) => {
        if (typeof innerValue === "object" && innerValue !== null) {
          if (seen.has(innerValue)) {
            return "[Circular]";
          }
          seen.add(innerValue);
        }
        return innerValue;
      },
      2
    );
  } catch {
    return String(value);
  }
}

function parseMeasureCode(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized ? normalized : null;
}

function parseBoolean(input: string | null): boolean {
  if (!input) return false;
  const normalized = input.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parsePlanTypeGroup(input: string | null): ContractLeaderboardSelection["planTypeGroup"] {
  if (!input) return "ALL";
  const value = input.trim().toUpperCase() as ContractLeaderboardSelection["planTypeGroup"];
  return PLAN_TYPE_SET.has(value) ? value : "ALL";
}

function parseContractSeries(input: string | null): ContractLeaderboardSelection["contractSeries"] {
  if (!input) return "H_ONLY";
  const value = input.trim().toUpperCase() as ContractLeaderboardSelection["contractSeries"];
  return CONTRACT_SERIES_SET.has(value) ? value : "H_ONLY";
}

function parseEnrollmentLevel(input: string | null): ContractLeaderboardSelection["enrollmentLevel"] {
  if (!input) return "all";
  const value = input.trim().toLowerCase() as ContractLeaderboardSelection["enrollmentLevel"];
  return VALID_ENROLLMENT_LEVELS.has(value) ? value : "all";
}

function parseYear(input: string | null): number | undefined {
  if (!input) return undefined;
  const numeric = Number.parseInt(input, 10);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return isSupportedEnrollmentYear(numeric) ? numeric : undefined;
}

function buildStateAggregates(contracts: ContractRecord[]): Map<string, StateAggregate> {
  const aggregates = new Map<string, StateAggregate>();

  for (const contract of contracts) {
    if (!contract.stateEligible || !contract.dominantState) {
      continue;
    }

    const code = contract.dominantState;
    if (!aggregates.has(code)) {
      aggregates.set(code, { code, count: 0, totalEnrollment: 0, contractIds: [] });
    }

    const stateData = aggregates.get(code)!;
    stateData.count += 1;
    stateData.totalEnrollment += contract.totalEnrollment ?? 0;
    stateData.contractIds.push(contract.contractId);
  }

  return aggregates;
}

function buildStateResponse(
  aggregate: StateAggregate,
  starSnapshots: Awaited<ReturnType<typeof fetchSummarySnapshots>> | null,
  measureDetails: Awaited<ReturnType<typeof fetchMeasureDetails>> | null
): StateResponse {
  const name = US_STATE_NAMES[aggregate.code] ?? aggregate.code;
  const totalEnrollment = aggregate.totalEnrollment > 0 ? aggregate.totalEnrollment : null;

  const starValues: number[] = [];
  if (starSnapshots) {
    for (const contractId of aggregate.contractIds) {
      const current = starSnapshots.overall.get(contractId)?.current;
      if (typeof current === "number" && Number.isFinite(current)) {
        starValues.push(current);
      }
    }
  }

  const averageStarRating = starValues.length
    ? starValues.reduce((sum, value) => sum + value, 0) / starValues.length
    : null;

  let measureSummary: StateResponse["measure"] | undefined;
  if (measureDetails) {
    const values: number[] = [];
    let contractsWithMeasure = 0;

    for (const contractId of aggregate.contractIds) {
      const entry = measureDetails.contractValues.get(contractId);
      if (entry && entry.value !== null) {
        values.push(entry.value);
        contractsWithMeasure += 1;
      }
    }

    const averageMeasure = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

    measureSummary = {
      code: measureDetails.code,
      average: averageMeasure,
      unit: measureDetails.unit,
      valueType: measureDetails.valueType,
      contractsWithMeasure,
    };
  }

  return {
    code: aggregate.code,
    name,
    totalEnrollment,
    formattedEnrollment: formatEnrollment(totalEnrollment),
    contractCount: aggregate.count,
    averageStarRating,
    contractsWithStars: starValues.length,
    measure: measureSummary,
  };
}

function computeMeasureStats(
  aggregates: StateAggregate[],
  measureValues: Map<string, ContractMeasureValue>
) {
  const values: number[] = [];
  for (const aggregate of aggregates) {
    for (const contractId of aggregate.contractIds) {
      const entry = measureValues.get(contractId);
      if (entry && entry.value !== null) {
        values.push(entry.value);
      }
    }
  }

  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const average = sorted.reduce((sum, value) => sum + value, 0) / count;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = computeMedian(sorted);
  const { q1, q3 } = computeQuartiles(sorted);

  return { count, average, min, max, median, q1, q3 };
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
