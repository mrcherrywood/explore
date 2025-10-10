import { normalizeContractId, type ServiceSupabaseClient } from "@/lib/leaderboard/contracts";

export type MeasureValueType = "percent" | "star" | "numeric";

export type ContractMeasureValue = {
  value: number | null;
  unit: string | null;
  year: number | null;
  valueType: MeasureValueType;
};

export type MeasureDetails = {
  code: string;
  name: string;
  domain: string | null;
  weight: number | null;
  unit: string | null;
  valueType: MeasureValueType;
  latestYear: number | null;
  contractValues: Map<string, ContractMeasureValue>;
  contractsWithData: number;
};

export type MeasurePoint = {
  value: number | null;
  unit: string | null;
  year: number | null;
  valueType: MeasureValueType;
};

export type MeasurePointWithPercentile = MeasurePoint & {
  percentile: number | null;
};

export type MeasureStats = {
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
};

type MeasureMetricRow = {
  contract_id: string | null;
  rate_percent: number | null;
  value_numeric: number | null;
  value_unit: string | null;
  star_rating: string | null;
  year: number | null;
};

type MeasureMetadataRow = {
  code: string;
  name: string | null;
  alias: string | null;
  domain: string | null;
  weight: number | null;
  year: number | null;
};

export async function fetchMeasureDetails(
  supabase: ServiceSupabaseClient,
  contractIds: string[],
  measureCode: string,
  preferredYear?: number
): Promise<MeasureDetails | null> {
  if (!contractIds.length) {
    return null;
  }

  let metadataQuery = supabase
    .from("ma_measures")
    .select("code, name, alias, domain, weight, year")
    .eq("code", measureCode)
    .order("year", { ascending: false })
    .limit(1);

  if (typeof preferredYear === "number") {
    metadataQuery = metadataQuery.lte("year", preferredYear ?? 0);
  }

  const { data: metadataRows, error: metadataError } = await metadataQuery;

  if (metadataError) {
    throw new Error(metadataError.message);
  }

  if (!metadataRows || metadataRows.length === 0) {
    return null;
  }

  const metadata = metadataRows[0] as MeasureMetadataRow;

  const metricRows: MeasureMetricRow[] = [];
  const chunkSize = 500;
  for (let index = 0; index < contractIds.length; index += chunkSize) {
    const chunk = contractIds.slice(index, index + chunkSize);
    let metricQuery = supabase
      .from("ma_metrics")
      .select("contract_id, rate_percent, value_numeric, value_unit, star_rating, year")
      .eq("metric_code", measureCode)
      .in("contract_id", chunk)
      .order("year", { ascending: false });

    if (typeof preferredYear === "number") {
      metricQuery = metricQuery.lte("year", preferredYear);
    }

    const { data, error } = await metricQuery;

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      metricRows.push(...(data as MeasureMetricRow[]));
    }
  }

  if (!metricRows.length) {
    return {
      code: measureCode,
      name: resolveMeasureName(metadata),
      domain: metadata.domain ?? null,
      weight: metadata.weight ?? null,
      unit: null,
      valueType: "numeric",
      latestYear: metadata.year ?? null,
      contractValues: new Map(),
      contractsWithData: 0,
    };
  }

  const contractValues = buildMeasureValueMap(metricRows);
  const valuesForStats = Array.from(contractValues.values())
    .map((entry) => entry.value)
    .filter((value): value is number => value !== null);

  let dominantValueType: MeasureValueType = "numeric";
  if (contractValues.size) {
    const typePriority: Record<MeasureValueType, number> = { percent: 3, numeric: 2, star: 1 };
    dominantValueType = Array.from(contractValues.values()).reduce<MeasureValueType>((current, entry) => {
      if (entry.value === null) {
        return current;
      }
      const currentPriority = typePriority[current];
      const newPriority = typePriority[entry.valueType];
      return newPriority > currentPriority ? entry.valueType : current;
    }, "star");
  }

  const latestYear = contractValues.size
    ? Math.max(
        ...Array.from(contractValues.values())
          .map((entry) => entry.year ?? -Infinity)
          .filter((value) => Number.isFinite(value))
      )
    : metadata.year ?? null;

  const unit = determineMeasureUnit(contractValues, dominantValueType);

  return {
    code: measureCode,
    name: resolveMeasureName(metadata),
    domain: metadata.domain ?? null,
    weight: metadata.weight ?? null,
    unit,
    valueType: dominantValueType,
    latestYear: Number.isFinite(latestYear) ? (latestYear as number) : metadata.year ?? null,
    contractValues,
    contractsWithData: valuesForStats.length,
  };
}

