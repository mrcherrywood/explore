"use client";

import { useEffect, useState } from "react";

import type { ExclusionModelReport as ReportData } from "@/lib/plan-preview/exclusion-model-report";

import { ExclusionModelsView } from "./ExclusionModelsView";

export function ExclusionModelsReport({
  starsYear,
  parentOrganization,
}: {
  starsYear: number;
  parentOrganization: string;
}) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({
      starsYear: String(starsYear),
      parentOrganization,
    });
    fetch(`/api/admin/plan-preview/exclusion-models?${query}`)
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
              : `Failed to load the exclusion model report (${response.status}).`,
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
  }, [starsYear, parentOrganization]);

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
        <p className="fep-banner-info">Building the exclusion model report…</p>
      </div>
    );
  }

  return <ExclusionModelsView report={report} />;
}
