"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownAZ, ArrowUpAZ, ChevronDown, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import type { CSSProperties } from "react";

import { PercentileMeasureLikelihoodPanel } from "@/components/analysis/PercentileMeasureLikelihoodPanel";
import { cn } from "@/lib/utils";
import type {
  PercentileMethod,
  WorkbookDefinition,
  WorkbookMergeRange,
  WorkbookViewerResponse,
} from "@/lib/percentile-analysis/workbook-types";

type LoadState = "loading" | "ready" | "error";
type SortDirection = "asc" | "desc";
type FlatSheetColumn = {
  index: number;
  label: string;
};
type SheetBehavior =
  | {
      mode: "flat";
      titleRowIndex: number;
      subtitleRowIndex?: number;
      headerRowIndex: number;
      infoRowIndex?: number;
      dataStartRowIndex: number;
    }
  | {
      mode: "complex";
      message: string;
    };

function cellDisplay(value: string | number | null) {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

const HEADER_TOOLTIPS: Record<string, string> = {
  "Contract ID": "CMS contract ID (H = MA, R = MA regional)",
  "Contract Name": "Contract name as reported by CMS",
  "Organization Name": "Parent organization marketing name",
  "Organization Type": "CMS organization type classification",
  "Measure Code": "CMS measure identifier code",
  "Measure Name": "Descriptive name of the CMS quality measure",
  "Domain": "CMS Star Ratings domain the measure belongs to",
  "Weight": "CMS weighting factor applied to the measure",
  "Score": "Raw measure score (integer, CMS-rounded)",
  "Star": "Derived star rating based on CMS cut points",
  "Percentile": "Percentile rank of the score within the contract population",
  "Sample Size": "Number of contracts with valid scores for this measure",
  "Cut Point": "CMS threshold score required to achieve a given star level",
  "2★ Cut Point": "Minimum score needed for a 2-star rating",
  "3★ Cut Point": "Minimum score needed for a 3-star rating",
  "4★ Cut Point": "Minimum score needed for a 4-star rating",
  "5★ Cut Point": "Minimum score needed for a 5-star rating",
};

function getHeaderTooltip(value: string | number | null): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const text = String(value).trim();
  if (HEADER_TOOLTIPS[text]) return HEADER_TOOLTIPS[text];
  for (const [key, tooltip] of Object.entries(HEADER_TOOLTIPS)) {
    if (text.toLowerCase().includes(key.toLowerCase())) return tooltip;
  }
  return undefined;
}

function buildMergeMaps(merges: WorkbookMergeRange[]) {
  const topLeftMap = new Map<string, { colSpan: number; rowSpan: number }>();
  const coveredCells = new Set<string>();

  merges.forEach((merge) => {
    topLeftMap.set(`${merge.startRow}:${merge.startCol}`, {
      colSpan: merge.endCol - merge.startCol + 1,
      rowSpan: merge.endRow - merge.startRow + 1,
    });

    for (let row = merge.startRow; row <= merge.endRow; row += 1) {
      for (let col = merge.startCol; col <= merge.endCol; col += 1) {
        if (row === merge.startRow && col === merge.startCol) continue;
        coveredCells.add(`${row}:${col}`);
      }
    }
  });

  return { topLeftMap, coveredCells };
}

function getSheetBehavior(workbookId: string, sheetName: string): SheetBehavior {
  if (workbookId === "contract") {
    return {
      mode: "flat",
      titleRowIndex: 0,
      subtitleRowIndex: 1,
      headerRowIndex: 3,
      infoRowIndex: 4,
      dataStartRowIndex: 5,
    };
  }

  if (workbookId === "cutpoint" && /^\d{4}$/.test(sheetName)) {
    return {
      mode: "flat",
      titleRowIndex: 0,
      headerRowIndex: 2,
      dataStartRowIndex: 3,
    };
  }

  return {
    mode: "complex",
    message: "Search, autocomplete, sort, and row filtering are enabled on the year tabs. Summary tabs keep their workbook layout intact.",
  };
}

