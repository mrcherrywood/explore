"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { TableConfig } from "@/lib/data-browser/config";

type ExportCsvButtonProps = {
  config: TableConfig;
  rows: Record<string, unknown>[];
  tableName: string;
};

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  
  let str = String(value);
  
  // Escape quotes by doubling them
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

function generateCsv(config: TableConfig, rows: Record<string, unknown>[]): string {
  // Header row
  const headers = config.columns.map((col) => col.label).join(",");
  
  // Data rows
  const dataRows = rows.map((row) => {
    return config.columns
      .map((col) => formatCsvValue(row[col.key]))
      .join(",");
  });
  
  return [headers, ...dataRows].join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

export function ExportCsvButton({ config, rows, tableName }: ExportCsvButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;
    
    setIsExporting(true);
    
    // Add a small delay to show the spinner
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const csv = generateCsv(config, rows);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const filename = `${tableName}_${timestamp}.csv`;
    downloadCsv(csv, filename);
    
    setIsExporting(false);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={rows.length === 0 || isExporting}
      className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:text-muted-foreground"
      title={rows.length === 0 ? "No data to export" : "Export current view to CSV"}
    >
      {isExporting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      Export CSV
    </button>
  );
}
