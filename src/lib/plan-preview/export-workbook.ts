import * as XLSX from "xlsx";

import type { PlanPreviewExportRow } from "./types";

/** Format a decimal overlay for export, preserving % style from the original raw value. */
export function formatExportCellValue(row: PlanPreviewExportRow): string {
  if (row.decimalScore === null || row.decimalScore === undefined) {
    return row.rawValue;
  }

  const decimalText = formatDecimal(row.decimalScore);
  const trimmedRaw = row.rawValue.trim();
  if (trimmedRaw.endsWith("%")) {
    return `${decimalText}%`;
  }
  return decimalText;
}

function formatDecimal(score: number): string {
  // Keep meaningful precision from domain files; strip trailing zeros.
  return score.toFixed(8).replace(/\.?0+$/, "");
}

function compareMeasureCodes(left: string, right: string): number {
  const leftPart = left.startsWith("D") ? 1 : 0;
  const rightPart = right.startsWith("D") ? 1 : 0;
  if (leftPart !== rightPart) return leftPart - rightPart;
  return left.localeCompare(right, undefined, { numeric: true });
}

/**
 * Build a measure_data-format workbook with decimal overlays replacing whole
 * numbers where available. Domain-group and date-range rows from the original
 * CMS file are omitted (not stored).
 */
export function buildMeasureDataExportWorkbook(
  starsYear: number,
  rows: PlanPreviewExportRow[]
): Buffer {
  if (rows.length === 0) {
    throw new Error("No accrued measure scores to export for this Star year.");
  }

  const measureMeta = new Map<string, string>();
  const contracts = new Map<
    string,
    {
      organizationMarketingName: string | null;
      contractName: string | null;
      parentOrganization: string | null;
      values: Map<string, string>;
    }
  >();

  for (const row of rows) {
    if (!measureMeta.has(row.measureCode)) {
      measureMeta.set(row.measureCode, row.measureDisplayName);
    }

    let contract = contracts.get(row.contractId);
    if (!contract) {
      contract = {
        organizationMarketingName: row.organizationMarketingName,
        contractName: row.contractName,
        parentOrganization: row.parentOrganization,
        values: new Map(),
      };
      contracts.set(row.contractId, contract);
    } else {
      contract.organizationMarketingName ??= row.organizationMarketingName;
      contract.contractName ??= row.contractName;
      contract.parentOrganization ??= row.parentOrganization;
    }
    contract.values.set(row.measureCode, formatExportCellValue(row));
  }

  const measureCodes = [...measureMeta.keys()].sort(compareMeasureCodes);
  const contractIds = [...contracts.keys()].sort();

  // Two-row header matches CMS measure_data layout so the export can be
  // re-imported by parsePlanPreviewWorkbook (identity row, then measure codes).
  const identityHeaders = [
    "Contract Number",
    "Organization Marketing Name",
    "Contract Name",
    "Parent Organization",
  ];
  const measureHeaders = [
    "",
    "",
    "",
    "",
    ...measureCodes.map((code) => `${code}: ${measureMeta.get(code) ?? code}`),
  ];

  const aoa: unknown[][] = [
    [`Star Ratings and Display Measures - CY ${starsYear} Star Ratings`],
    ["Medicare Part C and D Report Card Master Table"],
    identityHeaders,
    measureHeaders,
  ];

  for (const contractId of contractIds) {
    const contract = contracts.get(contractId)!;
    aoa.push([
      contractId,
      contract.organizationMarketingName ?? "",
      contract.contractName ?? "",
      contract.parentOrganization ?? "",
      ...measureCodes.map((code) => contract.values.get(code) ?? ""),
    ]);
  }

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, sheet, `SR_${starsYear}_measure_data`);
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
