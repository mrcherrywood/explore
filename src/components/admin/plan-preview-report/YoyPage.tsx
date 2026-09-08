"use client";

import type { Ref } from "react";

import type {
  PlanPreviewContractReport,
  ReportMeasure,
} from "@/lib/plan-preview/report-data";

import { RatingTrendChart, type RatingTrendPoint } from "./report-charts";
import {
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  deltaColor,
  formatCahpsStarSourceLabel,
  formatMeasureUpside,
  formatStars,
  reportEyebrow,
} from "./report-shared";

function changedMeasures(
  measures: ReportMeasure[],
): (ReportMeasure & { delta: number })[] {
  return measures
    .filter(
      (measure) =>
        measure.predictedStar !== null &&
        measure.publishedBaselineStar !== null,
    )
    .map((measure) => ({
      ...measure,
      delta:
        (measure.predictedStar as number) -
        (measure.publishedBaselineStar as number),
    }))
    .filter((measure) => measure.delta !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.delta) - Math.abs(left.delta) ||
        right.weight - left.weight ||
        left.displayName.localeCompare(right.displayName),
    );
}

export function YoyPage({
  report,
  pageNumber,
  totalPages,
  pageRef,
  sample,
}: {
  report: PlanPreviewContractReport;
  pageNumber: number;
  totalPages: number;
  pageRef?: Ref<HTMLDivElement>;
  sample?: boolean;
}) {
  const baseline = report.scenarios.find(
    (scenario) => scenario.id === "baseline",
  );
  const predictedRating = baseline?.score?.finalRating ?? null;
  const predictedPartC = baseline?.score?.partCFinalRating ?? null;
  const predictedPartD = baseline?.score?.partDFinalRating ?? null;

  const chartData: RatingTrendPoint[] = [
    ...report.history.map((point) => ({
      year: String(point.year),
      overall: point.overall,
      partC: point.partC,
      partD: point.partD,
      highlight: false,
    })),
    {
      year: `${report.starsYear} (proj.)`,
      overall: predictedRating,
      partC: predictedPartC,
      partD: predictedPartD,
      highlight: true,
    },
  ];

  const { declined, held, improved, newOrUnrated } = report.yoySummary;
  const movers = changedMeasures(report.measures);

  return (
    <ReportPageFrame
      pageRef={pageRef}
      eyebrow={reportEyebrow(report.starsYear, sample)}
      title="Year-over-Year Performance"
      subtitle={`${report.contract.contractId} · Published CMS ratings history with the Stars ${report.starsYear} projection`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      sample={sample}
    >
      <ReportSection
        title="Overall Rating Trend"
        note={`Published Overall, Part C, and Part D summary ratings by star year; the final points are this report's projected Stars ${report.starsYear} Overall / Part C / Part D ratings.`}
        style={{ marginTop: 12 }}
      >
        <div className="fep-report-panel" style={{ padding: "6px 8px 0" }}>
          <RatingTrendChart data={chartData} />
        </div>
      </ReportSection>

      <ReportSection
        title="Star rating change by measure"
        note={`Predicted Stars ${report.starsYear} vs published Stars ${report.baselineYear ?? "—"}. All measures that changed are listed below.`}
        style={{ marginTop: 10 }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <ReportStat
            label="Declined"
            value={declined}
            detail="Predicted below published"
          />
          <ReportStat
            label="Held"
            value={held}
            detail="Predicted equals published"
          />
          <ReportStat
            label="Improved"
            value={improved}
            detail="Predicted above published"
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
                <th>Stars {report.baselineYear ?? "—"} (published)</th>
                <th>Stars {report.starsYear} (predicted)</th>
                <th>Upside</th>
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
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 260,
                        paddingTop: 2,
                        paddingBottom: 2,
                        fontSize: 9,
                        lineHeight: 1.2,
                      }}
                    >
                      <MeasureLabel
                        code={measure.measureCode}
                        name={measure.displayName}
                      />
                      {measure.outlook?.cutPressure ? (
                        <span
                          className="fep-report-pill"
                          style={{
                            marginLeft: 4,
                            textTransform: "none",
                            fontSize: 7.5,
                            padding: "0 5px",
                            color: REPORT_COLORS.accent,
                            borderColor: REPORT_COLORS.band,
                          }}
                        >
                          Cut pressure
                        </span>
                      ) : null}
                    </td>
                    <td style={{ paddingTop: 2, paddingBottom: 2 }}>
                      {measure.weight}
                    </td>
                    <td style={{ paddingTop: 2, paddingBottom: 2 }}>
                      {formatStars(measure.publishedBaselineStar, 0)}★
                    </td>
                    <td
                      style={{
                        fontWeight: 800,
                        color: "var(--fep-ink)",
                        whiteSpace: "nowrap",
                        paddingTop: 2,
                        paddingBottom: 2,
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
                              marginLeft: 4,
                              textTransform: "none",
                              fontSize: 8,
                              padding: "0 5px",
                            }}
                          >
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td
                      style={{
                        paddingTop: 2,
                        paddingBottom: 2,
                        whiteSpace: "nowrap",
                        fontWeight: measure.outlook?.hasUpside ? 800 : 600,
                        color: measure.outlook?.hasUpside
                          ? REPORT_COLORS.positive
                          : "var(--fep-faint)",
                        fontSize: 9,
                      }}
                    >
                      {formatMeasureUpside(measure.outlook)}
                    </td>
                    <td
                      style={{
                        fontWeight: 800,
                        paddingTop: 2,
                        paddingBottom: 2,
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
          Movement reflects score change and projected cut point movement.
          Showing all {movers.length} measures that changed. CAHPS use the
          plan&apos;s PP1 Star Rating when uploaded; Base → Star marks measures
          adjusted off their Base Group. CMS data issue marks measures with no
          score that CMS assigned 1 star. Base case uses our conservative
          cut-point forecast. Upside eases cuts by each measure&apos;s
          historical methodology error. Cut pressure marks score improvement
          with a predicted star drop.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
