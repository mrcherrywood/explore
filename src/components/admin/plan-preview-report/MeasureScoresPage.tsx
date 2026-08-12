"use client";

import type { Ref } from "react";

import type {
  PlanPreviewContractReport,
  ReportMeasure,
} from "@/lib/plan-preview/report-data";
import { isScoreDeltaImprovement } from "@/lib/plan-preview/score-delta-direction";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  formatCahpsStarSourceLabel,
  formatMeasureUpside,
  formatSigned,
  formatStars,
  reportEyebrow,
} from "./report-shared";

export type MeasureScorePart = "Part C" | "Part D";

function formatMeasureScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Number.isInteger(value)) return value.toFixed(0);
  if (Math.abs(value) < 1) return value.toFixed(2);
  return value.toFixed(1);
}

function measurePart(measure: ReportMeasure): MeasureScorePart {
  return measure.measureCode.toUpperCase().startsWith("D") ? "Part D" : "Part C";
}

function sortMeasureScoreRows(measures: ReportMeasure[]): ReportMeasure[] {
  return [...measures].sort((left, right) =>
    left.measureCode
      .toUpperCase()
      .localeCompare(right.measureCode.toUpperCase(), undefined, {
        numeric: true,
      }),
  );
}

/** One page per part (Part C, then Part D), sorted by measure code. */
export function chunkMeasureScoresByPart(
  measures: ReportMeasure[],
): { part: MeasureScorePart; rows: ReportMeasure[] }[] {
  const partC = sortMeasureScoreRows(
    measures.filter((measure) => measurePart(measure) === "Part C"),
  );
  const partD = sortMeasureScoreRows(
    measures.filter((measure) => measurePart(measure) === "Part D"),
  );
  const chunks: { part: MeasureScorePart; rows: ReportMeasure[] }[] = [];
  if (partC.length > 0) chunks.push({ part: "Part C", rows: partC });
  if (partD.length > 0) chunks.push({ part: "Part D", rows: partD });
  return chunks.length > 0 ? chunks : [{ part: "Part C", rows: [] }];
}

