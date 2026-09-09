"use client";

import { isInvertedMeasure } from "@/lib/percentile-analysis/inverted-measure";
import type { ResultsMeasure } from "@/lib/plan-preview/results-report-data";
import { isScoreDeltaImprovement } from "@/lib/plan-preview/score-delta-direction";

import {
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  deltaColor,
  formatSigned,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

import {
  PP2_PRODUCT_LABEL,
  type ResultsMeasurePart,
  type ResultsPageProps,
  compareMeasureCodes,
  resultsMeasurePart,
} from "./results-shared";

const CELL = { paddingTop: 1, paddingBottom: 1 } as const;
const HEAD = { paddingBottom: 3, fontSize: 7.5 } as const;

function formatMeasureScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Number.isInteger(value)) return value.toFixed(0);
  if (Math.abs(value) < 1) return value.toFixed(2);
  return value.toFixed(1);
}

function starCell(value: number | null): string {
  return value === null ? "—" : `${formatStars(value, 0)}★`;
}

/** One page per part (Part C, then Part D), sorted by measure code. */
export function chunkOfficialMeasuresByPart(measures: ResultsMeasure[]): {
  part: ResultsMeasurePart;
  rows: ResultsMeasure[];
}[] {
  const byPart = (part: ResultsMeasurePart) =>
    measures
      .filter((measure) => resultsMeasurePart(measure.measureCode) === part)
      .sort((left, right) =>
        compareMeasureCodes(left.measureCode, right.measureCode),
      );
  const partC = byPart("Part C");
  const partD = byPart("Part D");
  const chunks: { part: ResultsMeasurePart; rows: ResultsMeasure[] }[] = [];
  if (partC.length > 0) chunks.push({ part: "Part C", rows: partC });
  if (partD.length > 0) chunks.push({ part: "Part D", rows: partD });
  return chunks.length > 0 ? chunks : [{ part: "Part C", rows: [] }];
}

export function ResultsMeasureScoresPage({
  report,
  part,
  rows,
  pageNumber,
  totalPages,
}: ResultsPageProps & { part: ResultsMeasurePart; rows: ResultsMeasure[] }) {
  const baselineYear = report.baselineYear ?? "—";

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Score Differences by Measure"
      subtitle={`${report.contract.contractId} · ${part} · Official Stars ${report.starsYear} scores vs published Stars ${baselineYear}`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PP2_PRODUCT_LABEL}
    >
      <ReportSection
        title={`${part} measure scores`}
        note={`Official Stars ${report.starsYear} score and star vs published CMS for Stars ${baselineYear}. Sorted by measure code.`}
        style={{ marginTop: 12 }}
      >
        <div
          className="fep-report-panel"
          style={{ padding: "4px 0 2px", overflow: "hidden" }}
        >
          <table
            className="fep-report-table compact"
            style={{ fontSize: 9, width: "100%", tableLayout: "fixed" }}
          >
            <colgroup>
              <col />
              <col style={{ width: "6%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="l" style={HEAD}>
                  Measure
                </th>
                <th style={HEAD}>Wt</th>
                <th style={HEAD}>{baselineYear} score</th>
                <th style={HEAD}>{report.starsYear} score</th>
                <th style={HEAD}>Δ</th>
                <th style={HEAD}>{baselineYear} ★</th>
                <th style={HEAD}>{report.starsYear} ★</th>
                <th style={HEAD}>Δ★</th>
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
                    No official {part} measures to compare.
                  </td>
                </tr>
              ) : (
                rows.map((measure) => {
                  const scoreDelta =
                    measure.pp1Score !== null &&
                    measure.publishedBaselineScore !== null
                      ? Math.round(
                          (measure.pp1Score - measure.publishedBaselineScore) *
                            100,
                        ) / 100
                      : null;
                  const deltaImproved =
                    scoreDelta !== null &&
                    scoreDelta !== 0 &&
                    isScoreDeltaImprovement(
                      scoreDelta,
                      measure.inverted ??
                        isInvertedMeasure(measure.measureDisplayName),
                    );
                  const starDelta =
                    measure.star !== null &&
                    measure.publishedBaselineStar !== null
                      ? measure.star - measure.publishedBaselineStar
                      : null;
                  return (
                    <tr key={measure.measureCode}>
                      <td
                        className="l"
                        style={{
                          ...CELL,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: 8.5,
                          lineHeight: 1.15,
                        }}
                      >
                        <MeasureLabel
                          code={measure.measureCode}
                          name={measure.measureDisplayName}
                        />
                      </td>
                      <td style={CELL}>{measure.weight}</td>
                      <td style={CELL}>
                        {formatMeasureScore(measure.publishedBaselineScore)}
                      </td>
                      <td
                        style={{
                          ...CELL,
                          fontWeight: 700,
                          color: "var(--fep-ink)",
                        }}
                      >
                        {formatMeasureScore(measure.pp1Score)}
                      </td>
                      <td
                        style={{
                          ...CELL,
                          fontWeight: 800,
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
                      <td style={CELL}>
                        {starCell(measure.publishedBaselineStar)}
                      </td>
                      <td
                        style={{
                          ...CELL,
                          fontWeight: 800,
                          color: "var(--fep-ink)",
                        }}
                      >
                        {starCell(measure.star)}
                      </td>
                      <td
                        style={{
                          ...CELL,
                          fontWeight: 800,
                          color: deltaColor(starDelta),
                        }}
                      >
                        {starDelta === null ? "—" : formatSigned(starDelta, 0)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 5 }}>
          {baselineYear} scores come from published CMS measure data.{" "}
          {report.starsYear} scores are the plan preview rates CMS used for the
          official stars (Plan Preview 2 does not republish a separate score
          file). Score Δ is colored by whether the change is an improvement
          (lower is better for inverted measures such as Complaints). Δ★
          compares the official Stars {report.starsYear} star with Stars{" "}
          {baselineYear}.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
