"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import type { CloverContractImpact } from "@/lib/clover-impact/analysis";

type SortKey =
  | "contractId"
  | "parentOrganization"
  | "stars2025"
  | "stars2026"
  | "s26NoQI"
  | "s29Removal"
  | "model1"
  | "model2"
  | "model1Change"
  | "model2Change";

type SortDirection = "asc" | "desc";

type Props = {
  contracts: CloverContractImpact[];
  selectedContractId: string | null;
  onSelectContract: (contractId: string) => void;
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

function getSortValue(contract: CloverContractImpact, key: SortKey): string | number | null {
  switch (key) {
    case "contractId":
      return contract.contractId;
    case "parentOrganization":
      return contract.parentOrganization || "";
    case "stars2025":
      return contract.scores.stars2025;
    case "stars2026":
      return contract.scores.stars2026;
    case "s26NoQI":
      return contract.scores.s26NoQI;
    case "s29Removal":
      return contract.scores.s29Removal;
    case "model1":
      return contract.scores.model1;
    case "model2":
      return contract.scores.model2;
    case "model1Change":
      return contract.changesFromStars2026.model1;
    case "model2Change":
      return contract.changesFromStars2026.model2;
  }
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

export function CloverImpactTable({ contracts, selectedContractId, onSelectContract }: Props) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("model1Change");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const filteredContracts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? contracts.filter((contract) =>
          contract.contractId.toLowerCase().includes(query) ||
          contract.contractName?.toLowerCase().includes(query) ||
          contract.organizationMarketingName?.toLowerCase().includes(query) ||
          contract.parentOrganization?.toLowerCase().includes(query),
        )
      : contracts;

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
  }, [contracts, searchQuery, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageContracts = filteredContracts.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(["model1Change", "model2Change", "s26NoQI", "s29Removal", "model1", "model2"].includes(key) ? "desc" : "asc");
  };

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Population Scenario Table</h3>
          <p className="text-xs text-muted-foreground">{filteredContracts.length.toLocaleString()} H+R MA-PD contracts</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportCsvButton tableRef={tableRef} fileName="clover-scenario-impact" />
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search contracts..."
              className="w-56 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <th className="px-4 py-3 text-left"><SortHeader label="Contract" tooltip="CMS contract ID. Click a contract to update the chart above." value="contractId" align="left" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-left"><SortHeader label="Parent" tooltip="Organization marketing name and parent organization for the contract." value="parentOrganization" align="left" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="2025" tooltip="Official CMS 2025 overall Stars rating from the summary file, when available." value="stars2025" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="2026" tooltip="Official CMS 2026 overall Stars rating from the summary file." value="stars2026" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="No QI" tooltip="Calculated score after removing the Part C and Part D Quality Improvement measures." value="s26NoQI" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="S29 Removal" tooltip="Calculated score after removing the operations and CAHPS-style measures from the S29 removal scenario." value="s29Removal" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Model 1" tooltip="Calculated score after removing the ten 1395w-22(e) data-source measures from the Clover scenario." value="model1" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Model 2" tooltip="Calculated score after removing the full 20-measure Clover scenario set." value="model2" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Model 1 Change" tooltip="Model 1 score minus the official 2026 overall Stars rating." value="model1Change" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
              <th className="px-4 py-3 text-right"><SortHeader label="Model 2 Change" tooltip="Model 2 score minus the official 2026 overall Stars rating." value="model2Change" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} /></th>
            </tr>
          </thead>
          <tbody>
            {pageContracts.map((contract, index) => (
              <tr
                key={contract.contractId}
                className={`border-b border-border/50 transition hover:bg-muted/30 ${
                  contract.contractId === selectedContractId ? "bg-primary/10" : index % 2 === 0 ? "" : "bg-muted/10"
                }`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectContract(contract.contractId)}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {contract.contractId}
                  </button>
                  <Link href={`/summary?contractId=${contract.contractId}&year=2026`} className="ml-2 text-[10px] text-muted-foreground hover:text-foreground">
                    view
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="max-w-[260px]">
                    <p className="truncate text-foreground">{contract.organizationMarketingName || contract.contractName || "-"}</p>
                    <p className="truncate text-xs text-muted-foreground">{contract.parentOrganization || "-"}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(contract.scores.stars2025)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(contract.scores.stars2026)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(contract.scores.s26NoQI)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(contract.scores.s29Removal)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(contract.scores.model1)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{formatScore(contract.scores.model2)}</td>
                <td className={`px-4 py-3 text-right font-mono text-xs font-semibold ${getChangeClass(contract.changesFromStars2026.model1)}`}>
                  {formatChange(contract.changesFromStars2026.model1)}
                </td>
                <td className={`px-4 py-3 text-right font-mono text-xs font-semibold ${getChangeClass(contract.changesFromStars2026.model2)}`}>
                  {formatChange(contract.changesFromStars2026.model2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-border p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Showing {filteredContracts.length === 0 ? 0 : (safePage - 1) * pageSize + 1}-
            {Math.min(safePage * pageSize, filteredContracts.length)} of {filteredContracts.length}
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
