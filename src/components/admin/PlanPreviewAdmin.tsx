"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FolderOpen,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

import { PlanPreviewPredictions } from "@/components/admin/PlanPreviewPredictions";
import type {
  PlanPreviewAccrualSummary,
  PlanPreviewBatchRecord,
} from "@/lib/plan-preview/types";

type OverviewResponse = {
  starsYear: number;
  starsYears: number[];
  batches: PlanPreviewBatchRecord[];
  accrual: PlanPreviewAccrualSummary;
};

const FILE_TYPE_LABELS: Record<string, string> = {
  measure_data: "Measure data",
  cai: "CAI",
  cahps: "CAHPS domain",
  hedis: "HEDIS decimals",
  snp_cm: "SNP CM decimals",
  cahps_adjusted: "CAHPS adjusted (legacy)",
};

const DECIMAL_FILE_TYPES = new Set(["cahps", "hedis", "snp_cm"]);
const MEASURE_COUNT_FILE_TYPES = new Set([
  "measure_data",
  "cahps",
  "hedis",
  "snp_cm",
]);

/** Group upload batches by parent organization, most recent upload first. */
function groupBatchesByParentOrg(
  batches: PlanPreviewBatchRecord[],
): { parentOrganization: string; batches: PlanPreviewBatchRecord[] }[] {
  const groups = new Map<string, PlanPreviewBatchRecord[]>();
  for (const batch of batches) {
    const key = batch.parentOrganization ?? "Unknown parent organization";
    const existing = groups.get(key);
    if (existing) existing.push(batch);
    else groups.set(key, [batch]);
  }
  return [...groups.entries()]
    .map(([parentOrganization, groupBatches]) => ({
      parentOrganization,
      batches: [...groupBatches].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }))
    .sort(
      (a, b) =>
        new Date(b.batches[0].createdAt).getTime() -
        new Date(a.batches[0].createdAt).getTime(),
    );
}

