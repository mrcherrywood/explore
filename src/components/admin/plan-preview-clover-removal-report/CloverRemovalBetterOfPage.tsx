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
  displayCode: string;
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
            <strong>Best case</strong> uses the higher star of this year and Stars {report.priorStarsYear}, drops Quality Improvement, and removes every Recalc and Clover-20 measure that is still below 4.0 when a rating can remain.{" "}
            {report.priorStarsAvailable ? null : `Stars ${report.priorStarsYear} measure stars were not available, so Better-Of matches this year. `}
            <strong>Better-Of</strong> is the higher star with nothing removed. <strong>No QI</strong> drops Quality Improvement and leaves every other measure in place. Green is an unrounded Overall of {FOUR_STAR_CUTOFF} or higher.
          </p>
        </div>
      )}

      <ReportSection
        title={continued ? "Contract scores, continued" : "Contract scores"}
        note="Best case is Better-Of, no Quality Improvement, and the Recalc and Clover-20 measures below 4.0 removed. The other columns are each piece on its own."
        style={{ marginTop: continued ? 0 : 12 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 9 }}>
          <thead>
            <tr>
              <th className="l">Contract</th>
              <th>Best case</th>
              <th>This year</th>
              <th>Better-Of</th>
              <th>No QI</th>
              <th>Last year higher</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <tr key={contract.contractId}>
                <td className="l" style={{ ...CELL, fontWeight: 700 }}>{contract.contractId}</td>
                <td style={{ ...CELL, fontWeight: 800, color: scoreColor(contract.bestCase.score?.finalScoreRaw), background: REPORT_COLORS.band }}>
                  {scoreText(contract.bestCase.score)}
                </td>
                <td style={CELL}>{scoreText(contract.baseline)}</td>
                <td style={{ ...CELL, fontWeight: 800, color: scoreColor(contract.betterOf.score?.finalScoreRaw) }}>
                  {scoreText(contract.betterOf.score)}
                </td>
                <td style={{ ...CELL, fontWeight: 800, color: scoreColor(contract.noQi?.finalScoreRaw) }}>
                  {scoreText(contract.noQi)}
                </td>
                <td style={CELL}>{contract.betterOf.usedPrior.length}</td>
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
                  <MeasureLabel code={row.displayCode} name={row.displayName} />
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

export function CloverRemovalBetterOfListPage({
  report,
  contracts,
  shortCount,
  pushedCount,
  pageNumber,
  totalPages,
  continued,
}: {
  report: CloverRemovalReport;
  contracts: CloverRemovalContractPage[];
  shortCount: number;
  pushedCount: number;
  pageNumber: number;
  totalPages: number;
  continued: boolean;
}) {
  const listLabel = report.betterOfList.length === 0
    ? "None"
    : report.betterOfList.map((measure) => measure.acronym).join(", ");
  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title="Better-Of removal list"
      subtitle={`${report.parentOrganization} · ${report.lensLabel}. Built from the higher star of this year and Stars ${report.priorStarsYear}.`}
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
            This list is built again with Better-Of stars. It includes only contracts that are short of 4.0 on this year’s stars.{" "}
            <strong>{pushedCount} of {shortCount}</strong> reach 4.0 once last year’s higher stars are used.{" "}
            The shared list is {listLabel}. Green is an unrounded Overall of {FOUR_STAR_CUTOFF} or higher.
          </p>
        </div>
      )}
      <ReportSection
        title={shortCount === 0 ? "Already able to reach 4.0" : continued ? "Continued" : "Contracts short of 4.0 this year"}
        note={shortCount === 0
          ? "Every rated contract can already reach 4.0 on this year’s stars, so Better-Of does not add a contract."
          : "Own list is the shortest set for that contract. Shared list is the one list for every contract that can reach 4.0 with Better-Of stars."}
        style={{ marginTop: continued ? 0 : 12 }}
      >
        {shortCount === 0 ? null : (
          <table className="fep-report-table compact" style={{ fontSize: 9 }}>
            <thead>
              <tr>
                <th className="l">Contract</th>
                <th>Better-Of</th>
                <th className="l">Own list</th>
                <th>Own score</th>
                <th>Shared list</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => {
                const reached = contract.betterOfPath.alreadyAtFour || contract.betterOfPath.reachable;
                return (
                  <tr key={contract.contractId}>
                    <td className="l" style={{ ...CELL, fontWeight: 700 }}>{contract.contractId}</td>
                    <td style={{ ...CELL, fontWeight: 800, color: scoreColor(reached ? FOUR_STAR_CUTOFF : 0) }}>
                      {reached ? "Reaches 4.0" : "Still short"}
                    </td>
                    <td className="l" style={{ ...CELL, fontSize: 8 }}>
                      {contract.betterOfPath.measures.length === 0
                        ? "None"
                        : contract.betterOfPath.measures.map((measure) => measure.acronym).join(", ")}
                    </td>
                    <td style={{ ...CELL, fontWeight: 800, color: scoreColor(contract.betterOfPath.score?.finalScoreRaw) }}>
                      {scoreText(contract.betterOfPath.score)}
                    </td>
                    <td style={{ ...CELL, fontWeight: 800, color: scoreColor(contract.betterOfPath.sharedScore?.finalScoreRaw) }}>
                      {scoreText(contract.betterOfPath.sharedScore)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </ReportSection>
    </ReportPageFrame>
  );
}
