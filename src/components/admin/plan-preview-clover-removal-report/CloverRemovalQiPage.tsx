"use client";

import { FOUR_STAR_CUTOFF, qiStarSupported } from "@/lib/plan-preview/clover-removal-constants";
import type { CloverRemovalContractPage, CloverRemovalReport } from "@/lib/plan-preview/clover-removal-report-data";
import { measureAcronym } from "@/lib/plan-preview/measure-acronyms";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  formatScore,
  formatSigned,
} from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 3, paddingBottom: 3 } as const;
const PRODUCT_LABEL = "Stars 2026 Recalc 4-star path";
const QI_STARS = [1, 2, 3, 4, 5] as const;

function publishedQiLabel(contract: CloverRemovalContractPage): string {
  if (contract.publishedQi.length === 0) return "None";
  return contract.publishedQi
    .map((row) => `${measureAcronym(row.code)} ${row.star}★`)
    .join(" · ");
}

function isCmsStar(contract: CloverRemovalContractPage, qiStar: number): boolean {
  return contract.publishedQi.some((row) => row.star === qiStar);
}

function guessParts(contract: CloverRemovalContractPage): string[] {
  const guess = contract.qiGuess;
  if (!guess) return [];
  return [
    guess.partCStar != null ? `QI (C) ${guess.partCStar}★` : null,
    guess.partDRemoved ? "QI (D) removed" : guess.partDStar != null ? `QI (D) ${guess.partDStar}★` : null,
  ].filter((part): part is string => part != null);
}

function directionNote(contract: CloverRemovalContractPage): string {
  if (contract.qiDirection === "up") return `${contract.qiImproved} improved`;
  if (contract.qiDirection === "down") return `${contract.qiDeclined} declined`;
  if (contract.qiImproved === 0 && contract.qiDeclined === 0) return "No significance";
  return "Mixed";
}

export function CloverRemovalQiPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: CloverRemovalReport;
  pageNumber: number;
  totalPages: number;
}) {
  const listSize = report.recommended?.k ?? report.ladder[report.ladder.length - 1]?.k ?? 0;

  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title="Quality Improvement options"
      subtitle={`${report.parentOrganization} · QI stars after the shared list, plus each whole-star QI rating`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <ReportSection
        title="Shared list at each QI rating"
        note={`Highlighted cells are the QI stars CMS assigned. The shared list uses those stars. Best guess rebuilds the improvement score without the removed measures: significant improvement counts +1, significant decline counts −1, and no change or hold harmless counts 0, then the official QI cut points assign the star. Blank cells are stars the contract's improvement and decline counts do not support. Each shown score keeps the ${listSize}-measure shared list. 4.0 requires ${FOUR_STAR_CUTOFF} or higher.`}
      >
        <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
          <thead>
            <tr>
              <th className="l">Contract</th>
              <th className="l">CMS QI</th>
              <th className="l">Best guess</th>
              <th className="l">Improved vs declined</th>
              <th>With CMS QI</th>
              {QI_STARS.map((star) => (
                <th key={star}>{star}★</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.contracts.map((contract) => (
              <tr key={contract.contractId}>
                <td className="l" style={{ ...CELL, fontWeight: 700 }}>
                  {contract.contractId}
                </td>
                <td className="l" style={{ ...CELL, fontWeight: 800, background: REPORT_COLORS.band }}>
                  {publishedQiLabel(contract)}
                </td>
                <td
                  className="l"
                  style={{
                    ...CELL,
                    fontWeight: 800,
                    color: contract.qiGuess?.atFour ? REPORT_COLORS.positive : "var(--fep-ink)",
                  }}
                >
                  {guessParts(contract).length === 0
                    ? "—"
                    : guessParts(contract).map((part) => <div key={part}>{part}</div>)}
                  {contract.qiGuess ? (
                    <div style={{ fontSize: 8, fontWeight: 700 }}>
                      {formatScore(contract.qiGuess.finalScoreRaw, 3)}
                      {" · "}
                      {formatSigned(contract.qiGuess.rewardFactor, 1)}
                    </div>
                  ) : null}
                </td>
                <td className="l" style={CELL}>
                  {directionNote(contract)}
                </td>
                <td style={{ ...CELL, fontWeight: 800, background: REPORT_COLORS.band }}>
                  {formatScore(contract.sharedScore?.finalScoreRaw, 3)}
                </td>
                {contract.qiOptions.map((option) => {
                  const cms = isCmsStar(contract, option.qiStar);
                  const supported = qiStarSupported(
                    contract.qiDirection,
                    contract.publishedQi.map((row) => row.star),
                    option.qiStar,
                  );
                  return (
                    <td
                      key={option.qiStar}
                      style={{
                        ...CELL,
                        fontWeight: cms || option.atFour ? 800 : 500,
                        color: !supported
                          ? "var(--fep-faint)"
                          : option.atFour
                            ? REPORT_COLORS.positive
                            : "var(--fep-ink)",
                        background: cms ? REPORT_COLORS.band : undefined,
                      }}
                    >
                      {supported ? formatScore(option.finalScoreRaw, 3) : "—"}
                      {cms ? <div style={{ fontSize: 8, fontWeight: 800 }}>CMS</div> : null}
                      {supported ? (
                        <div style={{ fontSize: 8, fontWeight: 600, color: "var(--fep-faint)" }}>
                          {formatSigned(option.rewardFactor, 1)}
                        </div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
