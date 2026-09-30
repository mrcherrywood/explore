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

  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title={report.parentOrganization}
      subtitle={`Smallest shared Stars 2026 Recalc removal list that gets every reachable contract to 4.0. Enrollment from CMS ${enrollmentSource}.`}
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
          label="Shared removals"
          value={recommended ? recommended.k : "—"}
          detail={recommended ? `${recommended.contractsAtFour} contracts at 4.0` : `None within ${report.maxRemovals}`}
        />
        <ReportStat
          label="Members at 4.0"
          value={formatEnrollment(bestShared?.enrollmentAtFour ?? null)}
          detail={recommended ? undefined : bestShared ? `Best list of ${bestShared.k}` : undefined}
        />
      </div>

      <ReportSection
        title="Recommended shared list"
        note={`One CMS removal list applied to every ${report.parentOrganization} contract. 4.0 requires an unrounded final of ${FOUR_STAR_CUTOFF}+.`}
        style={{ marginTop: 12 }}
      >
        {recommended ? (
          recommended.k === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--fep-muted)" }}>
              {report.contracts.every((row) => row.alreadyAtFour)
                ? "Every rated contract is already at 4.0. No Stars 2026 Recalc removals are needed."
                : "Every contract that can reach 4.0 from this pool is already there. No additional removals are recommended."}
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
            No shared list of {report.maxRemovals} or fewer Stars 2026 Recalc measures gets every
            reachable contract to 4.0. The ladder below shows the best list at each size.
          </p>
        )}
      </ReportSection>

      <ReportSection
        title="Shared-list ladder"
        note="Best list at each size. Ties break by members at 4.0, then total score."
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
              <tr key={row.k}>
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
        title="Contract path"
        note="Modeled Overall before and after the recommended shared list."
        style={{ marginTop: 12 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
          <thead>
            <tr>
              <th className="l">Contract</th>
              <th>Published</th>
              <th>Modeled</th>
              <th>Own min</th>
              <th>Shared</th>
              <th>Enrollment</th>
            </tr>
          </thead>
          <tbody>
            {report.contracts.map((row) => {
              const sharedAtFour = (row.sharedScore?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF;
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
                  <td style={CELL}>{formatEnrollment(row.enrollment)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {report.excluded.length > 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--fep-faint)" }}>
            Excluded from the shared goal:{" "}
            {report.excluded.map((row) => `${row.contractId} (${row.reason})`).join(" · ")}
          </p>
        ) : null}
        {report.sensitivity ? (
          <p style={{ margin: "8px 0 0", fontSize: 10, color: "var(--fep-muted)" }}>
            Recomputed-threshold check:{" "}
            {report.sensitivity.every((row) => row.officialAtFour === row.recomputedAtFour)
              ? "the same contracts stay at 4.0 if CMS recomputes reward-factor thresholds."
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