async function fetchOverview(starsYear?: number): Promise<OverviewResponse> {
  const params = new URLSearchParams();
  if (starsYear) params.set("starsYear", String(starsYear));
  const response = await fetch(`/api/admin/plan-preview/overview?${params}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error ?? "Failed to load plan preview data");
  return payload;
}

export function PlanPreviewAdmin() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [starsYear, setStarsYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(
    () => new Set(),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const toggleOrg = (parentOrganization: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(parentOrganization)) next.delete(parentOrganization);
      else next.add(parentOrganization);
      return next;
    });
  };

  const loadOverview = useCallback(async (year?: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOverview(year);
      setOverview(data);
      setStarsYear(data.starsYear);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load plan preview data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const batchGroups = useMemo(
    () => groupBatchesByParentOrg(overview?.batches ?? []),
    [overview?.batches],
  );

  const importFiles = async (allFiles: File[]) => {
    if (allFiles.length === 0 || !starsYear) return;

    // Excel lock files (~$...) and non-workbook files are skipped up front.
    const workbooks = allFiles.filter(
      (file) => /\.(xlsx|xls)$/i.test(file.name) && !file.name.startsWith("~$"),
    );
    if (workbooks.length === 0) {
      setError("No .xlsx files found in the selection.");
      return;
    }

    setUploading(true);
    setError(null);
    setNotice(null);
    const imported: string[] = [];
    const skipped: string[] = [];

    for (const file of workbooks) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("starsYear", String(starsYear));
        const response = await fetch("/api/admin/plan-preview/import", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          skipped.push(`${file.name} — ${payload.error ?? "upload failed"}`);
          continue;
        }
        const label = FILE_TYPE_LABELS[payload.summary?.fileType] ?? "File";
        const detail = DECIMAL_FILE_TYPES.has(payload.summary?.fileType)
          ? `${payload.summary?.rowCount ?? 0} decimal values across ${payload.summary?.measureCount ?? 0} measures`
          : `${payload.summary?.contractCount ?? 0} contracts`;
        imported.push(
          `${file.name}: ${label} (${detail})` +
            (payload.warning ? ` — ${payload.warning}` : ""),
        );
      } catch (uploadError) {
        skipped.push(
          `${file.name} — ${uploadError instanceof Error ? uploadError.message : "upload failed"}`,
        );
      }
    }

    const parts: string[] = [];
    if (imported.length > 0) {
      parts.push(
        `Imported ${imported.length} file${imported.length === 1 ? "" : "s"}: ${imported.join(" · ")}`,
      );
    }
    if (skipped.length > 0) {
      parts.push(`Skipped ${skipped.length}: ${skipped.join(" · ")}`);
    }
    if (imported.length > 0) {
      setNotice(parts.join(" "));
    } else {
      setError(parts.join(" ") || "Upload failed");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
    if (imported.length > 0) {
      await loadOverview(starsYear);
    }
    setUploading(false);
  };

  const handleUpload = async () => {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) return;
    await importFiles(Array.from(files));
  };

  const handleFolderSelected = async () => {
    const files = folderInputRef.current?.files;
    if (!files || files.length === 0) return;
    await importFiles(Array.from(files));
  };

  const handleClearYear = async () => {
    if (!starsYear) return;
    const confirmed = window.confirm(
      `Delete all accrued Stars ${starsYear} plan preview data (uploads, measure scores, CAI)? This cannot be undone.`,
    );
    if (!confirmed) return;

    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/plan-preview/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starsYear }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error ?? "Failed to clear data");
      setNotice(
        `Cleared Stars ${starsYear} plan preview data (${payload.deletedBatches ?? 0} uploads removed).`,
      );
      await loadOverview(starsYear);
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Failed to clear data",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleExport = async () => {
    if (!starsYear) return;
    setExporting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/plan-preview/export?starsYear=${starsYear}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `SR_${starsYear}_measure_data_with_decimals.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(`Exported measure data with decimals for Stars ${starsYear}.`);
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : "Export failed",
      );
    } finally {
      setExporting(false);
    }
  };

  const accrual = overview?.accrual ?? null;
  const canExport =
    (accrual?.scoredValueCount ?? 0) > 0 || (accrual?.measureCount ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="fep-subtitle" style={{ margin: 0 }}>
          Accrue plan preview files, project cut points, and open contract
          reports.
        </p>
        <a
          className="fep-link text-xs"
          href="/admin/plan-preview/sample"
          target="_blank"
          rel="noreferrer"
        >
          Open marketing sample report →
        </a>
      </div>
      <section className="fep-card overflow-hidden">
        <div className="px-5 pb-4 pt-5">
          <p className="fep-label">Upload</p>
          <p className="fep-subtitle" style={{ marginTop: 4 }}>
            Upload CMS plan preview master table exports (.xlsx) — measure data,
            CAI, and domain files (CAHPS, HEDIS, SNP Care Management) are
            detected automatically. Domain decimals overlay whole-number
            measure scores when available. CAHPS domain uploads also carry the
            plan&apos;s Star Rating column, which is used for CAHPS measure
            stars; without that file, official CAHPS cut points apply. Use
            Import folder to pull in a whole release folder at once; files
            without usable scores (appeals, CTM, disenrollment, disaster) are
            skipped with a note. Re-uploading a contract replaces its accrued
            rows for the selected Star year.
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-3 border-t px-5 py-4"
          style={{ borderColor: "var(--fep-row-border)" }}
        >
          <select
            className="fep-select"
            value={starsYear ?? ""}
            onChange={(event) => void loadOverview(Number(event.target.value))}
            disabled={loading || uploading || exporting}
          >
            {(overview?.starsYears ?? []).map((year) => (
              <option key={year} value={year}>
                Stars {year}
              </option>
            ))}
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="fep-file-input"
            disabled={uploading || exporting}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={() => void handleFolderSelected()}
            disabled={uploading || exporting}
            {...{ webkitdirectory: "", directory: "" }}
          />
          <button
            type="button"
            className="fep-btn"
            onClick={() => void handleUpload()}
            disabled={uploading || exporting || !starsYear}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Import
          </button>
          <button
            type="button"
            className="fep-btn-outline"
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading || exporting || !starsYear}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            Import folder
          </button>
          <button
            type="button"
            className="fep-btn-outline"
            onClick={() => void handleExport()}
            disabled={
              loading || uploading || exporting || !starsYear || !canExport
            }
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export measure data
          </button>
          <button
            type="button"
            className="fep-btn-outline"
            onClick={() => void loadOverview(starsYear ?? undefined)}
            disabled={loading || uploading || exporting}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            className="fep-btn-outline"
            onClick={() => void handleClearYear()}
            disabled={
              loading ||
              uploading ||
              exporting ||
              !starsYear ||
              (accrual?.batchCount ?? 0) === 0
            }
          >
            <Trash2 className="h-4 w-4" />
            Clear year
          </button>
        </div>
      </section>

      {error ? <div className="fep-banner-error">{error}</div> : null}
      {notice ? <div className="fep-banner-info">{notice}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="Contracts accrued"
          value={accrual?.contractCount}
          loading={loading}
        />
        <SummaryCard
          label="Measures covered"
          value={accrual?.measureCount}
          loading={loading}
        />
        <SummaryCard
          label="Scored values"
          value={accrual?.scoredValueCount}
          loading={loading}
        />
        <SummaryCard
          label="Decimal values"
          value={accrual?.decimalValueCount}
          loading={loading}
        />
        <SummaryCard
          label="CAI contracts"
          value={accrual?.caiContractCount}
          loading={loading}
        />
        <SummaryCard
          label="Uploads"
          value={accrual?.batchCount}
          loading={loading}
        />
      </div>

      {starsYear !== null && (accrual?.contractCount ?? 0) > 0 ? (
        <PlanPreviewPredictions key={starsYear} starsYear={starsYear} />
      ) : null}

      <section className="fep-card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-4 pt-5">
          <p className="fep-label">Upload history</p>
          <p
            className="text-xs font-medium"
            style={{ color: "var(--fep-faint)" }}
          >
            {accrual?.lastUploadAt
              ? `Last upload ${new Date(accrual.lastUploadAt).toLocaleString()}`
              : "No uploads yet for this Star year."}
          </p>
        </div>
        {!loading && batchGroups.length === 0 ? (
          <p
            className="px-5 pb-5 text-sm"
            style={{ color: "var(--fep-faint)" }}
          >
            Upload the measure data, CAI, and optional domain files (including
            the plan&apos;s CAHPS file for Star Ratings) to start accruing
            Stars {starsYear ?? ""} plan preview scores.
          </p>
        ) : (
          <div
            className="divide-y"
            style={{ borderColor: "var(--fep-row-border)" }}
          >
            {batchGroups.map((group) => {
              const expanded = expandedOrgs.has(group.parentOrganization);
              return (
                <div key={group.parentOrganization}>
                  <button
                    type="button"
                    onClick={() => toggleOrg(group.parentOrganization)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-2 px-5 py-3.5 text-left transition-colors hover:bg-black/[0.03]"
                    style={{
                      color: "var(--fep-ink)",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {expanded ? (
                      <ChevronDown
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--fep-faint)" }}
                      />
                    ) : (
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--fep-faint)" }}
                      />
                    )}
                    <span className="min-w-0 truncate">
                      {group.parentOrganization}
                    </span>
                    <span
                      className="shrink-0 font-medium normal-case tracking-normal"
                      style={{ color: "var(--fep-faint)" }}
                    >
                      {group.batches.length === 1
                        ? "1 upload"
                        : `${group.batches.length} uploads`}
                    </span>
                  </button>
                  {expanded ? (
                    <div
                      className="overflow-x-auto border-t"
                      style={{ borderColor: "var(--fep-row-border)" }}
                    >
                      <table className="fep-table">
                        <thead>
                          <tr>
                            <th className="l">File</th>
                            <th className="l">Type</th>
                            <th>Contracts</th>
                            <th>Measures</th>
                            <th>Rows</th>
                            <th>File title year</th>
                            <th className="l">Uploaded</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.batches.map((batch) => (
                            <tr key={batch.id}>
                              <td
                                className="l max-w-[280px] truncate font-semibold"
                                style={{ color: "var(--fep-ink)" }}
                              >
                                {batch.fileName}
                              </td>
                              <td className="l">
                                <span className="fep-pill">
                                  {FILE_TYPE_LABELS[batch.fileType] ??
                                    batch.fileType}
                                </span>
                              </td>
                              <td>{batch.contractCount.toLocaleString()}</td>
                              <td>
                                {MEASURE_COUNT_FILE_TYPES.has(batch.fileType)
                                  ? batch.measureCount.toLocaleString()
                                  : "—"}
                              </td>
                              <td>{batch.rowCount.toLocaleString()}</td>
                              <td>{batch.detectedStarsYear ?? "—"}</td>
                              <td className="l">
                                {new Date(batch.createdAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="fep-card px-5 py-4">
      <p className="fep-label">{label}</p>
      <p className="fep-stat-value">
        {loading ? "…" : (value ?? 0).toLocaleString()}
      </p>
    </div>
  );
}
