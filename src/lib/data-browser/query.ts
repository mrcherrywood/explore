import { createServiceRoleClient } from "@/lib/supabase/server";
import type { TableConfig, TableName } from "./config";

const MAX_ROWS = 500;
const FILTER_OPTION_PAGE_SIZE = 1000;

export type QueryOptions = {
  search?: string;
  sortColumn?: string;
  ascending?: boolean;
  limit?: number;
  year?: number;
  contractId?: string;
};

export type QueryResult = {
  rows: Record<string, unknown>[];
  count: number;
};

export type FilterOptions = {
  years: number[];
  contractIds: string[];
};

type Comparable = string | number;

async function fetchOrderedDistinctValues<T extends Comparable>(
  supabase: ReturnType<typeof createServiceRoleClient>,
  table: TableName,
  column: string,
  transform: (value: unknown) => T | null,
  ascending: boolean,
  pageSize = FILTER_OPTION_PAGE_SIZE
): Promise<Set<T>> {
  const seen = new Set<T>();
  let cursor: T | null = null;

  while (true) {
    let query = supabase
      .from(table)
      .select(column)
      .not(column, "is", null)
      .order(column, { ascending })
      .limit(pageSize);

    if (cursor !== null) {
      const comparableCursor = cursor as unknown as Comparable;
      query = ascending
        ? query.gt(column, comparableCursor)
        : query.lt(column, comparableCursor);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) {
      break;
    }

    let lastValueInPage: T | null = null;
    for (const row of rows) {
      const value = transform(row[column]);
      if (value !== null) {
        seen.add(value);
        lastValueInPage = value;
      }
    }

    if (rows.length < pageSize || lastValueInPage === null) {
      break;
    }

    cursor = lastValueInPage;
  }

  return seen;
}

export async function fetchTableData(
  config: TableConfig,
  table: TableName,
  { search, sortColumn, ascending = true, limit = MAX_ROWS, year, contractId }: QueryOptions = {}
): Promise<QueryResult> {
  const supabase = createServiceRoleClient();
  const tableRef = supabase.from(table);

  let query = tableRef.select("*", { count: "exact" });

  if (!sortColumn && config.defaultSort) {
    query = query.order(config.defaultSort.column, { ascending: config.defaultSort.ascending });
  }

  if (sortColumn) {
    query = query.order(sortColumn, { ascending });
  }

  if (typeof year === "number" && config.columns.some((column) => column.key === "year")) {
    query = query.eq("year", year);
  }

  if (contractId && config.columns.some((column) => column.key === "contract_id")) {
    query = query.eq("contract_id", contractId);
  }

  if (search) {
    const terms = search
      .split(/[\s\n]+/g)
      .map((term) => term.trim())
      .filter(Boolean);

    if (terms.length > 0 && config.searchableColumns.length > 0) {
      const orFilters: string[] = [];
      for (const term of terms) {
        const likeTerm = `%${term.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
        for (const column of config.searchableColumns) {
          orFilters.push(`${column}.ilike.${likeTerm}`);
        }
      }

      if (orFilters.length > 0) {
        query = query.or(orFilters.join(","));
      }
    }
  }

  const cappedLimit = Math.min(limit ?? MAX_ROWS, MAX_ROWS);
  query = query.limit(cappedLimit);

  const { data, count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    rows: (data ?? []) as Record<string, unknown>[],
    count: count ?? 0,
  };
}

export async function fetchFilterOptions(config: TableConfig, table: TableName): Promise<FilterOptions> {
  const supabase = createServiceRoleClient();

  const supportsYear = config.columns.some((column) => column.key === "year");
  const supportsContract = config.columns.some((column) => column.key === "contract_id");

  let years: number[] = [];
  if (supportsYear) {
    const distinctYears = await fetchOrderedDistinctValues<number>(
      supabase,
      table,
      "year",
      (value) => {
        if (typeof value === "number") return value;
        if (typeof value === "string") {
          const parsed = Number.parseInt(value, 10);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      },
      false
    );

    years = Array.from(distinctYears).sort((a, b) => b - a);
  }

  let contractIds: string[] = [];
  if (supportsContract) {
    const distinctContracts = await fetchOrderedDistinctValues<string>(
      supabase,
      table,
      "contract_id",
      (value) => {
        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
        return null;
      },
      true
    );

    contractIds = Array.from(distinctContracts).sort((a, b) => a.localeCompare(b, "en-US", { numeric: true }));
  }

  return { years, contractIds };
}
