"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { exportPagesToPdf } from "@/lib/export/pdf";
import type { PlanPreviewContractReport as ReportData } from "@/lib/plan-preview/report-data";

import { DomainsPage } from "./DomainsPage";
import {
  chunkMeasureScoresByPart,
  MeasureScoresPage,
} from "./MeasureScoresPage";
import { OverviewPage } from "./OverviewPage";
import { QiSensitivityPage } from "./QiSensitivityPage";
import { ScenariosPage } from "./ScenariosPage";
import { YoyPage } from "./YoyPage";

/** Fixed pages before the Part C / Part D measure-score tables. */
const FIXED_PAGES_BEFORE_SCORES = 5;

export function PlanPreviewReportView({
  report,
  backHref,
  backLabel,
  heading,
  subheading,
  fileName,
  sample,
}: {
  report: ReportData;
  backHref: string;
  backLabel: string;
  heading: string;
  subheading: string;
  fileName: string;
  /** Marks pages as illustrative sample (eyebrow + footer). */
  sample?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const scoreChunks = chunkMeasureScoresByPart(report.measures);
  const totalPages = FIXED_PAGES_BEFORE_SCORES + scoreChunks.length;

  const handleDownload = useCallback(async () => {
    const container = pagesRef.current;
    if (!container || exporting) return;
    const pages = Array.from(
      container.querySelectorAll<HTMLElement>("[data-report-page]"),
    );
    if (pages.length === 0) return;

    setExporting(true);
    setError(null);
    container.classList.add("pdf-export-mode");
    try {
      await exportPagesToPdf(pages, { fileName });
    } catch (err) {
      console.error("Failed to export contract report PDF", err);
      setError(
        err instanceof Error ? err.message : "Failed to export the report PDF.",
      );
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
          <h1 className="fep-title">{heading}</h1>
          <p className="fep-subtitle">{subheading}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={backHref} className="fep-link text-xs">
            ← {backLabel}
          </Link>
          <button
            type="button"
            className="fep-btn"
            onClick={handleDownload}
            disabled={exporting}
          >
            {exporting ? "Preparing PDF…" : "Download PDF"}
          </button>
        </div>
      </div>

      {sample ? (
        <div className="px-[30px] pb-4" data-export-hide>
          <p className="fep-banner-info">
            Illustrative sample for marketing — fictional contract and scores.
            Safe to screenshot or export; not live plan preview data.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="px-[30px] pb-6">
          <p className="fep-banner-error">{error}</p>
        </div>
      ) : null}

      <div
        ref={pagesRef}
        className="flex flex-col items-center gap-7 px-[30px] pb-12"
      >
        <OverviewPage
          report={report}
          pageNumber={1}
          totalPages={totalPages}
          sample={sample}
        />
        <DomainsPage
          report={report}
          pageNumber={2}
          totalPages={totalPages}
          sample={sample}
        />
        <YoyPage
          report={report}
          pageNumber={3}
          totalPages={totalPages}
          sample={sample}
        />
        <ScenariosPage
          report={report}
          pageNumber={4}
          totalPages={totalPages}
          sample={sample}
        />
        <QiSensitivityPage
          report={report}
          pageNumber={5}
          totalPages={totalPages}
          sample={sample}
        />
        {scoreChunks.map((chunk, chunkIndex) => (
          <MeasureScoresPage
            key={`measure-scores-${chunk.part}`}
            report={report}
            part={chunk.part}
            rows={chunk.rows}
            pageNumber={FIXED_PAGES_BEFORE_SCORES + chunkIndex + 1}
            totalPages={totalPages}
            sample={sample}
          />
        ))}
      </div>
    </div>
  );
}
