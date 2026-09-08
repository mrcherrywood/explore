"use client";

import type { RiskOpportunityRow } from "@/lib/plan-preview/risk-opportunity";

import {
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  formatScore,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

import { PP2_PRODUCT_LABEL, type ResultsPageProps } from "./results-shared";

const MAX_ROWS = 10;
const CELL = { paddingTop: 2, paddingBottom: 2 } as const;

function sumWeights(rows: RiskOpportunityRow[]): number {
  return rows.reduce((total, row) => total + row.weight, 0);
}

function ProximityTable({
  rows,
  empty,
  cutLabel,
  gapColor,
}: {
  rows: RiskOpportunityRow[];
  empty: string;
  cutLabel: string;
  gapColor: string;
}) {
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;
  return (
    <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
      <thead>
        <tr>
          <th className="l">Measure</th>
          <th>Weight</th>
          <th>Official star</th>
          <th>Score</th>
          <th>{cutLabel}</th>
          <th>Gap</th>
        </tr>
      </thead>
      <tbody>
        {visible.length === 0 ? (
          <tr>
            <td className="l" colSpan={6} style={{ color: "var(--fep-faint)" }}>
              {empty}
            </td>
          </tr>
        ) : (
          visible.map((row) => {
            const digits = row.inverted ? 2 : 1;
            return (
              <tr key={`${row.kind}-${row.measureCode}`}>
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
                  <MeasureLabel code={row.measureCode} name={row.displayName} />
                </td>
                <td style={CELL}>{row.weight}</td>
                <td style={{ ...CELL, fontWeight: 800, color: "var(--fep-ink)" }}>
                  {formatStars(row.officialStar, 0)}★
                </td>
                <td style={{ ...CELL, fontWeight: 700, color: "var(--fep-ink)" }}>
                  {formatScore(row.score, digits)}
                </td>
                <td style={CELL}>{formatScore(row.cut, digits)}</td>
                <td style={{ ...CELL, fontWeight: 800, color: gapColor }}>
                  {formatScore(row.gap, digits)}
                </td>
              </tr>
            );
          })
        )}
        {hidden > 0 ? (
          <tr>
            <td className="l" colSpan={6} style={{ color: "var(--fep-faint)" }}>
              +{hidden} more measure{hidden === 1 ? "" : "s"} within the close
              threshold.
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function ResultsRiskOpportunityPage({
  report,
  pageNumber,
  totalPages,
}: ResultsPageProps) {
  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Risk and Opportunity"
      subtitle={`${report.contract.contractId} · Plan preview scores against official Stars ${report.starsYear} cut points`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PP2_PRODUCT_LABEL}
    >
      <ReportSection
        title="Measures near a cut point"
        note="Close means within 2 points of the cut for standard measures, 1 point for CAHPS, and 0.05 for inverted measures such as Complaints. Weight totals show how much of the summary rating sits near a threshold."
        style={{ marginTop: 12 }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <ReportStat
            label="Risk measures"
            value={report.risk.length}
            detail="Just above the cut that awarded the star"
          />
          <ReportStat
            label="Risk weight"
            value={sumWeights(report.risk)}
            detail="Total measure weight at risk"
          />
          <ReportStat
            label="Opportunity measures"
            value={report.opportunity.length}
            detail="Just below the next-star cut"
          />
          <ReportStat
            label="Opportunity weight"
            value={sumWeights(report.opportunity)}
            detail="Total measure weight within reach"
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Risk"
        note="A small score drop, or a slightly harder cut next year, would lose a star on these measures."
        style={{ marginTop: 12 }}
      >
        <div
          className="fep-report-panel"
          style={{ padding: "6px 0 2px", borderColor: REPORT_COLORS.negative }}
        >
          <ProximityTable
            rows={report.risk}
            cutLabel="Lower cut"
            gapColor={REPORT_COLORS.negative}
            empty="No rated measures sit close to the lower official cut."
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Opportunity"
        note="A small score gain, or a slightly easier cut next year, would earn another star on these measures."
        style={{ marginTop: 12 }}
      >
        <div
          className="fep-report-panel"
          style={{ padding: "6px 0 2px", borderColor: REPORT_COLORS.positive }}
        >
          <ProximityTable
            rows={report.opportunity}
            cutLabel="Next cut"
            gapColor={REPORT_COLORS.positive}
            empty="No rated measures sit close to the next official cut."
          />
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 6 }}>
          Scores are the accrued Plan Preview 1 values behind each official
          star; cut points are the Stars {report.starsYear} thresholds from
          the CMS Technical Notes. Gap is the distance between the score and
          the named cut in the measure&apos;s own units.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
