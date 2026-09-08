"use client";

import type { ResultsMeasure } from "@/lib/plan-preview/results-report-data";

import {
  RatingTrendChart,
  type RatingTrendPoint,
} from "../plan-preview-report/report-charts";
import {
  MeasureLabel,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  deltaColor,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

import { PP2_PRODUCT_LABEL, type ResultsPageProps } from "./results-shared";

const CELL = { paddingTop: 2, paddingBottom: 2 } as const;

function changedMeasures(
  measures: ResultsMeasure[],
): (ResultsMeasure & { delta: number })[] {
  return measures
    .filter(
      (measure) =>
        measure.star !== null && measure.publishedBaselineStar !== null,
    )
    .map((measure) => ({
      ...measure,
      delta:
        (measure.star as number) - (measure.publishedBaselineStar as number),
    }))
    .filter((measure) => measure.delta !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.delta) - Math.abs(left.delta) ||
        right.weight - left.weight ||
        left.measureDisplayName.localeCompare(right.measureDisplayName),
    );
}

export function ResultsYoyPage({
  report,
  pageNumber,
  totalPages,
}: ResultsPageProps) {
  const baselineYear = report.baselineYear ?? "—";
  const chartData: RatingTrendPoint[] = [
    ...report.history.map((point) => ({
      year: String(point.year),
      overall: point.overall,
      partC: point.partC,
      partD: point.partD,
      highlight: false,
    })),
    {
      year: `${report.starsYear} (official)`,
      overall: report.overall?.finalRating ?? null,
      partC: report.partC?.finalRating ?? null,
      partD: report.partD?.finalRating ?? null,
      highlight: true,
    },
  ];

  const { declined, held, improved, newOrUnrated } = report.yoySummary;
  const movers = changedMeasures(report.measures);

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Year-over-Year Performance"
      subtitle={`${report.contract.contractId} · Published CMS ratings history with the official Stars ${report.starsYear} result`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PP2_PRODUCT_LABEL}
    >
      <ReportSection
        title="Overall Rating Trend"
        note={`Published Overall, Part C, and Part D summary ratings by star year; the final points are the official Stars ${report.starsYear} Overall / Part C / Part D ratings from Plan Preview 2.`}
        style={{ marginTop: 12 }}
      >
        <div className="fep-report-panel" style={{ padding: "6px 8px 0" }}>
          <RatingTrendChart data={chartData} />
        </div>
      </ReportSection>

      <ReportSection
        title="Star rating change by measure"
        note={`Official Stars ${report.starsYear} vs published Stars ${baselineYear}. All measures that changed are listed below.`}
        style={{ marginTop: 10 }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <ReportStat
            label="Declined"
            value={declined}
            detail="Official below published"
          />
          <ReportStat
            label="Held"
            value={held}
            detail="Official equals published"
          />
          <ReportStat
            label="Improved"
            value={improved}
            detail="Official above published"
          />
          <ReportStat
            label="New / unrated"
            value={newOrUnrated}
            detail="No comparison available"
          />
        </div>

        <div
          className="fep-report-panel"
          style={{ marginTop: 8, padding: "6px 0 2px" }}
        >
          <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
            <thead>
              <tr>
                <th className="l">Measures that changed</th>
                <th>Weight</th>
                <th>Stars {baselineYear} (published)</th>
                <th>Stars {report.starsYear} (official)</th>
                <th>PP1 predicted</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {movers.length === 0 ? (
                <tr>
                  <td
                    className="l"
                    colSpan={6}
                    style={{ color: "var(--fep-faint)" }}
                  >
                    No rated measures moved versus the published baseline.
                  </td>
                </tr>
              ) : (
                movers.map((measure) => (
                  <tr key={measure.measureCode}>
                    <td
                      className="l"
                      style={{
                        ...CELL,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 280,
                        fontSize: 9,
                        lineHeight: 1.2,
                      }}
                    >
                      <MeasureLabel
                        code={measure.measureCode}
                        name={measure.measureDisplayName}
                      />
                    </td>
                    <td style={CELL}>{measure.weight}</td>
                    <td style={CELL}>
                      {formatStars(measure.publishedBaselineStar, 0)}★
                    </td>
                    <td
                      style={{
                        ...CELL,
                        fontWeight: 800,
                        color: "var(--fep-ink)",
                      }}
                    >
                      {formatStars(measure.star, 0)}★
                    </td>
                    <td
                      style={{
                        ...CELL,
                        color:
                          measure.pp1PredictedStar === null
                            ? "var(--fep-faint)"
                            : undefined,
                      }}
                    >
                      {measure.pp1PredictedStar === null
                        ? "—"
                        : `${formatStars(measure.pp1PredictedStar, 0)}★`}
                    </td>
                    <td
                      style={{
                        ...CELL,
                        fontWeight: 800,
                        color: deltaColor(measure.delta),
                      }}
                    >
                      {measure.delta > 0 ? "+" : ""}
                      {measure.delta}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 4 }}>
          Movement reflects score change and official cut point movement.
          Showing all {movers.length} measures that changed. PP1 predicted is
          the Plan Preview 1 star projected for the same measure when PP1 scores
          were accrued; see the prediction accuracy page for the full
          comparison.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
