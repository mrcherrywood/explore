"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TableConfig } from "@/lib/data-browser/config";

type TableTabsProps = {
  tables: TableConfig[];
  currentTable: string;
  baseParams: URLSearchParams;
};

export function TableTabs({ tables, currentTable, baseParams }: TableTabsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingTable, setLoadingTable] = useState<string | null>(null);

  const handleTabClick = (tableName: string) => {
    if (tableName === currentTable) return;

    setLoadingTable(tableName);
    const tabParams = new URLSearchParams(baseParams.toString());
    tabParams.set("table", tableName);
    tabParams.delete("q");
    tabParams.delete("sort");
    tabParams.delete("dir");
    tabParams.delete("year");
    tabParams.delete("contract");

    const href = tabParams.toString() ? `?${tabParams.toString()}` : "";

    startTransition(() => {
      router.push(href || "/data");
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {tables.map((cfg) => {
        const isActive = cfg.name === currentTable;
        const isLoading = isPending && loadingTable === cfg.name;

        return (
          <button
            key={cfg.name}
            onClick={() => handleTabClick(cfg.name)}
            disabled={isLoading || isActive}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs transition flex items-center gap-2",
              isActive
                ? "border-sky-500/70 bg-sky-500/10 text-sky-200"
                : "border-white/10 text-slate-400 hover:border-white/30 hover:text-slate-200",
              (isLoading || isActive) && "cursor-default"
            )}
          >
            {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}
