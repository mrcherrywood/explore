"use client";

import { FOUR_STAR_CUTOFF } from "@/lib/plan-preview/clover-removal-constants";
import type { CloverDomainRemoval, DomainRemovalScore } from "@/lib/plan-preview/clover-domain-removal";
import type { CloverRemovalReport } from "@/lib/plan-preview/clover-removal-report-data";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  formatScore,
  formatStars,
} from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 2, paddingBottom: 2 } as const;
const PRODUCT_LABEL = "Stars 2026 Recalc 4-star path";

function ScoreCell({ score }: { score: DomainRemovalScore | undefined }) {
  if (!score || score.unrated || score.finalScoreRaw == null) {
    return <td style={CELL}>—</td>;
  }
  return (
    <td
      style={{
        ...CELL,
        fontWeight: 700,
        color: score.finalScoreRaw >= FOUR_STAR_CUTOFF ? REPORT_COLORS.positive : REPORT_COLORS.negative,
      }}
    >
      {formatScore(score.finalScoreRaw, 3)}
      {score.finalRating != null ? ` · ${formatStars(score.finalRating, 1)}` : ""}
    </td>
  );
}

export function CloverRemovalDomainPage({
  report,
  domainRemoval,
  scenarioStart,
  scenarioEnd,
  contractIds,
  pageNumber,
  totalPages,
  continued,
}: {
  report: CloverRemovalReport;
  domainRemoval: CloverDomainRemoval;
  scenarioStart: number;
  scenarioEnd: number;
  contractIds: string[];
  pageNumber: number;
  totalPages: number;
  continued: boolean;
}) {
  const scenarios = domainRemoval.scenarios.slice(scenarioStart, scenarioEnd);
  const contracts = contractIds.map((contractId) =>
    domainRemoval.contracts.find((contract) => contract.contractId === contractId),
  );
  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title={continued ? "Domain removals, continued" : "Domain removals"}
      subtitle="Each row drops those domains and rescores Overall. Quality Improvement stays. An em dash means too few measures remain for a rating."
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <ReportSection
        title="Overall after domain removals"
        note="Green is an unrounded Overall of 3.75 or higher. Each contract's reward factor is recalculated from the measures that remain, using cutoffs rebuilt for the whole market."
        style={{ marginTop: 8 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 8.5 }}>
          <thead>
            <tr>
              <th className="l">Domains removed</th>
              {contractIds.map((contractId) => (
                <th key={contractId}>{contractId}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario, index) => (
              <tr key={scenario.id}>
                <td className="l" style={{ ...CELL, fontWeight: scenario.domains.length === 1 ? 700 : 500 }}>
                  {scenario.label}
                </td>
                {contracts.map((contract, contractIndex) => (
                  <ScoreCell
                    key={contractIds[contractIndex]}
                    score={contract?.scores[scenarioStart + index]}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
