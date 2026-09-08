"use client";

import { useEffect, useState } from "react";

import type { PlanPreviewResultsReport as ReportData } from "@/lib/plan-preview/results-report-data";

import { PlanPreviewResultsReportView } from "./PlanPreviewResultsReportView";

export function PlanPreviewResultsReport({
  starsYear,
  contractId,
}: {
  starsYear: number;
  contractId: string;
}) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/admin/plan-preview/results-report?starsYear=${starsYear}&contractId=${encodeURIComponent(contractId)}`,
    )
      .then(async (response) => {
        const text = await response.text();
        let body: { error?: string } | ReportData | null = null;
        try {
          body = text ? (JSON.parse(text) as { error?: string } | ReportData) : null;
        } catch {
          throw new Error(
            text.trim()
              ? `Report failed (${response.status}): ${text.slice(0, 240)}`
              : `Report failed (${response.status}).`,
          );
        }
        if (!response.ok) {
          throw new Error(
            body && "error" in body && body.error
              ? body.error
              : `Failed to load the official report (${response.status}).`,
          );
        }
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

  if (error) {
    return (
      <div className="px-[30px] py-10">
        <p className="fep-banner-error">{error}</p>
      </div>
    );
  }

  if (loading || !report) {
    return (
      <div className="px-[30px] py-10">
        <p className="fep-banner-info">Building the official contract report…</p>
      </div>
    );
  }

  return (
    <PlanPreviewResultsReportView
      report={report}
      backHref="/admin/plan-preview"
      backLabel="Plan Preview Admin"
      heading="Official Contract Report"
      subheading={`${contractId} · Stars ${starsYear} Plan Preview 2 official results, formatted for 8.5×11 PDF export.`}
      fileName={`plan-preview-2-report_${contractId}_stars-${starsYear}`}
    />
  );
}