export function MeasureScoresPage({
  report,
  part,
  rows,
  pageNumber,
  totalPages,
  pageRef,
  sample,
}: {
  report: PlanPreviewContractReport;
  part: MeasureScorePart;
  rows: ReportMeasure[];
  pageNumber: number;
  totalPages: number;
  pageRef?: Ref<HTMLDivElement>;
  sample?: boolean;
}) {
  const baselineYear = report.baselineYear ?? "—";

  return (
    <ReportPageFrame
      pageRef={pageRef}
      eyebrow={reportEyebrow(report.starsYear, sample)}
      title="Score Differences by Measure"
      subtitle={`${report.contract.contractId} · ${part} · Plan preview vs published Stars ${baselineYear} scores`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      sample={sample}
    >
      <ReportSection
        title={`${part} measure scores`}
        note={`Numeric plan preview score vs published CMS score for Stars ${baselineYear}, with predicted star ratings for context. Sorted by measure code.`}
        style={{ marginTop: 12 }}
      >
        <div
          className="fep-report-panel"
          style={{ padding: "4px 0 2px", overflow: "hidden" }}
        >
          <table
            className="fep-report-table compact"
            style={{
              fontSize: 9,
              width: "100%",
              tableLayout: "fixed",
            }}
          >
            <colgroup>
              <col />
              <col style={{ width: "5%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="l" style={{ paddingBottom: 3, fontSize: 7.5 }}>
                  Measure
                </th>
                <th style={{ paddingBottom: 3, fontSize: 7.5 }}>Wt</th>
                <th style={{ paddingBottom: 3, fontSize: 7.5 }}>
                  {baselineYear} score
                </th>
                <th style={{ paddingBottom: 3, fontSize: 7.5 }}>PP1 score</th>
                <th style={{ paddingBottom: 3, fontSize: 7.5 }}>Δ</th>
                <th style={{ paddingBottom: 3, fontSize: 7.5 }}>
                  {baselineYear} ★
                </th>
                <th style={{ paddingBottom: 3, fontSize: 7.5 }}>
                  {report.starsYear} ★
                </th>
                <th style={{ paddingBottom: 3, fontSize: 7.5 }}>Upside</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    className="l"
                    colSpan={8}
                    style={{ color: "var(--fep-faint)" }}
                  >
                    No accrued {part} measures to compare.
                  </td>
                </tr>
              ) : (
                rows.map((measure) => {
                  const scoreDelta =
                    measure.publishedBaselineScore !== null
                      ? Math.round(
                          (measure.score - measure.publishedBaselineScore) *
                            100,
                        ) / 100
                      : null;
                  const deltaImproved =
                    scoreDelta !== null &&
                    scoreDelta !== 0 &&
                    isScoreDeltaImprovement(scoreDelta, measure.inverted);
                  return (
                    <tr key={measure.measureCode}>
                      <td
                        className="l"
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          paddingTop: 1,
                          paddingBottom: 1,
                          fontSize: 8.5,
                          lineHeight: 1.15,
                        }}
                      >
                        <span
                          style={{ fontWeight: 700, color: "var(--fep-ink)" }}
                        >
                          {measure.measureCode}
                        </span>{" "}
                        <span style={{ color: "var(--fep-muted)" }}>
                          {measure.displayName}
                        </span>
                        {measure.outlook?.cutPressure ? (
                          <span
                            className="fep-report-pill"
                            style={{
                              marginLeft: 3,
                              textTransform: "none",
                              fontSize: 7,
                              padding: "0 4px",
                              color: REPORT_COLORS.accent,
                            }}
                          >
                            Cut pressure
                          </span>
                        ) : null}
                      </td>
                      <td style={{ paddingTop: 1, paddingBottom: 1 }}>
                        {measure.weight}
                      </td>
                      <td style={{ paddingTop: 1, paddingBottom: 1 }}>
                        {formatMeasureScore(measure.publishedBaselineScore)}
                      </td>
                      <td
                        style={{
                          fontWeight: 700,
                          color: "var(--fep-ink)",
                          paddingTop: 1,
                          paddingBottom: 1,
                        }}
                      >
                        {formatMeasureScore(measure.score)}
                      </td>
                      <td
                        style={{
                          fontWeight: 800,
                          paddingTop: 1,
                          paddingBottom: 1,
                          color:
                            scoreDelta === null || scoreDelta === 0
                              ? "var(--fep-faint)"
                              : deltaImproved
                                ? REPORT_COLORS.positive
                                : REPORT_COLORS.negative,
                        }}
                      >
                        {scoreDelta === null
                          ? "—"
                          : formatSigned(
                              scoreDelta,
                              scoreDelta % 1 === 0 ? 0 : 2,
                            )}
                      </td>
                      <td style={{ paddingTop: 1, paddingBottom: 1 }}>
                        {formatStars(measure.publishedBaselineStar, 0)}★
                      </td>
                      <td
                        style={{
                          fontWeight: 800,
                          color: "var(--fep-ink)",
                          paddingTop: 1,
                          paddingBottom: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatStars(measure.predictedStar, 0)}★
                        {(() => {
                          const label = formatCahpsStarSourceLabel(
                            measure.starSource,
                            measure.baseGroupStar,
                            measure.predictedStar,
                          );
                          if (!label) return null;
                          return (
                            <span
                              className="fep-report-pill"
                              style={{
                                marginLeft: 3,
                                textTransform: "none",
                                fontSize: 7,
                                padding: "0 4px",
                              }}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                      <td
                        style={{
                          paddingTop: 1,
                          paddingBottom: 1,
                          whiteSpace: "nowrap",
                          fontWeight: measure.outlook?.hasUpside ? 800 : 600,
                          color: measure.outlook?.hasUpside
                            ? REPORT_COLORS.positive
                            : "var(--fep-faint)",
                          fontSize: 8,
                        }}
                      >
                        {formatMeasureUpside(measure.outlook)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 5 }}>
          Published scores come from CMS measure data for Stars {baselineYear}.
          Plan preview scores are the accrued PP1 values. CAHPS stars use the
          plan&apos;s PP1 CAHPS Star Rating when uploaded; otherwise official cut
          points. When Star Rating differs from Base Group, Base → Star is shown.
          Upside is the star path if cuts ease within historical methodology
          error (base → upside).
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
