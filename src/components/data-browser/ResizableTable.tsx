"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TableConfig } from "@/lib/data-browser/config";

type ResizableTableProps = {
  config: TableConfig;
  rows: Record<string, unknown>[];
  activeSort?: string;
  ascending: boolean;
  baseParams: Record<string, string>;
};

function formatCellValue(value: unknown, numeric?: boolean) {
  if (value === null || value === undefined) return "—";
  if (numeric && typeof value === "number") {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function buildQueryString(
  baseParams: Record<string, string>,
  overrides: Record<string, string | undefined | null>
) {
  const params = new URLSearchParams(baseParams);
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  });
  return params.toString() ? `?${params.toString()}` : "";
}

export function ResizableTable({
  config,
  rows,
  activeSort,
  ascending,
  baseParams,
}: ResizableTableProps) {
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(() => {
    // Initialize with default widths
    const widths: Record<string, number> = {};
    config.columns.forEach((col) => {
      widths[col.key] = 150; // Default width in pixels
    });
    return widths;
  });

  const [resizing, setResizing] = React.useState<{
    columnKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent, columnKey: string) => {
      e.preventDefault();
      setResizing({
        columnKey,
        startX: e.clientX,
        startWidth: columnWidths[columnKey] || 150,
      });
    },
    [columnWidths]
  );

  React.useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      // Allow columns to be resized from 50px to 800px
      const newWidth = Math.max(50, Math.min(800, resizing.startWidth + delta));
      setColumnWidths((prev) => ({
        ...prev,
        [resizing.columnKey]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm" style={{ tableLayout: 'fixed' }}>
          <TableHeader>
            <TableRow className="border-border">
              {config.columns.map((column) => {
                const isSorted = column.key === activeSort;
                const nextAscending = isSorted ? !ascending : true;
                const sortHref = buildQueryString(baseParams, {
                  sort: column.key,
                  dir: nextAscending ? "asc" : "desc",
                });
                return (
                  <TableHead
                    key={column.key}
                    className="relative whitespace-nowrap text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground"
                    style={{ 
                      width: `${columnWidths[column.key]}px`, 
                      minWidth: `${columnWidths[column.key]}px`,
                      maxWidth: `${columnWidths[column.key]}px`
                    }}
                  >
                    <div className="flex items-center justify-between pr-2">
                      <Link
                        href={sortHref}
                        className="flex items-center gap-2 text-foreground transition hover:text-primary"
                      >
                        {column.label}
                        {isSorted ? (
                          ascending ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Link>
                    </div>
                    <div
                      className={cn(
                        "absolute right-0 top-0 h-full w-2 cursor-col-resize border-r-2 border-transparent hover:border-sky-400/50 z-10",
                        resizing?.columnKey === column.key && "border-sky-400"
                      )}
                      onMouseDown={(e) => handleMouseDown(e, column.key)}
                      onClick={(e) => e.preventDefault()}
                    />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={config.columns.length} className="py-16 text-center text-sm text-muted-foreground">
                  No rows found for the current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                <TableRow key={`row-${index}`} className="border-border" data-index={index}>
                  {config.columns.map((column) => (
                    <TableCell
                      key={`${column.key}-${index}`}
                      className={cn(
                        "py-3 text-sm text-foreground overflow-hidden text-ellipsis text-left",
                        column.numeric && "tabular-nums"
                      )}
                      style={{ 
                        width: `${columnWidths[column.key]}px`, 
                        minWidth: `${columnWidths[column.key]}px`,
                        maxWidth: `${columnWidths[column.key]}px`
                      }}
                    >
                      {formatCellValue(row[column.key], column.numeric)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
