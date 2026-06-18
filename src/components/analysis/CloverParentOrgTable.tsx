"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import type { CloverContractImpact } from "@/lib/clover-impact/analysis";

type ParentOrgImpact = {
  parentOrganization: string;
  contractCount: number;
  avgOfficial2026: number | null;
  avgOfficialRecalc: number | null;
  qbpImprovedContracts: number;
  avgNoQI: number | null;
  avgS29Removal: number | null;
  avgModel1: number | null;
  avgModel2: number | null;
  avgModel1Change: number | null;
  avgModel2Change: number | null;
  model1Gainers: number;
  model1Losers: number;
  model2Gainers: number;
  model2Losers: number;
};

type SortKey = keyof Pick<
  ParentOrgImpact,
  | "parentOrganization"
  | "contractCount"
  | "avgOfficial2026"
  | "avgOfficialRecalc"
  | "qbpImprovedContracts"
  | "avgNoQI"
  | "avgS29Removal"
  | "avgModel1"
  | "avgModel2"
  | "avgModel1Change"
  | "avgModel2Change"
  | "model1Gainers"
  | "model2Gainers"
>;

type SortDirection = "asc" | "desc";

type Props = {
  contracts: CloverContractImpact[];
  selectedParent: string;
  onSelectParent: (parentOrganization: string) => void;
};

