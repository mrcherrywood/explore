"use client";

import type { TableConfig } from "@/lib/data-browser/config";
import { ExportCsvButton as GenericExportCsvButton } from "@/components/shared/ExportCsvButton";
import { formatCsvValue } from "@/lib/export/csv";

type ExportCsvButtonProps = {
  config: TableConfig;
  rows: Record<string, unknown>[];
  tableName: string;
};

export function ExportCsvButton({ config, rows, tableName }: ExportCsvButtonProps) {
  return (
    <GenericExportCsvButton
      fileName={tableName}
      disabled={rows.length === 0}
      getData={() => ({
        headers: config.columns.map((col) => col.label),
        rows: rows.map((row) =>
          config.columns.map((col) => formatCsvValue(row[col.key])),
        ),
      })}
    />
  );
}