function getMergedHeaderValue(
  rowIndex: number,
  colIndex: number,
  rows: Array<Array<string | number | null>>,
  merges: WorkbookMergeRange[]
) {
  const directValue = rows[rowIndex]?.[colIndex];
  if (directValue !== null && directValue !== undefined && directValue !== "") {
    return String(directValue);
  }

  const merge = merges.find(
    (candidate) =>
      candidate.startRow <= rowIndex &&
      candidate.endRow >= rowIndex &&
      candidate.startCol <= colIndex &&
      candidate.endCol >= colIndex
  );

  if (!merge) return "";
  const mergedValue = rows[merge.startRow]?.[merge.startCol];
  return mergedValue !== null && mergedValue !== undefined ? String(mergedValue) : "";
}

function buildFlatColumns(
  rows: Array<Array<string | number | null>>,
  merges: WorkbookMergeRange[],
  behavior: Extract<SheetBehavior, { mode: "flat" }>
) {
  const headerRow = rows[behavior.headerRowIndex] ?? [];
  const infoRow = behavior.infoRowIndex !== undefined ? rows[behavior.infoRowIndex] ?? [] : [];

  return headerRow.map<FlatSheetColumn>((_, colIndex) => {
    const primaryLabel = getMergedHeaderValue(behavior.headerRowIndex, colIndex, rows, merges) || `Column ${colIndex + 1}`;
    const secondaryValue =
      behavior.infoRowIndex !== undefined && infoRow[colIndex] !== null && infoRow[colIndex] !== undefined && infoRow[colIndex] !== ""
        ? String(infoRow[colIndex])
        : "";

    const label =
      secondaryValue && secondaryValue !== primaryLabel && !secondaryValue.includes("Expected Percentile")
        ? `${primaryLabel} - ${secondaryValue}`
        : primaryLabel;

    return {
      index: colIndex,
      label,
    };
  });
}

function normalizeForSearch(value: string | number | null) {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().trim();
}

function toCssColor(argb: string | null | undefined) {
  if (!argb) return undefined;
  const normalized = argb.replace(/^#/, "");
  if (normalized.length === 8) {
    return `#${normalized.slice(2)}`;
  }
  if (normalized.length === 6) {
    return `#${normalized}`;
  }
  return undefined;
}

function getCellBackgroundColor(workbookId: string, rowIndex: number, colIndex: number, fill: string | null, isHeaderRow?: boolean) {
  if (isHeaderRow) return "#c7d7e8";
  return toCssColor(fill);
}

function getComparableValue(value: string | number | null) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text === "—") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : text.toLowerCase();
}

function getCellClassName(
  rowIndex: number,
  colIndex: number,
  value: string | number | null,
  workbookId: string,
  fill: string | null,
  isHeaderRow?: boolean,
) {
  const valueText = typeof value === "string" ? value : "";
  const isNumeric = typeof value === "number";
  const isTitleRow = rowIndex <= 1;
  const isHeader = isHeaderRow ??
    ((workbookId === "contract" && (rowIndex === 3 || rowIndex === 4)) ||
     (workbookId === "cutpoint" && rowIndex >= 2 && rowIndex <= 4));
  const hasWorkbookFill = Boolean(fill);

  return cn(
    "border border-border px-3 py-2 align-top text-left text-xs text-foreground",
    isNumeric && "text-right tabular-nums",
    isTitleRow && !hasWorkbookFill && "bg-slate-950/90 text-sm font-semibold text-white",
    rowIndex === 1 && !hasWorkbookFill && "text-slate-300",
    isHeader && !hasWorkbookFill && "bg-muted font-semibold text-foreground",
    !isHeader && !isTitleRow && rowIndex % 2 === 1 && !hasWorkbookFill && "bg-muted/10",
    !isHeader && !isTitleRow && colIndex < 3 && !hasWorkbookFill && "bg-background/90 font-medium",
    valueText === "%ile" && !isHeader && "text-sky-400",
    valueText.includes("Actual %ile") && !isHeader && "text-sky-400",
    hasWorkbookFill && !isTitleRow && !isHeader && "font-medium"
  );
}