function formatScore(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

function formatChange(value: number | null): string {
  if (value === null) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function getChangeClass(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value > 0.01) return "text-emerald-500";
  if (value < -0.01) return "text-rose-500";
  return "text-muted-foreground";
}

function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function buildParentOrgRows(contracts: CloverContractImpact[]): ParentOrgImpact[] {
  const byParent = new Map<string, CloverContractImpact[]>();

  for (const contract of contracts) {
    const parent = contract.parentOrganization?.trim() || "Unknown";
    const group = byParent.get(parent) ?? [];
    group.push(contract);
    byParent.set(parent, group);
  }

  return Array.from(byParent.entries())
    .map(([parentOrganization, group]) => ({
      parentOrganization,
      contractCount: group.length,
      avgOfficial2026: average(group.map((contract) => contract.officialScores.stars2026)),
      avgOfficialRecalc: average(group.map((contract) => contract.scores.officialRecalc)),
      qbpImprovedContracts: group.filter((contract) => contract.qbp2027.ratingIncreased).length,
      avgNoQI: average(group.map((contract) => contract.scores.s26NoQI)),
      avgS29Removal: average(group.map((contract) => contract.scores.s29Removal)),
      avgModel1: average(group.map((contract) => contract.scores.model1)),
      avgModel2: average(group.map((contract) => contract.scores.model2)),
      avgModel1Change: average(group.map((contract) => contract.changesFromStars2026.model1)),
      avgModel2Change: average(group.map((contract) => contract.changesFromStars2026.model2)),
      model1Gainers: group.filter((contract) => (contract.changesFromStars2026.model1 ?? 0) > 0.01).length,
      model1Losers: group.filter((contract) => (contract.changesFromStars2026.model1 ?? 0) < -0.01).length,
      model2Gainers: group.filter((contract) => (contract.changesFromStars2026.model2 ?? 0) > 0.01).length,
      model2Losers: group.filter((contract) => (contract.changesFromStars2026.model2 ?? 0) < -0.01).length,
    }))
    .sort((a, b) => (b.avgModel1Change ?? -Infinity) - (a.avgModel1Change ?? -Infinity));
}

function getSortValue(row: ParentOrgImpact, key: SortKey): string | number | null {
  return row[key];
}

function SortHeader({
  label,
  tooltip,
  value,
  activeSortKey,
  sortDirection,
  align = "right",
  onSort,
}: {
  label: string;
  tooltip: string;
  value: SortKey;
  activeSortKey: SortKey;
  sortDirection: SortDirection;
  align?: "left" | "right";
  onSort: (key: SortKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(value)}
      title={tooltip}
      className={`flex items-center gap-1 ${align === "right" ? "ml-auto justify-end" : "justify-start"} font-medium hover:text-foreground`}
    >
      {label}
      {activeSortKey === value ? (
        sortDirection === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : null}
    </button>
  );
}

export function CloverParentOrgTable({ contracts, selectedParent, onSelectParent }: Props) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("avgModel1Change");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const parentRows = useMemo(() => buildParentOrgRows(contracts), [contracts]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? parentRows.filter((row) => row.parentOrganization.toLowerCase().includes(query))
      : parentRows;

    return [...filtered].sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);

      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc" ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      return sortDirection === "asc"
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });
  }, [parentRows, searchQuery, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "parentOrganization" ? "asc" : "desc");
  };

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Parent Organization Scenario Table</h3>
          <p className="text-xs text-muted-foreground">{filteredRows.length.toLocaleString()} parent organizations</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportCsvButton tableRef={tableRef} fileName="clover-scenario-impact-parent-orgs" />
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search parent orgs..."
              className="w-56 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-left"><SortHeader label="Parent Organization" tooltip="Parent organization name. Click a row to select that parent above." value="parentOrganization" align="left" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Contracts" tooltip="Number of analyzed H+R MA-PD contracts under this parent organization." value="contractCount" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Official 2026" tooltip="Average official CMS 2026 overall Stars rating across contracts with a published rating." value="avgOfficial2026" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Official Recalc" tooltip="Average official Stars 2026 recalculation score (Part C HEDIS/CAHPS/HOS only, removing all Part D and six named Part C measures)." value="avgOfficialRecalc" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-center"><SortHeader label="S26 Improved" tooltip="Number of contracts whose hold-harmless Stars 2026 rating increases under the official recalculation (driving a higher 2027 QBP)." value="qbpImprovedContracts" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="No QI" tooltip="Average calculated score after removing the Quality Improvement measures." value="avgNoQI" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="S29 Removal" tooltip="Average calculated score after removing the S29 operations and CAHPS-style measure set." value="avgS29Removal" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Model 1" tooltip="Average calculated score after removing the ten Model 1 Clover measures." value="avgModel1" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Model 2" tooltip="Average calculated score after removing the full 20-measure Model 2 Clover set." value="avgModel2" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Model 1 Avg Change" tooltip="Average Model 1 score change versus official 2026 overall Stars." value="avgModel1Change" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-center"><SortHeader label="Model 1 G/L" tooltip="Count of contracts gaining / losing under Model 1 versus official 2026 overall Stars." value="model1Gainers" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Model 2 Avg Change" tooltip="Average Model 2 score change versus official 2026 overall Stars." value="avgModel2Change" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-center"><SortHeader label="Model 2 G/L" tooltip="Count of contracts gaining / losing under Model 2 versus official 2026 overall Stars." value="model2Gainers" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => (
              <tr
                key={row.parentOrganization}
                className={`border-b border-border/50 transition hover:bg-muted/30 ${
                  row.parentOrganization === selectedParent ? "bg-primary/10" : index % 2 === 0 ? "" : "bg-muted/10"
                }`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectParent(row.parentOrganization)}
                    className="max-w-[320px] truncate text-left text-primary hover:underline"
                  >
                    {row.parentOrganization}
                  </button>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{row.contractCount}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(row.avgOfficial2026)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(row.avgOfficialRecalc)}</td>
                <td className="px-4 py-3 text-center font-mono text-xs">
                  {row.qbpImprovedContracts > 0 ? (
                    <span className="text-emerald-500">{row.qbpImprovedContracts}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(row.avgNoQI)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(row.avgS29Removal)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(row.avgModel1)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(row.avgModel2)}</td>
                <td className={`px-4 py-3 text-right font-mono text-xs font-semibold ${getChangeClass(row.avgModel1Change)}`}>
                  {formatChange(row.avgModel1Change)}
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  <span className="text-emerald-500">{row.model1Gainers}</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className="text-rose-500">{row.model1Losers}</span>
                </td>
                <td className={`px-4 py-3 text-right font-mono text-xs font-semibold ${getChangeClass(row.avgModel2Change)}`}>
                  {formatChange(row.avgModel2Change)}
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  <span className="text-emerald-500">{row.model2Gainers}</span>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className="text-rose-500">{row.model2Losers}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Showing {filteredRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
            {Math.min(safePage * pageSize, filteredRows.length)} of {filteredRows.length}
          </span>
          <label className="flex items-center gap-2">
            Per page
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="rounded border border-border bg-muted px-2 py-1 text-xs text-foreground"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={safePage === 1}
            className="rounded border border-border bg-muted px-3 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">Page {safePage} of {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage === totalPages}
            className="rounded border border-border bg-muted px-3 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
