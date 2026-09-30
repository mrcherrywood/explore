"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { exportPagesToPdf } from "@/lib/export/pdf";
import type { CloverRemovalReport } from "@/lib/plan-preview/clover-removal-report-data";

import { CloverRemovalContractPage } from "./CloverRemovalContractPage";
import { CloverRemovalParentPage } from "./CloverRemovalParentPage";

export function CloverRemovalReportView({ report }: { report: CloverRemovalReport }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const totalPages = 1 + report.contracts.length;
  const slug = report.parentOrganization.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fileName = `recalc-4-star-path_${slug}_stars-${report.starsYear}`;

  const handleDownload = useCallback(async () => {
    const container = pagesRef.current;
    if (!container || exporting) return;
    const pages = Array.from(container.querySelectorAll<HTMLElement>("[data-report-page]"));
    if (pages.length === 0) return;
    setExporting(true);
    setError(null);
    container.classList.add("pdf-export-mode");
    try {
      await exportPagesToPdf(pages, { fileName });
    } catch (err) {
      console.error("Failed to export Stars 2026 Recalc 4-star path PDF", err);
      setError(err instanceof Error ? err.message : "Failed to export the report PDF.");
    } finally {
      container.classList.remove("pdf-export-mode");
      setExporting(false);
    }
  }, [exporting, fileName]);

  return (
    <div className="flex min-h-screen flex-col">
      <div
        className="flex items-center justify-between gap-4 px-[30px] pb-4 pt-[22px]"
        data-export-hide
      >
        <div>
          <h1 className="fep-title">Stars 2026 Recalc 4-star path</h1>
          <p className="fep-subtitle">
            {report.parentOrganization} · Stars {report.starsYear} · fewest official
            recalc measures to a 4.0 Overall, formatted for 8.5×11 PDF export.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/plan-preview" className="fep-link text-xs">
            ← Plan Preview Admin
          </Link>
          <button type="button" className="fep-btn" onClick={handleDownload} disabled={exporting}>
            {exporting ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="px-[30px] pb-4" data-export-hide>
        <details>
          <summary className="fep-label" style={{ cursor: "pointer" }}>
            Method notes
          </summary>
          <ul className="fep-subtitle" style={{ marginTop: 8, paddingLeft: 18 }}>
            {report.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      </div>

      {error ? (
        <div className="px-[30px] pb-6">
          <p className="fep-banner-error">{error}</p>
        </div>
      ) : null}

      <div ref={pagesRef} className="flex flex-col items-center gap-7 px-[30px] pb-12">
        <CloverRemovalParentPage report={report} pageNumber={1} totalPages={totalPages} />
        {report.contracts.map((contract, index) => (
          <CloverRemovalContractPage
            key={contract.contractId}
            report={report}
            contract={contract}
            pageNumber={index + 2}
            totalPages={totalPages}
          />
        ))}
      </div>
    </div>
  );
}
