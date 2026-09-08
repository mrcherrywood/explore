"use client";

import type { ResultsAccuracyRow } from "@/lib/plan-preview/results-report-data";

import {
  CountBarChart,
  type CountBar,
} from "../plan-preview-report/report-charts";
import {
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  deltaColor,
  formatSigned,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

import {
  PP2_PRODUCT_LABEL,
  type ResultsPageProps,
  weightByMeasureCode,
} from "./results-shared";

const MAX_ROWS = 16;
const CELL = { paddingTop: 2, paddingBottom: 2 } as const;

/** Official − predicted star buckets, clamped to ±2. */
function deltaDistribution(rows: ResultsAccuracyRow[]): CountBar[] {
  const buckets: { key: number; label: string; fill: string }[] = [
    { key: -2, label: "≤ −2★", fill: REPORT_COLORS.negative },
    { key: -1, label: "−1★", fill: REPORT_COLORS.accentSoft },
    { key: 0, label: "Exact", fill: REPORT_COLORS.accent },
    { key: 1, label: "+1★", fill: REPORT_COLORS.accentSoft },
    { key: 2, label: "≥ +2★", fill: REPORT_COLORS.positive },
  ];
  return buckets.map((bucket) => ({
    label: bucket.label,
    fill: bucket.fill,
    count: rows.filter((row) => {
      if (row.delta === null) return false;
      const clamped = Math.max(-2, Math.min(2, row.delta));
      return clamped === bucket.key;
    }).length,
  }));
}

function percent(numerator: number, denominator: number): string {
  return denominator > 0
    ? `${Math.round((numerator / denominator) * 100)}% of compared measures`
    : "No PP1 predictions to compare";
}

export function ResultsAccuracyPage({
  report,
  pageNumber,
  totalPages,
}: ResultsPageProps) {
  const { accuracy, accuracySummary } = report;
  const weights = weightByMeasureCode(report);
  const compared = accuracy.filter((row) => row.delta !== null);
  const meanAbsError =
    compared.length > 0
      ? compared.reduce((sum, row) => sum + Math.abs(row.delta ?? 0), 0) /
        compared.length
      : null;
  const misses = compared
    .filter((row) => row.delta !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0) ||
        (weights.get(right.measureCode.toUpperCase()) ?? 0) -
          (weights.get(left.measureCode.toUpperCase()) ?? 0) ||
        left.displayName.localeCompare(right.displayName),
    );
  const visible = misses.slice(0, MAX_ROWS);
  const hidden = misses.length - visible.length;

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="PP1 Prediction vs Official"
      subtitle={`${report.contract.contractId} · Plan Preview 1 predicted measure stars versus published Plan Preview 2 stars`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PP2_PRODUCT_LABEL}
    >
      <ReportSection
        title="Prediction accuracy"
        note={`How the conservative Plan Preview 1 projection for Stars ${report.starsYear} compared with the official stars once CMS published cut points.`}
        style={{ marginTop: 12 }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <ReportStat
            label="Exact match"
            value={
              accuracySummary.compared > 0
                ? `${accuracySummary.exact}/${accuracySummary.compared}`
                : "—"
            }
            detail={percent(accuracySummary.exact, accuracySummary.compared)}
          />
          <ReportStat
            label="Within 1 star"
            value={
              accuracySummary.compared > 0
                ? `${accuracySummary.withinOne}/${accuracySummary.compared}`
                : "—"
            }
            detail={percent(
              accuracySummary.withinOne,
              accuracySummary.compared,
            )}
          />
          <ReportStat
            label="Mean abs. error"
            value={meanAbsError === null ? "—" : meanAbsError.toFixed(2)}
            detail="Stars per compared measure"
          />
          <ReportStat
            label="Overall rating"
            value={`${formatStars(accuracySummary.overallPredicted)} → ${formatStars(accuracySummary.overallOfficial)}`}
            detail={
              accuracySummary.overallInEnvelope === null
                ? "No PP1 overall prediction"
                : accuracySummary.overallInEnvelope
                  ? "Inside base → upside envelope"
                  : "Outside base → upside envelope"
            }
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Official minus predicted star"
        note="Positive buckets mean the official star beat the PP1 projection; negative buckets mean the projection was too optimistic."
        style={{ marginTop: 12 }}
      >
        <div className="fep-report-panel" style={{ padding: "12px 10px 4px" }}>
          <CountBarChart data={deltaDistribution(accuracy)} height={150} />
        </div>
      </ReportSection>

      <ReportSection
        title="Measures that differed"
        note="Sorted by size of miss, then measure weight."
        style={{ marginTop: 12 }}
      >
        <div className="fep-report-panel" style={{ padding: "6px 0 2px" }}>
          <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
            <thead>
              <tr>
                <th className="l">Measure</th>
                <th>Weight</th>
                <th>PP1 predicted</th>
                <th>Official</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    className="l"
                    colSpan={5}
                    style={{ color: "var(--fep-faint)" }}
                  >
                    {accuracySummary.compared === 0
                      ? "No PP1 predicted stars are available for this contract."
                      : "Every compared measure matched the official star."}
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={row.measureCode}>
                    <td
                      className="l"
                      style={{
                        ...CELL,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: 300,
                        fontSize: 9,
                        lineHeight: 1.2,
                      }}
                    >
                      <MeasureLabel
                        code={row.measureCode}
                        name={row.displayName}
                      />
                    </td>
                    <td style={CELL}>
                      {weights.get(row.measureCode.toUpperCase()) ?? "—"}
                    </td>
                    <td style={CELL}>{formatStars(row.predictedStar, 0)}★</td>
                    <td
                      style={{
                        ...CELL,
                        fontWeight: 800,
                        color: "var(--fep-ink)",
                      }}
                    >
                      {formatStars(row.officialStar, 0)}★
                    </td>
                    <td
                      style={{
                        ...CELL,
                        fontWeight: 800,
                        color: deltaColor(row.delta),
                      }}
                    >
                      {formatSigned(row.delta, 0)}
                    </td>
                  </tr>
                ))
              )}
              {hidden > 0 ? (
                <tr>
                  <td
                    className="l"
                    colSpan={5}
                    style={{ color: "var(--fep-faint)" }}
                  >
                    +{hidden} more measure{hidden === 1 ? "" : "s"} with
                    smaller misses.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportSection>
    </ReportPageFrame>
  );
}
