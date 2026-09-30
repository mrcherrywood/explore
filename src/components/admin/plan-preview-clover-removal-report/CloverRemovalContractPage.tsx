"use client";

import { formatEnrollment } from "@/lib/peer/enrollment-levels";
import { FOUR_STAR_CUTOFF } from "@/lib/plan-preview/clover-removal-constants";
import type {
  CloverRemovalContractPage as ContractRow,
  CloverRemovalReport,
} from "@/lib/plan-preview/clover-removal-report-data";

import {
  BuildupRow,
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  formatScore,
  formatStars,
} from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 2, paddingBottom: 2 } as const;
const PRODUCT_LABEL = "Stars 2026 Recalc 4-star path";

function ceilingBelowPublished(contract: ContractRow): boolean {
  const ceiling = contract.fullPool?.finalScoreRaw;
  if (ceiling == null) return false;
  if (contract.publishedFinal != null) return ceiling < contract.publishedFinal;
  if (contract.publishedRating != null) return ceiling < contract.publishedRating;
  return false;
}

function pathLabel(contract: ContractRow, anyMeasure: boolean): string {
  if (contract.alreadyAtFour) return "Already at 4.0";
  if (contract.minK === null) {
    return contract.fullPool && contract.fullPool.finalScoreRaw >= FOUR_STAR_CUTOFF
      ? `Needs more than ${contract.candidates.length} removals`
      : anyMeasure
        ? "Cannot reach 4.0 from these measures"
        : "Cannot reach 4.0 from the eligible measures";
  }
  return `${contract.minK} measure${contract.minK === 1 ? "" : "s"}`;
}

export function CloverRemovalContractPage({
  report,
  contract,
  pageNumber,
  totalPages,
}: {
  report: CloverRemovalReport;
  contract: ContractRow;
  pageNumber: number;
  totalPages: number;
}) {
  const best = contract.minSets[0] ?? null;
  const sharedAtFour = (contract.sharedScore?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF;
  const anyMeasure = report.lensId === "any";
  const removedAll = "Highest score that still leaves a rating";
  const ceilingBelow = ceilingBelowPublished(contract);

  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title={contract.contractName ?? contract.contractId}
      subtitle={`${contract.contractId} · ${report.lensLabel} · ${formatEnrollment(contract.enrollment)} members · own minimum: ${pathLabel(contract, anyMeasure)}`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <div style={{ display: "flex", gap: 10 }}>
        <ReportStat
          label="Published Overall"
          value={`${formatStars(contract.publishedRating, 1)}★`}
          detail={formatScore(contract.publishedFinal, 3)}
        />
        <ReportStat label="Own minimum" value={contract.minK ?? "—"} detail={pathLabel(contract, anyMeasure)} />
        <ReportStat
          label="Ceiling"
          value={ceilingBelow ? "Below published" : formatScore(contract.fullPool?.finalScoreRaw, 3)}
          detail={ceilingBelow ? "Lower than the published Overall" : contract.fullPool ? `${removedAll} · ${formatStars(contract.fullPool.finalRating, 1)}★` : removedAll}
        />
      </div>

        <ReportSection title="Score buildup" note="Own minimum is the removal set for this contract alone. Shared list is the one list for the whole organization. Both use the Quality Improvement stars CMS assigned.">
        <div style={{ display: "flex", gap: 12 }}>
          <div className="fep-report-panel" style={{ flex: 1, padding: "8px 12px" }}>
            <p className="fep-label">Own minimum</p>
            <BuildupRow label="Base mean" value={formatScore(best?.score.baseMean, 3)} />
            <BuildupRow label="Reward factor" value={formatScore(best?.score.rewardFactor, 1)} />
            <BuildupRow label="CAI" value={formatScore(best?.score.caiValue, 3)} />
            <BuildupRow label="Final" value={formatScore(best?.score.finalScoreRaw, 3)} emphasis />
          </div>
          <div className="fep-report-panel" style={{ flex: 1, padding: "8px 12px" }}>
            <p className="fep-label">Shared list</p>
            <BuildupRow label="Base mean" value={formatScore(contract.sharedScore?.baseMean, 3)} />
            <BuildupRow
              label="Reward factor"
              value={formatScore(contract.sharedScore?.rewardFactor, 1)}
            />
            <BuildupRow label="CAI" value={formatScore(contract.sharedScore?.caiValue, 3)} />
            <BuildupRow
              label="Final"
              value={formatScore(contract.sharedScore?.finalScoreRaw, 3)}
              emphasis
            />
            <p style={{ margin: "6px 0 0", fontSize: 10, color: sharedAtFour ? REPORT_COLORS.positive : REPORT_COLORS.negative }}>
              {sharedAtFour ? "Reaches 4.0 on the shared list." : "Does not reach 4.0 on the shared list."}
            </p>
            {contract.sharedScore?.partDQiRemoved ? (
              <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--fep-muted)" }}>
                Part D QI is removed with the other Part D measures.
              </p>
            ) : null}
          </div>
        </div>
      </ReportSection>

      <ReportSection
        title="Own minimum sets"
        note={
          contract.minSets.length === 0
            ? `No removal leaves this contract at 4.0 while keeping at least ${report.minRatedMeasures} Part C and Part D measures.`
            : "The removal set that reaches 4.0 for this contract alone."
        }
      >
        {contract.minSets.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--fep-muted)" }}>
            {ceilingBelow
              ? `Removing every ${anyMeasure ? "available measure" : "eligible measure"} leaves a score lower than the published Overall.`
              : `Removing every ${anyMeasure ? "available measure" : "eligible measure"} leaves a final of ${formatScore(contract.fullPool?.finalScoreRaw, 3)}.`}
          </p>
        ) : (
          <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
            <thead>
              <tr>
                <th className="l">Remove</th>
                <th>Stars</th>
                <th>Mean</th>
                <th>RF</th>
                <th>CAI</th>
                <th>Final</th>
              </tr>
            </thead>
            <tbody>
              {contract.minSets.map((set) => (
                <tr key={set.measures.map((row) => row.code).join("-") || "none"}>
                  <td className="l" style={{ ...CELL, fontSize: 9 }}>
                    {set.measures.length === 0
                      ? "None"
                      : set.measures.map((row) => row.acronym).join(", ")}
                  </td>
                  <td style={CELL}>
                    {set.measures.length === 0
                      ? "—"
                      : set.measures
                          .map((row) => (row.star === null ? "—" : `${row.star}★`))
                          .join(" · ")}
                  </td>
                  <td style={CELL}>{formatScore(set.score.baseMean, 3)}</td>
                  <td style={CELL}>{formatScore(set.score.rewardFactor, 1)}</td>
                  <td style={CELL}>{formatScore(set.score.caiValue, 3)}</td>
                  <td style={{ ...CELL, fontWeight: 800 }}>
                    {formatScore(set.score.finalScoreRaw, 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      {best && best.measures.length > 0 ? (
        <ReportSection title="Measures on the own minimum" note="Official stars for the shortest set that reaches 4.0 for this contract alone.">
          <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
            <thead>
              <tr>
                <th className="l">Measure</th>
                <th>Weight</th>
                <th>Star</th>
              </tr>
            </thead>
            <tbody>
              {best.measures.map((row) => (
                <tr key={row.code}>
                  <td className="l" style={CELL}>
                    <MeasureLabel code={row.code} name={row.displayName} />
                  </td>
                  <td style={CELL}>{row.weight ?? "—"}</td>
                  <td style={{ ...CELL, fontWeight: 800 }}>
                    {row.star === null ? "—" : `${row.star}★`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>
      ) : null}
    </ReportPageFrame>
  );
}
