"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";

import { PlanPreviewPredictions } from "@/components/admin/PlanPreviewPredictions";
import type { PlanPreviewAccrualSummary, PlanPreviewBatchRecord } from "@/lib/plan-preview/types";

type OverviewResponse = {
  starsYear: number;
  starsYears: number[];
  batches: PlanPreviewBatchRecord[];
  accrual: PlanPreviewAccrualSummary;
};

const FILE_TYPE_LABELS: Record<string, string> = {
  measure_data: "Measure data",
  cai: "CAI",
};

async function fetchOverview(starsYear?: number): Promise<OverviewResponse> {
  const params = new URLSearchParams();
  if (starsYear) params.set("starsYear", String(starsYear));
  const response = await fetch(`/api/admin/plan-preview/overview?${params}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Failed to load plan preview data");
  return payload;
}

export function PlanPreviewAdmin() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [starsYear, setStarsYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadOverview = useCallback(async (year?: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOverview(year);
      setOverview(data);
      setStarsYear(data.starsYear);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load plan preview data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleUpload = async () => {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0 || !starsYear) return;

    setUploading(true);
    setError(null);
    setNotice(null);
    const messages: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("starsYear", String(starsYear));
        const response = await fetch("/api/admin/plan-preview/import", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(`${file.name}: ${payload.error ?? "upload failed"}`);
        }
        const label = FILE_TYPE_LABELS[payload.summary?.fileType] ?? "File";
        messages.push(
          `${file.name}: ${label} imported (${payload.summary?.contractCount ?? 0} contracts).` +
            (payload.warning ? ` ${payload.warning}` : "")
        );
      }
      setNotice(messages.join(" "));
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadOverview(starsYear);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const accrual = overview?.accrual ?? null;

  return (
    <div className="flex flex-col gap-5">
      <section className="fep-card overflow-hidden">
        <div className="px-5 pb-4 pt-5">
          <p className="fep-label">Upload</p>
          <p className="fep-subtitle" style={{ marginTop: 4 }}>
            Upload CMS plan preview master table exports (.xlsx) — measure data and CAI files are
            detected automatically. Re-uploading a contract replaces its accrued rows for the
            selected Star year.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t px-5 py-4" style={{ borderColor: "var(--fep-row-border)" }}>
          <select
            className="fep-select"
            value={starsYear ?? ""}
            onChange={(event) => void loadOverview(Number(event.target.value))}
            disabled={loading || uploading}
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
            disabled={uploading}
          />
          <button type="button" className="fep-btn" onClick={() => void handleUpload()} disabled={uploading || !starsYear}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import
          </button>
          <button
            type="button"
            className="fep-btn-outline"
            onClick={() => void loadOverview(starsYear ?? undefined)}
            disabled={loading || uploading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </section>

      {error ? <div className="fep-banner-error">{error}</div> : null}
      {notice ? <div className="fep-banner-info">{notice}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Contracts accrued" value={accrual?.contractCount} loading={loading} />
        <SummaryCard label="Measures covered" value={accrual?.measureCount} loading={loading} />
        <SummaryCard label="Scored values" value={accrual?.scoredValueCount} loading={loading} />
        <SummaryCard label="CAI contracts" value={accrual?.caiContractCount} loading={loading} />
        <SummaryCard label="Uploads" value={accrual?.batchCount} loading={loading} />
      </div>

      {starsYear !== null && (accrual?.contractCount ?? 0) > 0 ? (
        <PlanPreviewPredictions key={starsYear} starsYear={starsYear} />
      ) : null}

      <section className="fep-card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-4 pt-5">
          <p className="fep-label">Upload history</p>
          <p className="text-xs font-medium" style={{ color: "var(--fep-faint)" }}>
            {accrual?.lastUploadAt
              ? `Last upload ${new Date(accrual.lastUploadAt).toLocaleString()}`
              : "No uploads yet for this Star year."}
          </p>
        </div>
        <div className="overflow-x-auto">
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
              {(overview?.batches ?? []).map((batch) => (
                <tr key={batch.id}>
                  <td className="l max-w-[280px] truncate font-semibold" style={{ color: "var(--fep-ink)" }}>
                    {batch.fileName}
                  </td>
                  <td className="l">
                    <span className="fep-pill">{FILE_TYPE_LABELS[batch.fileType] ?? batch.fileType}</span>
                  </td>
                  <td>{batch.contractCount.toLocaleString()}</td>
                  <td>{batch.fileType === "measure_data" ? batch.measureCount.toLocaleString() : "—"}</td>
                  <td>{batch.rowCount.toLocaleString()}</td>
                  <td>{batch.detectedStarsYear ?? "—"}</td>
                  <td className="l">{new Date(batch.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {!loading && (overview?.batches ?? []).length === 0 ? (
                <tr>
                  <td className="l" colSpan={7} style={{ color: "var(--fep-faint)", padding: "24px 20px", whiteSpace: "normal" }}>
                    Upload the measure data and CAI files to start accruing Stars {starsYear ?? ""} plan
                    preview scores.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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
      <p className="fep-stat-value">{loading ? "…" : (value ?? 0).toLocaleString()}</p>
    </div>
  );
}