export function PercentileAnalysisResults() {
  const [data, setData] = useState<WorkbookViewerResponse | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeWorkbookId, setActiveWorkbookId] = useState<string>("contract");
  const [activeSheetName, setActiveSheetName] = useState<string>("");
  const [activeMethod, setActiveMethod] = useState<PercentileMethod>("percentrank_inc");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchColumn, setSearchColumn] = useState("__all");
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    const controller = new AbortController();

    async function load(workbookId?: string, sheetName?: string, method?: PercentileMethod) {
      setLoadState("loading");
      setError(null);

      const params = new URLSearchParams();
      if (workbookId) params.set("workbook", workbookId);
      if (sheetName) params.set("sheet", sheetName);
      if (method) params.set("method", method);

      try {
        const response = await fetch(`/api/analysis/percentile-analysis?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Failed to load workbook view");
        }

        const payload: WorkbookViewerResponse = await response.json();
        setData(payload);
        setActiveWorkbookId(payload.activeWorkbookId);
        setActiveSheetName(payload.activeSheetName);
        setActiveMethod(payload.activeMethod);
        setLoadState("ready");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load workbook view");
        setLoadState("error");
      }
    }

    load(activeWorkbookId, activeSheetName, activeMethod);
    return () => controller.abort();
  }, [activeWorkbookId, activeSheetName, activeMethod]);

  const activeWorkbook = useMemo<WorkbookDefinition | null>(() => {
    if (!data) return null;
    return data.workbooks.find((workbook) => workbook.id === data.activeWorkbookId) ?? null;
  }, [data]);

  const sheetBehavior = useMemo(() => {
    if (!data) return null;
    return getSheetBehavior(data.sheet.workbookId, data.sheet.sheetName);
  }, [data]);

  const mergeMaps = useMemo(() => {
    if (!data) {
      return { topLeftMap: new Map<string, { colSpan: number; rowSpan: number }>(), coveredCells: new Set<string>() };
    }
    let merges = data.sheet.merges;
    if (sheetBehavior?.mode === "flat") {
      merges = merges.filter((m) => m.startRow >= sheetBehavior.headerRowIndex);
    }
    return buildMergeMaps(merges);
  }, [data, sheetBehavior]);

  const flatColumns = useMemo(() => {
    if (!data || !sheetBehavior || sheetBehavior.mode !== "flat") return [];
    return buildFlatColumns(data.sheet.rows, data.sheet.merges, sheetBehavior);
  }, [data, sheetBehavior]);

  const flatSheetMeta = useMemo(() => {
    if (!data || !sheetBehavior || sheetBehavior.mode !== "flat") return null;
    const title = cellDisplay(data.sheet.rows[sheetBehavior.titleRowIndex]?.[0] ?? null);
    const subtitle =
      sheetBehavior.subtitleRowIndex !== undefined
        ? cellDisplay(data.sheet.rows[sheetBehavior.subtitleRowIndex]?.[0] ?? null)
        : "";
    return { title, subtitle };
  }, [data, sheetBehavior]);

  const visibleRows = useMemo(() => {
    if (!data || !sheetBehavior) return [];

    if (sheetBehavior.mode !== "flat") {
      return data.sheet.rows.map((row, rowIndex) => ({ row, rowIndex }));
    }

    let rows = data.sheet.rows
      .slice(sheetBehavior.dataStartRowIndex)
      .map((row, offset) => ({ row, rowIndex: sheetBehavior.dataStartRowIndex + offset }))
      .filter(({ row }) => row.some((cell) => normalizeForSearch(cell) !== ""));

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      rows = rows.filter(({ row }) => {
        if (searchColumn === "__all") {
          return row.some((cell) => normalizeForSearch(cell).includes(query));
        }

        const selectedIndex = Number(searchColumn);
        return normalizeForSearch(row[selectedIndex] ?? null).includes(query);
      });
    }

    if (sortColumn) {
      const selectedIndex = Number(sortColumn);
      rows = rows.toSorted((a, b) => {
        const aValue = getComparableValue(a.row[selectedIndex] ?? null);
        const bValue = getComparableValue(b.row[selectedIndex] ?? null);

        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }

        const comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: "base" });
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return [
      ...data.sheet.rows
        .slice(sheetBehavior.headerRowIndex, sheetBehavior.dataStartRowIndex)
        .map((row, offset) => ({ row, rowIndex: sheetBehavior.headerRowIndex + offset })),
      ...rows,
    ];
  }, [data, sheetBehavior, searchColumn, searchQuery, sortColumn, sortDirection]);

  const autocompleteSuggestions = useMemo(() => {
    if (!data || !sheetBehavior || sheetBehavior.mode !== "flat") return [];

    const values = new Set<string>();
    flatColumns.forEach((column) => values.add(column.label));

    data.sheet.rows.slice(sheetBehavior.dataStartRowIndex).forEach((row) => {
      const sourceIndices =
        searchColumn === "__all"
          ? flatColumns
              .slice(0, Math.min(3, flatColumns.length))
              .map((column) => column.index)
          : [Number(searchColumn)];

      sourceIndices.forEach((index) => {
        const value = normalizeForSearch(row[index] ?? null);
        if (value) values.add(String(row[index]));
      });
    });

    return Array.from(values).slice(0, 200);
  }, [data, flatColumns, searchColumn, sheetBehavior]);

  const totalDataRows = useMemo(() => {
    if (!data || !sheetBehavior || sheetBehavior.mode !== "flat") return 0;
    return data.sheet.rows
      .slice(sheetBehavior.dataStartRowIndex)
      .filter((row) => row.some((cell) => normalizeForSearch(cell) !== "")).length;
  }, [data, sheetBehavior]);

  const flatHeaderRowCount = useMemo(() => {
    if (!sheetBehavior || sheetBehavior.mode !== "flat") return 0;
    return sheetBehavior.dataStartRowIndex - sheetBehavior.headerRowIndex;
  }, [sheetBehavior]);

  const tableHeaderRows = useMemo(() => {
    if (!flatHeaderRowCount) return [];
    return visibleRows.slice(0, flatHeaderRowCount);
  }, [flatHeaderRowCount, visibleRows]);

  const tableBodyRows = useMemo(() => {
    if (!flatHeaderRowCount) return visibleRows;
    return visibleRows.slice(flatHeaderRowCount);
  }, [flatHeaderRowCount, visibleRows]);

  const visibleDataRows = useMemo(() => {
    if (!sheetBehavior || sheetBehavior.mode !== "flat") return 0;
    return Math.max(0, visibleRows.length - flatHeaderRowCount);
  }, [sheetBehavior, visibleRows, flatHeaderRowCount]);

  useEffect(() => {
    setSearchQuery("");
    setSearchColumn("__all");
    setSortColumn("");
    setSortDirection("asc");
  }, [activeWorkbookId, activeSheetName, activeMethod]);

  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  return (
    <div className="min-w-0 space-y-6">
      <PercentileMeasureLikelihoodPanel />

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.45em] text-muted-foreground">Workbook View</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">Percentile Analysis</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Browse contract percentile and cut point percentile data organized by workbook and sheet.
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <button
            type="button"
            onClick={() => setAssumptionsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-xs uppercase tracking-[0.45em] text-muted-foreground">Assumptions &amp; Method Details</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                assumptionsOpen && "rotate-180"
              )}
            />
          </button>

          {assumptionsOpen && (
            <div className="mt-5 space-y-5">
              <div className="overflow-hidden rounded-2xl border border-border">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-background/70 text-left text-xs uppercase tracking-[0.25em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Method</th>
                      <th className="px-4 py-3 font-medium">Label</th>
                      <th className="px-4 py-3 font-medium">Formula</th>
                      <th className="px-4 py-3 font-medium">When to use</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="align-top">
                      <td className="px-4 py-4 font-mono text-foreground">percentrank_inc</td>
                      <td className="px-4 py-4 text-foreground">Percentile Rank</td>
                      <td className="px-4 py-4 font-mono text-muted-foreground">(count strictly below) / (n − 1) × 100</td>
                      <td className="px-4 py-4 text-muted-foreground">Default. Closest to the industry-standard CMS workflow.</td>
                    </tr>
                    <tr className="align-top">
                      <td className="px-4 py-4 font-mono text-foreground">percentileofscore</td>
                      <td className="px-4 py-4 text-foreground">Percentile of Score</td>
                      <td className="px-4 py-4 font-mono text-muted-foreground">(count at or below) / n × 100</td>
                      <td className="px-4 py-4 text-muted-foreground">SciPy-style alternative. Includes the score itself and all ties in the count.</td>
                    </tr>
                    <tr className="align-top">
                      <td className="px-4 py-4 font-mono text-foreground">percentrank_inc_corrected</td>
                      <td className="px-4 py-4 text-foreground">Corrected (Mid-Rank)</td>
                      <td className="px-4 py-4 font-mono text-muted-foreground">(count below + ½ × count equal) / (n − 1) × 100</td>
                      <td className="px-4 py-4 text-muted-foreground">Compensates for ties caused by CMS integer rounding. Places tied contracts at the midpoint of their shared rank range.</td>
                    </tr>
                    <tr className="align-top">
                      <td className="px-4 py-4 font-mono text-foreground">kde_percentile</td>
                      <td className="px-4 py-4 text-foreground">KDE Smoothed</td>
                      <td className="px-4 py-4 font-mono text-muted-foreground">CDF of Gaussian kernel density (bandwidth ≥ 0.5) × 100</td>
                      <td className="px-4 py-4 text-muted-foreground">Fits a smooth probability density to discrete scores, producing more granular percentiles for integer-heavy data.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h4 className="text-sm font-semibold text-foreground">Key differences</h4>
              <div className="overflow-hidden rounded-2xl border border-border">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead className="bg-background/70 text-left text-xs uppercase tracking-[0.25em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Aspect</th>
                      <th className="px-4 py-3 font-medium">Percentile Rank</th>
                      <th className="px-4 py-3 font-medium">Percentile of Score</th>
                      <th className="px-4 py-3 font-medium">Corrected (Mid-Rank)</th>
                      <th className="px-4 py-3 font-medium">KDE Smoothed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      {
                        aspect: "Comparison operator",
                        rank: "Strictly less than (<)",
                        score: "Less than or equal (≤)",
                        corrected: "Below + half of equal",
                        kde: "Cumulative area under smooth density",
                      },
                      {
                        aspect: "Denominator",
                        rank: "n − 1 (Excel inclusive convention)",
                        score: "n (full sample size)",
                        corrected: "n − 1 (same as Percentile Rank)",
                        kde: "Integral of kernel density (0 to 1)",
                      },
                      {
                        aspect: "Tie handling",
                        rank: "Ties excluded from count",
                        score: "Ties included in count",
                        corrected: "Ties split: each tied value placed at midpoint of shared rank range",
                        kde: "Ties smoothed away by Gaussian kernels; each integer maps to a unique percentile",
                      },
                      {
                        aspect: "Integer-data suitability",
                        rank: "Many contracts share identical percentiles",
                        score: "Many contracts share identical percentiles",
                        corrected: "Reduces but doesn't eliminate tied percentiles",
                        kde: "Produces fully continuous percentiles even for integer scores",
                      },
                      {
                        aspect: "Output range",
                        rank: "0 – 100",
                        score: "Always > 0",
                        corrected: "0 – 100 (clamped)",
                        kde: "0 – 100 (from CDF)",
                      },
                      {
                        aspect: "Origin",
                        rank: "Excel PERCENTRANK.INC",
                        score: "SciPy percentileofscore (kind=\"rank\")",
                        corrected: "Classical mid-rank / continuity correction",
                        kde: "Gaussian kernel density estimation (scipy / custom JS)",
                      },
                    ].map((row) => (
                      <tr key={row.aspect} className="align-top">
                        <td className="px-4 py-4 font-medium text-foreground">{row.aspect}</td>
                        <td className="px-4 py-4 text-muted-foreground">{row.rank}</td>
                        <td className="px-4 py-4 text-muted-foreground">{row.score}</td>
                        <td className="px-4 py-4 text-muted-foreground">{row.corrected}</td>
                        <td className="px-4 py-4 text-muted-foreground">{row.kde}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-border bg-background/50 px-5 py-4">
                <p className="text-sm font-medium text-foreground">Example: 5 contracts with scores [70, 75, 80, 85, 90] — contract scoring 80</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
                    <span className="font-medium text-foreground">Percentile Rank:</span>{" "}
                    <span className="text-muted-foreground">2 below ÷ (5 − 1) = </span>
                    <span className="font-mono font-semibold text-foreground">50.0</span>
                  </div>
                  <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
                    <span className="font-medium text-foreground">Percentile of Score:</span>{" "}
                    <span className="text-muted-foreground">3 ≤ 80 ÷ 5 = </span>
                    <span className="font-mono font-semibold text-foreground">60.0</span>
                  </div>
                  <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
                    <span className="font-medium text-foreground">Corrected (Mid-Rank):</span>{" "}
                    <span className="text-muted-foreground">(2 + 0.5×1) ÷ 4 = </span>
                    <span className="font-mono font-semibold text-foreground">62.5</span>
                  </div>
                  <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
                    <span className="font-medium text-foreground">KDE Smoothed:</span>{" "}
                    <span className="text-muted-foreground">CDF at 80 ≈ </span>
                    <span className="font-mono font-semibold text-foreground">50.0</span>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  With unique scores these methods converge. The differences become significant when CMS integer rounding creates large groups of ties — Corrected (Mid-Rank) splits tied ranks evenly, while KDE Smoothed fits a continuous density curve so every contract gets a distinct percentile.
                </p>
              </div>

              <h4 className="text-sm font-semibold text-foreground">Why integer scores matter</h4>
              <div className="rounded-2xl border border-border bg-background/50 px-5 py-4 text-sm text-muted-foreground leading-6">
                <p>
                  CMS rounds all measure scores to whole numbers before publication. With only ~500 contracts scoring across a limited integer range,
                  large clusters of contracts share the same score and receive identical percentile ranks under standard methods.
                  This creates &quot;staircase&quot; percentile distributions with wide flat steps, making it difficult to differentiate contracts
                  within the same score group or track fine-grained movement over time.
                </p>
                <p className="mt-3">
                  <strong className="text-foreground">Corrected (Mid-Rank)</strong> partially addresses this by placing tied contracts at the midpoint of
                  their shared rank range rather than the bottom. <strong className="text-foreground">KDE Smoothed</strong> goes further by fitting a
                  continuous probability density to the discrete data, producing unique percentile values even when underlying scores are identical
                  integers. Both methods are statistically valid compensations for discretization bias.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {loadState === "loading" ? (
        <section className="rounded-3xl border border-border bg-card p-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading workbook sheet…</span>
          </div>
        </section>
      ) : null}

      {loadState === "error" ? (
        <section className="rounded-3xl border border-border bg-card p-8">
          <div className="flex items-center gap-3 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            <p className="font-medium">The workbook view could not be loaded.</p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </section>
      ) : null}

      {loadState === "ready" && data ? (
        <section className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="border-b border-border bg-background px-6 py-4">
            <div className="mb-4 flex flex-wrap gap-2">
              {data.methods.map((method) => {
                const isActive = method.id === data.activeMethod;
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setActiveMethod(method.id)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-xs transition",
                      isActive
                        ? "border-sky-500/70 bg-sky-500/10 text-sky-400"
                        : "border-border text-muted-foreground hover:border-border/60 hover:text-foreground"
                    )}
                    title={method.description}
                  >
                    {method.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {data.workbooks.map((workbook) => {
                const isActive = workbook.id === data.activeWorkbookId;
                return (
                  <button
                    key={workbook.id}
                    type="button"
                    onClick={() => {
                      setActiveWorkbookId(workbook.id);
                      setActiveSheetName(workbook.sheets.includes("2026") ? "2026" : workbook.sheets[0] ?? "");
                    }}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-xs transition",
                      isActive
                        ? "border-primary/70 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-border/60 hover:text-foreground"
                    )}
                  >
                    {workbook.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeWorkbook?.sheets.map((sheet) => {
                const isActive = sheet === data.activeSheetName;
                return (
                  <button
                    key={sheet}
                    type="button"
                    onClick={() => setActiveSheetName(sheet)}
                    className={cn(
                      "rounded-t-xl border border-b-0 px-4 py-2 text-xs transition",
                      isActive
                        ? "border-border bg-card text-foreground"
                        : "border-border/70 bg-muted/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {sheet}
                  </button>
                );
              })}
            </div>
            {sheetBehavior?.mode === "flat" ? (
              <div className="mt-5 rounded-2xl border border-border bg-muted/20 p-4">
                {flatSheetMeta ? (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-foreground">{flatSheetMeta.title}</h3>
                    {flatSheetMeta.subtitle ? (
                      <p className="mt-1 text-xs text-muted-foreground">{flatSheetMeta.subtitle}</p>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_170px_170px_120px]">
                    <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2 uppercase tracking-[0.25em]">
                        <Search className="h-3.5 w-3.5" />
                        Search
                      </span>
                      <input
                        list="percentile-sheet-suggestions"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search current sheet..."
                        className="rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                      />
                      <datalist id="percentile-sheet-suggestions">
                        {autocompleteSuggestions.map((value) => (
                          <option key={value} value={value} />
                        ))}
                      </datalist>
                    </label>

                    <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                      <span className="uppercase tracking-[0.25em]">Search In</span>
                      <select
                        value={searchColumn}
                        onChange={(event) => setSearchColumn(event.target.value)}
                        className="rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                      >
                        <option value="__all">All columns</option>
                        {flatColumns.map((column) => (
                          <option key={column.index} value={String(column.index)}>
                            {column.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-2 uppercase tracking-[0.25em]">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Sort By
                      </span>
                      <select
                        value={sortColumn}
                        onChange={(event) => setSortColumn(event.target.value)}
                        className="rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
                      >
                        <option value="">Workbook order</option>
                        {flatColumns.map((column) => (
                          <option key={column.index} value={String(column.index)}>
                            {column.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-2 text-xs text-muted-foreground">
                      <span className="uppercase tracking-[0.25em]">Direction</span>
                      <button
                        type="button"
                        onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                        className="flex items-center justify-between rounded-2xl border border-border bg-background px-3 py-2 text-sm text-foreground transition hover:border-border/70"
                      >
                        <span>{sortDirection === "asc" ? "Ascending" : "Descending"}</span>
                        {sortDirection === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
                      </button>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Showing <span className="text-foreground">{visibleDataRows.toLocaleString()}</span> of{" "}
                      <span className="text-foreground">{totalDataRows.toLocaleString()}</span> rows
                    </span>
                    {(searchQuery || sortColumn) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          setSearchColumn("__all");
                          setSortColumn("");
                          setSortDirection("asc");
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition hover:border-border/70"
                      >
                        <X className="h-3.5 w-3.5" />
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Percentile Colors:</span>
                  {[
                    { label: "≥ 80th (5★)", color: "#C6EFCE" },
                    { label: "60–79th (4★)", color: "#D6E4F0" },
                    { label: "30–59th (3★)", color: "#FFEB9C" },
                    { label: "15–29th (2★)", color: "#FFC7CE" },
                    { label: "< 15th (1★)", color: "#FF6B6B" },
                  ].map((tier) => (
                    <span key={tier.label} className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-sm border border-border/50"
                        style={{ backgroundColor: tier.color }}
                      />
                      <span>{tier.label}</span>
                    </span>
                  ))}
                  <span className="text-muted-foreground/70">| No color = data not available</span>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                {sheetBehavior?.message}
              </div>
            )}
          </div>

          <div className="overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              {tableHeaderRows.length > 0 && (
                <thead className="sticky top-0 z-10">
                  {tableHeaderRows.map(({ row, rowIndex }) => (
                    <tr key={`row-${rowIndex}`}>
                      {row.map((value, colIndex) => {
                        const cellKey = `${rowIndex}:${colIndex}`;
                        if (mergeMaps.coveredCells.has(cellKey)) return null;

                        const span = mergeMaps.topLeftMap.get(cellKey);
                        const fill = data.sheet.fills[rowIndex]?.[colIndex] ?? null;
                        const backgroundColor = getCellBackgroundColor(data.sheet.workbookId, rowIndex, colIndex, fill, true);
                        const style: CSSProperties | undefined = backgroundColor
                          ? { backgroundColor }
                          : undefined;

                        return (
                          <th
                            key={cellKey}
                            colSpan={span?.colSpan}
                            rowSpan={span?.rowSpan}
                            className={getCellClassName(rowIndex, colIndex, value, data.sheet.workbookId, fill, true)}
                            style={style}
                            title={getHeaderTooltip(value)}
                          >
                            {cellDisplay(value)}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
              )}
              <tbody>
                {tableBodyRows.map(({ row, rowIndex }) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((value, colIndex) => {
                      const cellKey = `${rowIndex}:${colIndex}`;
                      if (mergeMaps.coveredCells.has(cellKey)) return null;

                      const span = mergeMaps.topLeftMap.get(cellKey);
                      const Tag = tableHeaderRows.length === 0 && rowIndex <= 4 ? "th" : "td";
                      const fill = data.sheet.fills[rowIndex]?.[colIndex] ?? null;
                      const backgroundColor = getCellBackgroundColor(data.sheet.workbookId, rowIndex, colIndex, fill);
                      const style: CSSProperties | undefined = backgroundColor
                        ? { backgroundColor }
                        : undefined;

                      return (
                        <Tag
                          key={cellKey}
                          colSpan={span?.colSpan}
                          rowSpan={span?.rowSpan}
                          className={getCellClassName(rowIndex, colIndex, value, data.sheet.workbookId, fill, false)}
                          style={style}
                        >
                          {cellDisplay(value)}
                        </Tag>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
