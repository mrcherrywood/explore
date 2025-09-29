import { notFound } from "next/navigation";
import { Database } from "lucide-react";

import { DataPageNav } from "@/components/navigation/DataPageNav";
import { ClearFiltersButton } from "@/components/data-browser/ClearFiltersButton";
import { ExportCsvButton } from "@/components/data-browser/ExportCsvButton";
import { ResizableTable } from "@/components/data-browser/ResizableTable";
import { TableTabs } from "@/components/data-browser/TableTabs";
import { TABLE_CONFIGS, TABLE_CONFIG_BY_NAME, DEFAULT_TABLE, type TableConfig } from "@/lib/data-browser/config";
import { fetchFilterOptions, fetchTableData } from "@/lib/data-browser/query";

const DEFAULT_DISPLAY_ROWS = 200;
const MAX_DISPLAY_ROWS = 1000;

function getValidatedConfig(tableParam: string | undefined): TableConfig {
  if (!tableParam) {
    return TABLE_CONFIG_BY_NAME.get(DEFAULT_TABLE)!;
  }
  const config = TABLE_CONFIG_BY_NAME.get(tableParam as TableConfig["name"]);
  if (!config) {
    notFound();
  }
  return config;
}

function getValidatedSort(config: TableConfig, columnParam: string | undefined) {
  if (!columnParam) return undefined;
  return config.columns.some((column) => column.key === columnParam) ? columnParam : undefined;
}

function getAscending(dirParam: string | undefined, fallbackAscending: boolean) {
  if (!dirParam) return fallbackAscending;
  return dirParam.toLowerCase() !== "desc";
}

