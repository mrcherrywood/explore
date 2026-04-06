"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type CsvData,
  generateCsvString,
  downloadCsvFile,
  extractTableData,
} from "@/lib/export/csv";

type ExportCsvButtonProps = {
  fileName: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  tableRef?: React.RefObject<HTMLTableElement | null>;
  getData?: () => CsvData;
};

export function ExportCsvButton({
  fileName,
  className,
  disabled,
  label = "Export CSV",
  tableRef,
  getData,
}: ExportCsvButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (isExporting) return;

    setIsExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 50));

    let data: CsvData | null = null;

    if (getData) {
      data = getData();
    } else if (tableRef?.current) {
      data = extractTableData(tableRef.current);
    }

    if (!data || data.rows.length === 0) {
      setIsExporting(false);
      return;
    }

    const csv = generateCsvString(data);
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/:/g, "-");
    downloadCsvFile(csv, `${fileName}_${timestamp}.csv`);

    setIsExporting(false);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled || isExporting}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      title={label}
    >
      {isExporting ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Download className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}
