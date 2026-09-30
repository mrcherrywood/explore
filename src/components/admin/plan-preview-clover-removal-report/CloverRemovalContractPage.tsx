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

function pathLabel(contract: ContractRow): string {
  if (contract.alreadyAtFour) return "Already at 4.0";
  if (contract.minK === null) {
    return contract.fullPool && contract.fullPool.finalScoreRaw >= FOUR_STAR_CUTOFF
      ? `Reachable only above ${contract.candidates.length} removals`
      : "Not reachable from the Stars 2026 Recalc pool";
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

  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title={contract.contractName ?? contract.contractId}
      subtitle={`${contract.contractId} · ${formatEnrollment(contract.enrollment)} members · own path: ${pathLabel(contract)}`}
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
        <ReportStat
          label="Modeled now"
          value={formatScore(contract.baseline?.finalScoreRaw, 3)}
          detail={contract.baseline ? `${formatStars(contract.baseline.finalRating, 1)}★` : undefined}
        />
        <ReportStat label="Own minimum" value={contract.minK ?? "—"} detail={pathLabel(contract)} />
        <ReportStat
          label="Full-pool ceiling"
          value={formatScore(contract.fullPool?.finalScoreRaw, 3)}
          detail={contract.fullPool ? `${formatStars(contract.fullPool.finalRating, 1)}★` : undefined}
        />
      </div>

      <ReportSection title="Score buildup" note="Base mean + reward factor + CAI, using published Quality Improvement stars.">
        <div style={{ display: "flex", gap: 12 }}>
          <div className="fep-report-panel" style={{ flex: 1, padding: "8px 12px" }}>
            <p className="fep-label">Modeled now</p>
            <BuildupRow label="Base mean" value={formatScore(contract.baseline?.baseMean, 3)} />
            <BuildupRow label="Reward factor" value={formatScore(contract.baseline?.rewardFactor, 1)} />
            <BuildupRow label="CAI" value={formatScore(contract.baseline?.caiValue, 3)} />
            <BuildupRow label="Final" value={formatScore(contract.baseline?.finalScoreRaw, 3)} emphasis />
          </div>
          <div className="fep-report-panel" style={{ flex: 1, padding: "8px 12px" }}>
            <p className="fep-label">{best ? "Best own set" : "Own set"}</p>
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
          </div>
        </div>
      </ReportSection>

      <ReportSection
        title="Minimum own sets"
        note={
          contract.minSets.length === 0
            ? "No Stars 2026 Recalc subset of 8 or fewer measures reaches a 4.0 Overall."
            : "Smallest sets that reach 4.0, sorted by resulting score. Up to 10 shown."
        }
      >
        {contract.minSets.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--fep-muted)" }}>
            Removing the whole Stars 2026 Recalc pool leaves a modeled final of{" "}
            {formatScore(contract.fullPool?.finalScoreRaw, 3)}.
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
        <ReportSection title="Removed measure stars" note="Published Plan Preview 2 stars for the best own set.">
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