export const metadata = {
  title: "Data Explorer • Program Insight Studio",
  description: "Browse Medicare Advantage data tables, run AI-assisted analysis, and generate charts.",
};

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default async function DataPage({ searchParams }: PageProps) {
  const tableParam = typeof searchParams.table === "string" ? searchParams.table : undefined;
  const config = getValidatedConfig(tableParam);
  const tableName = config.name;

  const searchTerm = typeof searchParams.q === "string" ? searchParams.q.trim() : undefined;
  const sortParam = typeof searchParams.sort === "string" ? searchParams.sort : undefined;
  const sortColumn = getValidatedSort(config, sortParam);
  const ascending = getAscending(
    typeof searchParams.dir === "string" ? searchParams.dir : undefined,
    config.defaultSort?.ascending ?? true
  );

  const limitParam = typeof searchParams.limit === "string" ? Number.parseInt(searchParams.limit, 10) : undefined;
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam ?? DEFAULT_DISPLAY_ROWS, 10), MAX_DISPLAY_ROWS) : DEFAULT_DISPLAY_ROWS;

  const supportsYear = config.columns.some((column) => column.key === "year");
  const supportsContract = config.columns.some((column) => column.key === "contract_id");

  const yearParamRaw = typeof searchParams.year === "string" ? searchParams.year.trim() : undefined;
  const yearParam = yearParamRaw ? Number.parseInt(yearParamRaw, 10) : undefined;
  const yearFilter = supportsYear && yearParam !== undefined && Number.isFinite(yearParam) ? yearParam : undefined;

  const contractParamRaw = typeof searchParams.contract === "string" ? searchParams.contract.trim() : undefined;
  const contractFilter = supportsContract && contractParamRaw ? contractParamRaw : undefined;

  const emptyFilterOptions = { years: [] as number[], contractIds: [] as string[] };
  const [tableData, filterOptions] = await Promise.all([
    fetchTableData(config, tableName, {
      search: searchTerm,
      sortColumn,
      ascending,
      limit,
      year: yearFilter,
      contractId: contractFilter,
    }),
    supportsYear || supportsContract ? fetchFilterOptions(config, tableName) : Promise.resolve(emptyFilterOptions),
  ]);

  const { rows, count } = tableData;
  const { years: availableYears, contractIds: availableContracts } = filterOptions;

  const baseParams = new URLSearchParams();
  baseParams.set("table", tableName);
  if (searchTerm) baseParams.set("q", searchTerm);
  if (sortColumn) baseParams.set("sort", sortColumn);
  if (sortColumn) baseParams.set("dir", ascending ? "asc" : "desc");
  if (limit) baseParams.set("limit", String(limit));
  if (supportsYear && yearFilter !== undefined) baseParams.set("year", String(yearFilter));
  if (supportsContract && contractFilter) baseParams.set("contract", contractFilter);

  const activeSort = sortColumn;
  const hasMoreRows = count > rows.length;
  const hasActiveFilters = searchTerm || yearFilter !== undefined || contractFilter;

  // Convert URLSearchParams to plain object for client component
  const baseParamsObj: Record<string, string> = {};
  baseParams.forEach((value, key) => {
    baseParamsObj[key] = value;
  });

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/5 px-10 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#080808] text-lg font-semibold">
              <Database className="h-5 w-5 text-slate-200" />
            </div>
            <div>
              <p className="text-[0.6rem] uppercase tracking-[0.55em] text-slate-500">Data Studio</p>
              <h1 className="text-2xl font-semibold text-slate-100">Medicare Advantage Explorer</h1>
            </div>
          </div>
          <div className="text-xs text-slate-500">{new Date().toLocaleString()}</div>
        </header>

        <main className="flex flex-1 flex-col gap-10 px-10 pb-10 pt-8">
          <section className="flex w-full flex-col gap-6">
            <div className="rounded-3xl border border-white/5 bg-[#080808]">
              <div className="flex flex-col gap-5 border-b border-white/5 px-8 py-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Table</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-100">{config.label}</h2>
                  <p className="mt-1 text-xs text-slate-500">{config.description}</p>
                </div>
                <TableTabs tables={TABLE_CONFIGS} currentTable={tableName} baseParams={baseParams} />
              </div>

              <div className="flex flex-col gap-4 px-8 py-6">
                <form className="flex flex-col gap-3" method="get">
                  <input type="hidden" name="table" value={tableName} />
                  {sortColumn ? <input type="hidden" name="sort" value={sortColumn} /> : null}
                  {sortColumn ? <input type="hidden" name="dir" value={ascending ? "asc" : "desc"} /> : null}
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-[#0a0a0a] px-4 py-2 text-sm text-slate-200">
                      <input
                        className="flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                        name="q"
                        defaultValue={searchTerm ?? ""}
                        placeholder={`Search ${config.label.toLowerCase()}...`}
                      />
                      <button
                        type="submit"
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-sky-400/60 hover:text-sky-200"
                      >
                        Search
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {supportsYear && availableYears.length > 0 ? (
                        <label className="flex items-center gap-2">
                          <span>Year</span>
                          <select
                            className="rounded-full border border-white/10 bg-[#0a0a0a] px-3 py-1 text-xs text-slate-300"
                            name="year"
                            defaultValue={yearFilter !== undefined ? String(yearFilter) : ""}
                          >
                            <option value="">All</option>
                            {availableYears.map((value) => (
                              <option key={value} value={String(value)}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {supportsContract && availableContracts.length > 0 ? (
                        <label className="flex items-center gap-2">
                          <span>Contract</span>
                          <select
                            className="rounded-full border border-white/10 bg-[#0a0a0a] px-3 py-1 text-xs text-slate-300"
                            name="contract"
                            defaultValue={contractFilter ?? ""}
                          >
                            <option value="">All</option>
                            {availableContracts.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <span>Rows</span>
                        <select
                          className="rounded-full border border-white/10 bg-[#0a0a0a] px-3 py-1 text-xs text-slate-300"
                          name="limit"
                          defaultValue={String(limit)}
                        >
                          {[50, 100, 150, 200, 300, 500, 1000].map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="rounded-full border border-sky-500/70 bg-sky-500/10 px-3 py-1 text-xs text-sky-200 transition hover:border-sky-400/80 hover:bg-sky-500/20"
                        >
                          Apply
                        </button>
                        {hasActiveFilters && <ClearFiltersButton tableName={tableName} />}
                        <ExportCsvButton config={config} rows={rows as Record<string, unknown>[]} tableName={tableName} />
                      </div>
                    </div>
                  </div>
                </form>

                <ResizableTable
                  config={config}
                  rows={rows as Record<string, unknown>[]}
                  activeSort={activeSort}
                  ascending={ascending}
                  baseParams={baseParamsObj}
                />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-[#0a0a0a] px-4 py-3 text-xs text-slate-400">
                  <div>
                    Showing <span className="text-slate-100">{rows.length}</span> of{" "}
                    <span className="text-slate-100">{count}</span> rows.
                    {hasMoreRows ? " Narrow filters or increase row limit to see more." : null}
                  </div>
                  <div>
                    Columns: {config.columns.length}. Searchable: {config.searchableColumns.length} fields.
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
        </div>
      </div>
    </div>
  );
}
