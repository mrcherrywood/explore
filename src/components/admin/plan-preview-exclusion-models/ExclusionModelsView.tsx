"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { exportPagesToPdf } from "@/lib/export/pdf";
import type { ExclusionModelReport } from "@/lib/plan-preview/exclusion-model-report";

import {
  ExclusionModelsDefinitionsPage,
  ExclusionModelsListsPage,
  ExclusionModelsScoresPage,
} from "./ExclusionModelsPages";

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

export function ExclusionModelsView({ report }: { report: ExclusionModelReport }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const scorePages = chunk(report.contracts, 10);
  const totalPages = 2 + scorePages.length;
  const slug = report.parentOrganization.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fileName = `exclusion-models_${slug}_stars-${report.starsYear}`;

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
      console.error("Failed to export exclusion model PDF", err);
      setError(err instanceof Error ? err.message : "Failed to export the report PDF.");
    } finally {
      container.classList.remove("pdf-export-mode");
      setExporting(false);
    }
  }, [exporting, fileName]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between gap-4 px-[30px] pb-4 pt-[22px]" data-export-hide>
        <div>
          <h1 className="fep-title">Exclusion models</h1>
          <p className="fep-subtitle">
            {report.parentOrganization} · Stars {report.starsYear}
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
      {error ? (
        <p className="fep-banner-error mx-[30px] mb-4" data-export-hide>
          {error}
        </p>
      ) : null}
      <div ref={pagesRef} className="flex flex-col items-center gap-6 px-[30px] pb-10">
        <ExclusionModelsDefinitionsPage report={report} pageNumber={1} totalPages={totalPages} />
        <ExclusionModelsListsPage report={report} pageNumber={2} totalPages={totalPages} />
        {scorePages.map((contracts, index) => (
          <ExclusionModelsScoresPage
            key={contracts[0]?.contractId ?? index}
            report={report}
            contracts={contracts}
            pageNumber={3 + index}
            totalPages={totalPages}
            continued={index > 0}
          />
        ))}
      </div>
    </div>
  );
}
