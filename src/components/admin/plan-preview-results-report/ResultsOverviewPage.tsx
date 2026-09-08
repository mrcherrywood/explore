"use client";

import type { PlanPreviewResultsReport } from "@/lib/plan-preview/results-report-data";

import {
  ReportPageFrame,
  ReportSection,
  ReportStat,
  StarGlyphs,
  formatScore,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

function BuildupRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "7px 0",
        borderTop: "1px solid var(--fep-row-border)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: emphasis ? 800 : 600,
          color: emphasis ? "var(--fep-ink)" : "var(--fep-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: emphasis ? 15 : 12,
          fontWeight: emphasis ? 800 : 700,
          color: "var(--fep-ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function ResultsOverviewPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: PlanPreviewResultsReport;
  pageNumber: number;
  totalPages: number;
}) {
  const overall = report.overall;
  const disaster =
    overall?.disasterPct1 || overall?.disasterPct2
      ? `Disaster ${overall.disasterYear1 ?? ""} ${formatScore(overall.disasterPct1, 0)}% · ${overall.disasterYear2 ?? ""} ${formatScore(overall.disasterPct2, 0)}%`
      : null;

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Official rating overview"
      subtitle={`${report.contract.contractId}${report.contract.contractName ? ` · ${report.contract.contractName}` : ""}`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel="Plan Preview 2 official results"
    >
      <div style={{ display: "flex", gap: 10 }}>
        <ReportStat
          label="Overall"
          value={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {formatStars(overall?.finalRating)}
              <StarGlyphs value={overall?.finalRating ?? null} />
            </span>
          }
          detail={overall?.varianceCategory ? `${overall.varianceCategory} variance` : undefined}
        />
        <ReportStat label="Part C" value={formatStars(report.partC?.finalRating)} />
        <ReportStat label="Part D" value={formatStars(report.partD?.finalRating)} />
      </div>

      <ReportSection
        title="Published score buildup"
        note="Mean + reward factor + CAI from the official summary file. No modeled thresholds."
      >
        <div className="fep-report-panel" style={{ padding: "4px 14px 8px" }}>
          <BuildupRow label="Calculated mean" value={formatScore(overall?.calculatedMean)} />
          <BuildupRow label="Reward factor" value={formatScore(overall?.rewardFactor, 2)} />
          <BuildupRow label="CAI" value={formatScore(overall?.caiValue)} />
          <BuildupRow label="Final summary" value={formatScore(overall?.finalSummary)} emphasis />
          <BuildupRow label="Published rating" value={formatStars(overall?.finalRating)} emphasis />
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 8 }}>
          Improvement usage: {overall?.improvementUsage ?? "—"}
          {disaster ? ` · ${disaster}` : ""}
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