export function determineMeasureUnit(
  values: Map<string, ContractMeasureValue>,
  dominantValueType: MeasureValueType
): string | null {
  if (dominantValueType === "percent") {
    return "%";
  }
  if (dominantValueType === "star") {
    return "stars";
  }

  for (const entry of values.values()) {
    if (entry.unit) {
      return entry.unit;
    }
  }

  return null;
}

export type ContractWithId = { contractId: string };

export function collectMeasureValues(
  contracts: ContractWithId[],
  measureValues: Map<string, ContractMeasureValue>
): number[] {
  const values: number[] = [];
  for (const record of contracts) {
    const entry = measureValues.get(record.contractId);
    if (!entry || entry.value === null) {
      continue;
    }
    values.push(entry.value);
  }
  return values;
}

export function buildMeasurePoint(value: ContractMeasureValue | undefined): MeasurePoint | undefined {
  if (!value) {
    return undefined;
  }
  return {
    value: value.value,
    unit: value.unit,
    year: value.year,
    valueType: value.valueType,
  };
}

export function resolveMeasureName(metadata: MeasureMetadataRow): string {
  return metadata.name ?? metadata.alias ?? metadata.code;
}

export function buildMeasureValueMap(rows: MeasureMetricRow[]): Map<string, ContractMeasureValue> {
  const map = new Map<string, ContractMeasureValue>();
  const valuePriority: Record<MeasureValueType, number> = { percent: 3, numeric: 2, star: 1 };

  for (const row of rows) {
    const contractId = normalizeContractId(row.contract_id);
    if (!contractId) {
      continue;
    }

    const candidate = extractMeasureValue(row);
    if (!candidate) {
      continue;
    }

    const existing = map.get(contractId);
    if (!existing) {
      map.set(contractId, candidate);
      continue;
    }

    const existingYear = existing.year ?? -Infinity;
    const candidateYear = candidate.year ?? -Infinity;

    if (candidateYear > existingYear) {
      map.set(contractId, candidate);
      continue;
    }

    if (candidateYear === existingYear && valuePriority[candidate.valueType] > valuePriority[existing.valueType]) {
      map.set(contractId, candidate);
    }
  }

  return map;
}

export function extractMeasureValue(row: MeasureMetricRow): ContractMeasureValue | null {
  const year = row.year ?? null;

  if (row.rate_percent !== null && row.rate_percent !== undefined && Number.isFinite(Number(row.rate_percent))) {
    const value = Number(row.rate_percent);
    return {
      value,
      unit: "%",
      year,
      valueType: "percent",
    };
  }

  if (row.value_numeric !== null && row.value_numeric !== undefined && Number.isFinite(Number(row.value_numeric))) {
    const value = Number(row.value_numeric);
    return {
      value,
      unit: row.value_unit ?? null,
      year,
      valueType: "numeric",
    };
  }

  if (row.star_rating !== null && row.star_rating !== undefined) {
    const parsed = Number.parseFloat(String(row.star_rating));
    if (Number.isFinite(parsed)) {
      return {
        value: parsed,
        unit: "stars",
        year,
        valueType: "star",
      };
    }
  }

  return null;
}
