"use client";

import { FOUR_STAR_CUTOFF } from "@/lib/plan-preview/clover-removal-constants";
import type {
  CloverRemovalContractPage,
  CloverRemovalReport,
} from "@/lib/plan-preview/clover-removal-report-data";

import {
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  formatScore,
  formatStars,
} from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 3, paddingBottom: 3 } as const;
const PRODUCT_LABEL = "Stars 2026 Recalc 4-star path";

export type BetterOfMeasureRow = {
  contractId: string;
  code: string;
  displayName: string;
  currentStar: number;
  priorStar: number;
};

function scoreColor(score: number | null | undefined): string {
  return (score ?? 0) >= FOUR_STAR_CUTOFF ? REPORT_COLORS.positive : "var(--fep-ink)";
}

function scoreText(score: { finalScoreRaw: number; finalRating: number } | null): string {
  if (!score) return "—";
  return `${formatScore(score.finalScoreRaw, 3)} · ${formatStars(score.finalRating, 1)}`;
}

export function CloverRemovalBetterOfScoresPage({
  report,
  contracts,
  pageNumber,
  totalPages,
  continued,
}: {
  report: CloverRemovalReport;
  contracts: CloverRemovalContractPage[];
  pageNumber: number;
  totalPages: number;
  continued: boolean;
}) {
  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title="Better-Of and no Quality Improvement"
      subtitle={`${report.parentOrganization}. This year is Stars ${report.starsYear}. Last year is Stars ${report.priorStarsYear}.`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      {continued ? null : (
        <div className="fep-report-panel" style={{ padding: "8px 12px" }}>
          <p className="fep-label">How to read this</p>
          <p style={{ margin: "4px 0 0", fontSize: 10, lineHeight: 1.4 }}>
            <strong>Better-Of</strong> keeps this year’s star when it is the same or higher, and uses the Stars {report.priorStarsYear} star when last year was higher. The score is the Overall from those stars. Quality Improvement stays.{" "}
            {report.priorStarsAvailable ? null : `Stars ${report.priorStarsYear} measure stars were not available, so Better-Of matches this year. `}
            <strong>No QI</strong> drops Part C and Part D Quality Improvement and uses the official without-QI reward-factor thresholds, the same way Plan Preview 1 does. Neither score removes other measures. Green is an unrounded Overall of {FOUR_STAR_CUTOFF} or higher.
          </p>
        </div>
      )}

      <ReportSection
        title={continued ? "Contract scores, continued" : "Contract scores"}
        note="This year is the modeled Overall with nothing removed. Last year higher is how many measures used last year’s star."
        style={{ marginTop: continued ? 0 : 12 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 10 }}>
          <thead>
            <tr>
              <th className="l">Contract</th>
              <th>This year</th>
              <th>Better-Of</th>
              <th>Last year higher</th>
              <th>No QI</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <tr key={contract.contractId}>
                <td className="l" style={{ ...CELL, fontWeight: 700 }}>{contract.contractId}</td>
                <td style={CELL}>{scoreText(contract.baseline)}</td>
                <td style={{ ...CELL, fontWeight: 800, color: scoreColor(contract.betterOf.score?.finalScoreRaw) }}>
                  {scoreText(contract.betterOf.score)}
                </td>
                <td style={CELL}>{contract.betterOf.usedPrior.length}</td>
                <td style={{ ...CELL, fontWeight: 800, color: scoreColor(contract.noQi?.finalScoreRaw) }}>
                  {scoreText(contract.noQi)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}

export function CloverRemovalBetterOfMeasuresPage({
  report,
  rows,
  pageNumber,
  totalPages,
  continued,
}: {
  report: CloverRemovalReport;
  rows: BetterOfMeasureRow[];
  pageNumber: number;
  totalPages: number;
  continued: boolean;
}) {
  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title="Measures where last year was higher"
      subtitle={`${report.parentOrganization}. Better-Of uses the Stars ${report.priorStarsYear} star on these measures.`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <ReportSection
        title={continued ? "Continued" : "Last year was the higher star"}
        note="These are the only measures that change under Better-Of. Every other measure keeps this year’s star."
      >
        <table className="fep-report-table compact" style={{ fontSize: 10 }}>
          <thead>
            <tr>
              <th className="l">Contract</th>
              <th className="l">Measure</th>
              <th>This year</th>
              <th>Last year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.contractId}-${row.code}`}>
                <td className="l" style={{ ...CELL, fontWeight: 700 }}>{row.contractId}</td>
                <td className="l" style={CELL}>
                  <MeasureLabel code={row.code} name={row.displayName} />
                </td>
                <td style={CELL}>{row.currentStar}★</td>
                <td style={{ ...CELL, fontWeight: 800, background: REPORT_COLORS.band }}>{row.priorStar}★</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
