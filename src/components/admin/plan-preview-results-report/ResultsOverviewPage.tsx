"use client";

import { StarDistributionChart } from "../plan-preview-report/report-charts";
import {
  BuildupRow,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  StarGlyphs,
  formatScore,
  formatSigned,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

import { PP2_PRODUCT_LABEL, type ResultsPageProps } from "./results-shared";

function formatPercentile(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `P${Math.round(value)}`;
}

export function ResultsOverviewPage({
  report,
  pageNumber,
  totalPages,
  sample,
}: ResultsPageProps) {
  const overall = report.overall;
  const thresholds = report.rewardFactorThresholds;
  const ratedCount = report.measures.filter((m) => m.star !== null).length;

  const disaster =
    overall?.disasterPct1 || overall?.disasterPct2
      ? [
          overall.disasterYear1 && overall.disasterPct1
            ? `${overall.disasterYear1} ${formatScore(overall.disasterPct1, 0)}%`
            : null,
          overall.disasterYear2 && overall.disasterPct2
            ? `${overall.disasterYear2} ${formatScore(overall.disasterPct2, 0)}%`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  const contractLine = [
    report.contract.contractId,
    report.contract.parentOrganization,
    overall?.contractType,
    overall?.snpPlans ? `SNP: ${overall.snpPlans}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear, sample)}
      title={report.contract.contractName ?? report.contract.contractId}
      subtitle={contractLine}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PP2_PRODUCT_LABEL}
      sample={sample}
    >
      <ReportSection
        title="Official Overall Rating"
        note={`Published Stars ${report.starsYear} summary ratings from the Plan Preview 2 release. Overall combines the calculated mean, reward factor, and CAI exactly as CMS reports them; Part C and Part D carry their own summary ratings.`}
      >
        <div style={{ display: "flex", gap: 14 }}>
          <div
            className="fep-report-panel"
            style={{
              flex: "0 0 268px",
              padding: "22px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(150deg, #eef2f9, #fffdf8 70%)",
            }}
          >
            <p className="fep-label" style={{ fontSize: 9 }}>
              Official Stars {report.starsYear} Overall
            </p>
            <p
              style={{
                margin: "8px 0 4px",
                fontSize: 54,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                color: REPORT_COLORS.accent,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatStars(overall?.finalRating)}
            </p>
            <StarGlyphs value={overall?.finalRating ?? null} size={19} />
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--fep-muted)",
              }}
            >
              Final summary {formatScore(overall?.finalSummary)}
            </p>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 9.5,
                fontWeight: 700,
                color: "var(--fep-faint)",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {`Part C ${formatStars(report.partC?.finalRating)} · Part D ${formatStars(report.partD?.finalRating)}`}
            </p>
          </div>

          <div
            className="fep-report-panel"
            style={{ flex: 1, padding: "14px 18px 10px" }}
          >
            <p className="fep-label" style={{ fontSize: 8.5, marginBottom: 4 }}>
              Score buildup
              <span
                className="fep-report-pill"
                style={{ marginLeft: 8, textTransform: "none" }}
              >
                Published
              </span>
            </p>
            <BuildupRow
              label={`Calculated mean (${overall?.measuresRated ?? ratedCount} measures, weighted)`}
              value={formatScore(overall?.calculatedMean)}
            />
            <BuildupRow
              label="Reward factor"
              value={formatSigned(overall?.rewardFactor, 1)}
            />
            <BuildupRow
              label="CAI adjustment"
              value={formatSigned(overall?.caiValue, 3)}
            />
            <BuildupRow
              label="Final summary (unrounded)"
              value={formatScore(overall?.finalSummary)}
              emphasis
            />
            <BuildupRow
              label="Published rating (rounded to half star)"
              value={`${formatStars(overall?.finalRating)}★`}
              emphasis
            />
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 9,
                color: "var(--fep-faint)",
              }}
            >
              Values are read directly from the CMS summary rating file.
              Contract mean at {formatPercentile(overall?.scorePercentileRank)}{" "}
              and variance at {formatPercentile(overall?.variancePercentileRank)}{" "}
              of the MA-PD population. Improvement measures used:{" "}
              {overall?.improvementUsage ?? "—"}
              {overall?.newMeasureUsage
                ? `; new measures used: ${overall.newMeasureUsage}`
                : ""}
              .{disaster ? ` Disaster-affected enrollment ${disaster}.` : ""}
            </p>
          </div>
        </div>
      </ReportSection>

      <ReportSection
        title="Published Inputs"
        note={
          thresholds
            ? `Official Stars ${report.starsYear} Overall MA-PD reward-factor thresholds from the CMS Technical Notes (${thresholds.improvementIncluded ? "with" : "without"} improvement measures, ${thresholds.newMeasuresIncluded ? "with" : "without"} new measures).`
            : undefined
        }
        style={{ marginTop: 12 }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <ReportStat
            label="Measures rated"
            value={overall?.measuresRated ?? ratedCount}
            detail={
              overall?.measuresMissing != null && overall.measuresMissing > 0
                ? `${overall.measuresRequired ? `${overall.measuresRequired} required; ` : ""}${overall.measuresMissing} missing`
                : undefined
            }
          />
          <ReportStat
            label="Reward factor"
            value={formatSigned(overall?.rewardFactor, 1)}
            detail={
              thresholds
                ? `Mean P65 ${thresholds.mean65th.toFixed(3)} / P85 ${thresholds.mean85th.toFixed(3)}`
                : "Thresholds unavailable"
            }
          />
          <ReportStat
            label="Weighted variance"
            value={formatScore(overall?.calculatedVariance)}
            detail={
              thresholds
                ? `Var P30 ${thresholds.variance30th.toFixed(3)} / P70 ${thresholds.variance70th.toFixed(3)}`
                : overall?.varianceCategory
                  ? `${overall.varianceCategory} variance`
                  : undefined
            }
          />
          <ReportStat
            label="CAI adjustment"
            value={formatSigned(overall?.caiValue, 3)}
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Official Measure Star Distribution"
        note="Count of measures at each whole-star rating in the published Plan Preview 2 star file."
        style={{ marginTop: 12 }}
      >
        <div className="fep-report-panel" style={{ padding: "12px 10px 4px" }}>
          <StarDistributionChart
            stars={report.measures.map((measure) => measure.star)}
          />
        </div>
      </ReportSection>

      {!overall ? (
        <p className="fep-banner-error" style={{ marginTop: 14, fontSize: 11 }}>
          No Overall summary rating was uploaded for this contract. Upload the
          PP2 summary rating file to complete the score buildup.
        </p>
      ) : null}
    </ReportPageFrame>
  );
}
