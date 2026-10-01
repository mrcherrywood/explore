"use client";

import { formatEnrollment } from "@/lib/peer/enrollment-levels";
import { FOUR_STAR_CUTOFF } from "@/lib/plan-preview/clover-removal-constants";
import type { CloverRemovalReport } from "@/lib/plan-preview/clover-removal-report-data";

import { formatMeasureAcronyms } from "@/lib/plan-preview/measure-acronyms";

import {
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  formatScore,
  formatStars,
} from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 3, paddingBottom: 3 } as const;
const PRODUCT_LABEL = "Stars 2026 Recalc 4-star path";

function formatList(codes: string[]): string {
  return codes.length === 0 ? "None" : formatMeasureAcronyms(codes);
}

export function CloverRemovalParentPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: CloverRemovalReport;
  pageNumber: number;
  totalPages: number;
}) {
  const recommended = report.recommended;
  const bestShared = recommended ?? report.ladder[report.ladder.length - 1] ?? null;
  const alreadyAtFour = report.contracts.filter((row) => row.alreadyAtFour).length;
  const reachable = report.contracts.filter((row) => row.reachableWithinMax).length;
  const enrollmentSource = `${report.enrollmentSource.year}-${String(report.enrollmentSource.month).padStart(2, "0")}`;
  const measureWord = report.lensId === "any" ? "available measures" : "eligible measures";

  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title={report.parentOrganization}
      subtitle={`${report.lensLabel}. One removal list for every contract that can reach 4.0. Enrollment from CMS ${enrollmentSource}.`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <div style={{ display: "flex", gap: 10 }}>
        <ReportStat label="Rated contracts" value={report.contracts.length} />
        <ReportStat label="Already 4.0+" value={alreadyAtFour} detail={`${reachable} can reach 4.0`} />
        <ReportStat
          label="Shared list"
          value={recommended ? recommended.k : "—"}
          detail={recommended ? `${recommended.contractsAtFour} contracts at 4.0` : `None while ${report.minRatedMeasures} measures remain`}
        />
        <ReportStat
          label="Members at 4.0"
          value={formatEnrollment(bestShared?.enrollmentAtFour ?? null)}
          detail={recommended ? undefined : bestShared ? `Best list of ${bestShared.k}` : undefined}
        />
      </div>

      <div className="fep-report-panel" style={{ marginTop: 12, padding: "8px 12px" }}>
        <p className="fep-label">How to read this</p>
        <p style={{ margin: "4px 0 0", fontSize: 10, lineHeight: 1.4 }}>
          {report.lensId === "any" ? (
            <>
              <strong>Any measure</strong> means every rated measure can be removed, except Quality Improvement. The Part D copies of Complaints and Members Choosing to Leave stay out of Overall.{" "}
              <strong>Order</strong> starts with the Stars 2026 Recalc and Model 2 measures, then the other domains, and HEDIS only if the contract is still short of 4.0.{" "}
              <strong>Shared list</strong> follows that order and, removed for every contract, gets each reachable contract to 4.0.{" "}
            </>
          ) : (
            <>
              <strong>Eligible measures</strong> are the Stars 2026 Recalc set plus Model 2. Quality Improvement is not chosen for removal, and the Part D copies of Complaints and Members Choosing to Leave are left out of Overall.{" "}
              <strong>Shared list</strong> is the set of eligible measures that, removed for every contract, gets each reachable contract to 4.0.{" "}
            </>
          )}
          <strong>Reachable</strong> means 4.0 is possible while at least {report.minRatedMeasures} Part C and Part D measures remain.{" "}
          <strong>Own minimum</strong> follows the same rule for one contract alone, so it can be smaller than the shared list.{" "}
          <strong>All 3★ and under</strong> removes every measure in this set scored 3★ or lower and shows that Overall. Quality Improvement stays. If removing all of them would leave no rating, the score is the highest that still leaves one. The following pages list those measures across every contract. 4.0 requires an unrounded final of {FOUR_STAR_CUTOFF} or higher.
        </p>
      </div>

      <ReportSection
        title="Recommended shared list"
        note="The same measures would be removed for every contract in this organization."
        style={{ marginTop: 12 }}
      >
        {recommended ? (
          recommended.k === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--fep-muted)" }}>
              {report.contracts.every((row) => row.alreadyAtFour)
                ? "Every rated contract is already at 4.0. No removals are needed."
                : `Every contract that can reach 4.0 from the ${measureWord} is already there. No additional removals are recommended.`}
            </p>
          ) : (
            <table className="fep-report-table compact" style={{ fontSize: 10 }}>
              <thead>
                <tr>
                  <th className="l">Measure</th>
                </tr>
              </thead>
              <tbody>
                {report.recommendedMeasures.map((measure) => (
                  <tr key={measure.code}>
                    <td className="l" style={{ ...CELL, whiteSpace: "normal" }}>
                      <MeasureLabel code={measure.code} name={measure.displayName} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "var(--fep-muted)" }}>
            No removal list gets every reachable contract to 4.0 while leaving at least {report.minRatedMeasures} measures. The sizes below show the list as measures are added.
          </p>
        )}
        {report.recommendedUsesHedis ? (
          <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--fep-muted)" }}>
            HEDIS is on this list because the earlier measures were not enough to get every reachable contract to 4.0.
          </p>
        ) : null}
      </ReportSection>

      <ReportSection
        title="List by size"
        note={
          report.lensId === "any"
            ? "Each row adds the next measure. Recalc and Model 2 measures come first, then the other domains, and HEDIS last."
            : "Each row adds the next eligible measure."
        }
        style={{ marginTop: 12 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
          <thead>
            <tr>
              <th>Size</th>
              <th className="l">Measures</th>
              <th>Contracts at 4.0</th>
              <th>Members at 4.0</th>
            </tr>
          </thead>
          <tbody>
            {report.ladder.map((row) => (
              <tr key={`${row.k}:${row.codes.join(",")}`}>
                <td style={{ ...CELL, fontWeight: 800 }}>{row.k}</td>
                <td className="l" style={{ ...CELL, fontSize: 9 }}>
                  {formatList(row.codes)}
                </td>
                <td style={CELL}>
                  {row.contractsAtFour} / {report.contracts.length}
                </td>
                <td style={CELL}>{formatEnrollment(row.enrollmentAtFour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection
        title="Contract results"
        note="Before is the modeled Overall with nothing removed. Own minimum is how many measures this contract alone would need removed. Shared is the Overall after the shared list. All 3★ and under is the Overall after every measure in this set scored 3★ or lower is removed."
        style={{ marginTop: 12 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
          <thead>
            <tr>
              <th className="l">Contract</th>
              <th>Published</th>
              <th>Before</th>
              <th>Own minimum</th>
              <th>Shared</th>
              <th>All 3★ and under</th>
              <th>Enrollment</th>
            </tr>
          </thead>
          <tbody>
            {report.contracts.map((row) => {
              const sharedAtFour = (row.sharedScore?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF;
              const lowAtFour = (row.lowStars.score?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF;
              return (
                <tr key={row.contractId}>
                  <td className="l" style={CELL}>
                    <span style={{ fontWeight: 700 }}>{row.contractId}</span>
                    {row.alreadyAtFour ? " · already 4.0" : null}
                  </td>
                  <td style={CELL}>{formatStars(row.publishedRating, 1)}</td>
                  <td style={CELL}>{formatScore(row.baseline?.finalScoreRaw, 3)}</td>
                  <td style={CELL}>
                    {row.minK === 0 ? "0" : row.minK === null ? "—" : String(row.minK)}
                  </td>
                  <td
                    style={{
                      ...CELL,
                      fontWeight: 700,
                      color: sharedAtFour ? REPORT_COLORS.positive : REPORT_COLORS.negative,
                    }}
                  >
                    {formatScore(row.sharedScore?.finalScoreRaw, 3)}
                    {row.sharedScore ? ` · ${formatStars(row.sharedScore.finalRating, 1)}` : ""}
                  </td>
                  <td
                    style={{
                      ...CELL,
                      fontWeight: 700,
                      color: lowAtFour ? REPORT_COLORS.positive : REPORT_COLORS.negative,
                    }}
                  >
                    {formatScore(row.lowStars.score?.finalScoreRaw, 3)}
                    {row.lowStars.score ? ` · ${formatStars(row.lowStars.score.finalRating, 1)}` : ""}
                  </td>
                  <td style={CELL}>{formatEnrollment(row.enrollment)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {report.excluded.length > 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--fep-faint)" }}>
            Excluded from the shared list:{" "}
            {report.excluded.map((row) => `${row.contractId} (${row.reason})`).join(" · ")}
          </p>
        ) : null}
        {report.sensitivity ? (
          <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--fep-muted)" }}>
            Recomputed reward-factor check:{" "}
            {report.sensitivity.every((row) => row.officialAtFour === row.recomputedAtFour)
              ? "the same contracts stay at 4.0 if the reward-factor cutoffs are recalculated for the whole market."
              : report.sensitivity
                  .filter((row) => row.officialAtFour !== row.recomputedAtFour)
                  .map(
                    (row) =>
                      `${row.contractId} becomes ${formatStars(row.recomputedRating, 1)} (${formatScore(row.recomputedScore, 3)})`,
                  )
                  .join("; ")}
          </p>
        ) : null}
      </ReportSection>
    </ReportPageFrame>
  );
}
