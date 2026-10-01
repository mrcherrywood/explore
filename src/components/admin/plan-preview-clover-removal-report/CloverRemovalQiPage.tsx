"use client";

import { FOUR_STAR_CUTOFF, qiStarSupported } from "@/lib/plan-preview/clover-removal-constants";
import type { CloverRemovalContractPage, CloverRemovalReport } from "@/lib/plan-preview/clover-removal-report-data";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  formatScore,
} from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 3, paddingBottom: 3 } as const;
const PRODUCT_LABEL = "Stars 2026 Recalc 4-star path";
const QI_STARS = [1, 2, 3, 4, 5] as const;

function qiStar(contract: CloverRemovalContractPage, code: "C30" | "D04"): string {
  const row = contract.publishedQi.find((item) => item.code === code);
  return row ? `${row.star}★` : "—";
}

function removalLabel(contract: CloverRemovalContractPage): string {
  return contract.qiBasis === "full" ? "All allowed" : "Shared list";
}

function guessStar(contract: CloverRemovalContractPage, part: "C" | "D"): string {
  const guess = contract.qiGuess;
  if (!guess) return "—";
  if (part === "D" && guess.partDRemoved) return "Removed";
  const star = part === "C" ? guess.partCStar : guess.partDStar;
  return star == null ? "—" : `${star}★`;
}

function scoreColor(atFour: boolean): string {
  return atFour ? REPORT_COLORS.positive : "var(--fep-ink)";
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
  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title="If Quality Improvement changed"
      subtitle={`${report.parentOrganization}. The removed measures stay put. Only the QI stars change.`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <div className="fep-report-panel" style={{ padding: "8px 12px" }}>
        <p className="fep-label">How to read this</p>
        <p style={{ margin: "4px 0 0", fontSize: 10, lineHeight: 1.4 }}>
          <strong>Shared list</strong> is the one removal list for contracts that can reach 4.0.{" "}
          <strong>All allowed</strong> is every measure a contract can still lose and keep a rating. Those contracts cannot reach 4.0 with the QI stars CMS assigned, so the what-if uses that larger set.{" "}
          <strong>Best guess</strong> rebuilds QI from the measures that remain: significant improvement counts as +1, significant decline as −1, and no change counts as 0.{" "}
          The 1★–5★ columns are the average of the Part C and Part D Quality Improvement stars, with both measures at that star. <strong>No QI</strong> drops both Quality Improvement measures for this year and keeps the removal in that row. A highlighted cell is a star CMS already assigned. <strong>Not expected</strong> means this contract’s measure changes do not support that star. Green is an unrounded Overall of {FOUR_STAR_CUTOFF} or higher.
        </p>
      </div>

      <ReportSection
        title="CMS stars and best guess"
        note="Overall uses the removal in that row and the QI stars in that column."
        style={{ marginTop: 12 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 10 }}>
          <thead>
            <tr>
              <th className="l" rowSpan={2}>Contract</th>
              <th className="l" rowSpan={2}>Removal</th>
              <th colSpan={3}>CMS</th>
              <th colSpan={3}>Best guess</th>
            </tr>
            <tr>
              <th>Part C</th>
              <th>Part D</th>
              <th>Overall</th>
              <th>Part C</th>
              <th>Part D</th>
              <th>Overall</th>
            </tr>
          </thead>
          <tbody>
            {report.contracts.map((contract) => {
              const published = contract.qiBasis === "full" ? contract.fullPool : contract.sharedScore;
              return (
                <tr key={contract.contractId}>
                  <td className="l" style={{ ...CELL, fontWeight: 700 }}>{contract.contractId}</td>
                  <td className="l" style={CELL}>{removalLabel(contract)}</td>
                  <td style={{ ...CELL, fontWeight: 800, background: REPORT_COLORS.band }}>{qiStar(contract, "C30")}</td>
                  <td style={{ ...CELL, fontWeight: 800, background: REPORT_COLORS.band }}>{qiStar(contract, "D04")}</td>
                  <td style={{ ...CELL, fontWeight: 800, color: scoreColor((published?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF) }}>
                    {formatScore(published?.finalScoreRaw, 3)}
                  </td>
                  <td style={{ ...CELL, fontWeight: 800 }}>{guessStar(contract, "C")}</td>
                  <td style={{ ...CELL, fontWeight: 800 }}>{guessStar(contract, "D")}</td>
                  <td style={{ ...CELL, fontWeight: 800, color: scoreColor(contract.qiGuess?.atFour ?? false) }}>
                    {formatScore(contract.qiGuess?.finalScoreRaw, 3)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Average Quality Improvement star"
        note="A contract with only one QI measure changes that measure. The other Part C or Part D cell stays blank in the table above."
        style={{ marginTop: 12 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 10 }}>
          <thead>
            <tr>
              <th className="l">Contract</th>
              <th className="l">Removal</th>
              <th>No QI</th>
              {QI_STARS.map((star) => (
                <th key={star}>{star}★</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.contracts.map((contract) => (
              <tr key={contract.contractId}>
                <td className="l" style={{ ...CELL, fontWeight: 700 }}>{contract.contractId}</td>
                <td className="l" style={CELL}>{removalLabel(contract)}</td>
                <td style={{ ...CELL, fontWeight: 800, color: scoreColor(contract.qiNoQi.atFour) }}>
                  {formatScore(contract.qiNoQi.finalScoreRaw, 3)}
                </td>
                {contract.qiOptions.map((option) => {
                  const cms = contract.publishedQi.some((row) => row.star === option.qiStar);
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
                        fontWeight: 800,
                        color: scoreColor(option.atFour),
                        background: cms ? REPORT_COLORS.band : undefined,
                      }}
                    >
                      {formatScore(option.finalScoreRaw, 3)}
                      {!supported ? (
                        <div style={{ fontSize: 8, fontWeight: 600, color: "var(--fep-faint)" }}>Not expected</div>
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
