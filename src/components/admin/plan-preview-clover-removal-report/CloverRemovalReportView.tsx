"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { exportPagesToPdf } from "@/lib/export/pdf";
import type {
  CloverRemovalLensId,
  CloverRemovalReport,
} from "@/lib/plan-preview/clover-removal-report-data";

import { buildLowStarMatrixPages } from "@/lib/plan-preview/clover-low-star-matrix";

import { CloverRemovalContractPage } from "./CloverRemovalContractPage";
import { CloverRemovalLowStarPage } from "./CloverRemovalLowStarPage";
import { CloverRemovalMeasuresPage, cloverMeasurePages } from "./CloverRemovalMeasuresPage";
import { CloverRemovalParentPage } from "./CloverRemovalParentPage";
import { CloverRemovalQiPage } from "./CloverRemovalQiPage";

export function CloverRemovalReportView({ report }: { report: CloverRemovalReport }) {
  const [lensId, setLensId] = useState<CloverRemovalLensId>("eligible");
  const active = report.lenses.find((lens) => lens.lensId === lensId) ?? report.lenses[0];
  const view = { ...report, ...active };
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const measurePages = view.contracts.flatMap((contract) =>
    cloverMeasurePages(contract.pathMeasures).map((page) => ({ contract, ...page })),
  );
  const matrixPages = buildLowStarMatrixPages(view);
  const totalPages = 2 + matrixPages.length + view.contracts.length + measurePages.length;
  const slug = view.parentOrganization.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fileName = `recalc-4-star-path_${slug}_stars-${view.starsYear}_${view.lensId}`;

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
            {view.parentOrganization} · Stars {view.starsYear} · {view.lensLabel}.
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

      <div className="flex flex-wrap items-center gap-2 px-[30px] pb-4" data-export-hide>
        {report.lenses.map((lens) => (
          <button
            key={lens.lensId}
            type="button"
            className={lens.lensId === view.lensId ? "fep-btn" : "fep-btn-outline"}
            aria-pressed={lens.lensId === view.lensId}
            onClick={() => setLensId(lens.lensId)}
          >
            {lens.lensLabel}
          </button>
        ))}
      </div>

      <div className="px-[30px] pb-4" data-export-hide>
        <details>
          <summary className="fep-label" style={{ cursor: "pointer" }}>
            Method notes
          </summary>
          <ul className="fep-subtitle" style={{ marginTop: 8, paddingLeft: 18 }}>
            {view.notes.map((note) => (
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
        <CloverRemovalParentPage report={view} pageNumber={1} totalPages={totalPages} />
        {matrixPages.map((page, index) => (
          <CloverRemovalLowStarPage
            key={`${page.part}-${page.contractIds[0]}-${index}`}
            report={view}
            page={page}
            pageNumber={2 + index}
            totalPages={totalPages}
          />
        ))}
        <CloverRemovalQiPage report={view} pageNumber={2 + matrixPages.length} totalPages={totalPages} />
        {view.contracts.map((contract, index) => {
          const precedingMeasures = view.contracts
            .slice(0, index)
            .reduce((count, row) => count + cloverMeasurePages(row.pathMeasures).length, 0);
          const contractPage = 3 + matrixPages.length + index + precedingMeasures;
          const pages = cloverMeasurePages(contract.pathMeasures);
          return (
            <div key={contract.contractId} className="flex flex-col items-center gap-7">
              <CloverRemovalContractPage
                report={view}
                contract={contract}
                pageNumber={contractPage}
                totalPages={totalPages}
              />
              {pages.map((page, pageIndex) => (
                <CloverRemovalMeasuresPage
                  key={`${contract.contractId}-${page.part}`}
                  report={view}
                  contract={contract}
                  part={page.part}
                  rows={page.rows}
                  pageNumber={contractPage + 1 + pageIndex}
                  totalPages={totalPages}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
