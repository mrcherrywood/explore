"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { exportPagesToPdf } from "@/lib/export/pdf";
import type { PlanPreviewContractReport as ReportData } from "@/lib/plan-preview/report-data";

import { DomainsPage } from "./DomainsPage";
import { OverviewPage } from "./OverviewPage";
import { ScenariosPage } from "./ScenariosPage";
import { YoyPage } from "./YoyPage";

const TOTAL_PAGES = 4;

export function PlanPreviewContractReport({
  starsYear,
  contractId,
}: {
  starsYear: number;
  contractId: string;
}) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const pagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/admin/plan-preview/report?starsYear=${starsYear}&contractId=${encodeURIComponent(contractId)}`
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Failed to load the contract report.");
        if (!cancelled) setReport(body as ReportData);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [starsYear, contractId]);

  const handleDownload = useCallback(async () => {
    const container = pagesRef.current;
    if (!container || exporting) return;
    const pages = Array.from(
      container.querySelectorAll<HTMLElement>("[data-report-page]")
    );
    if (pages.length === 0) return;

    setExporting(true);
    container.classList.add("pdf-export-mode");
    try {
      await exportPagesToPdf(pages, {
        fileName: `plan-preview-report_${contractId}_stars-${starsYear}`,
      });
    } catch (err) {
      console.error("Failed to export contract report PDF", err);
      setError(err instanceof Error ? err.message : "Failed to export the report PDF.");
    } finally {
      container.classList.remove("pdf-export-mode");
      setExporting(false);
    }
  }, [contractId, starsYear, exporting]);

  return (
    <div className="flex min-h-screen flex-col">
      <div
        className="flex items-center justify-between gap-4 px-[30px] pb-4 pt-[22px]"
        data-export-hide
      >
        <div>
          <h1 className="fep-title">Contract Report</h1>
          <p className="fep-subtitle">
            {contractId} · Stars {starsYear} plan preview projection, formatted for 8.5×11 PDF
            export.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/plan-preview" className="fep-link text-xs">
            ← Plan Preview Admin
          </Link>
          <button
            type="button"
            className="fep-btn"
            onClick={handleDownload}
            disabled={loading || exporting || !report}
          >
            {exporting ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-[30px] pb-6">
          <p className="fep-banner-error">{error}</p>
        </div>
      ) : null}
      {loading ? (
        <div className="px-[30px] pb-6">
          <p className="fep-banner-info">Building the contract report…</p>
        </div>
      ) : null}

      {report ? (
        <div
          ref={pagesRef}
          className="flex flex-col items-center gap-7 px-[30px] pb-12"
        >
          <OverviewPage report={report} pageNumber={1} totalPages={TOTAL_PAGES} />
          <DomainsPage report={report} pageNumber={2} totalPages={TOTAL_PAGES} />
          <YoyPage report={report} pageNumber={3} totalPages={TOTAL_PAGES} />
          <ScenariosPage report={report} pageNumber={4} totalPages={TOTAL_PAGES} />
        </div>
      ) : null}
    </div>
  );
}
