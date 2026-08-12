"use client";

import type { Ref } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import type { PlanPreviewContractReport } from "@/lib/plan-preview/report-data";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  ReportStat,
  StarGlyphs,
  formatScore,
  formatSigned,
  formatStars,
  reportEyebrow,
} from "./report-shared";

function BuildupRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "7px 0",
        borderTop: "1px solid var(--fep-row-border)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: emphasis ? 800 : 600,
          color: emphasis ? "var(--fep-ink)" : "var(--fep-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: emphasis ? 15 : 12,
          fontWeight: emphasis ? 800 : 700,
          color: "var(--fep-ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function OverviewPage({
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
  const score = baseline?.score ?? null;
  const leg =
    score?.selectedLeg === "with_qi"
      ? score.withQi
      : score?.selectedLeg === "without_qi"
        ? score.withoutQi
        : null;
  const thresholds =
    score?.selectedLeg === "with_qi"
      ? baseline?.thresholds.withQi
      : baseline?.thresholds.withoutQi;

  const distribution = [1, 2, 3, 4, 5].map((star) => ({
    star: `${star}★`,
    count: report.measures.filter((measure) => measure.predictedStar === star)
      .length,
  }));

  const contractLine = [
    report.contract.contractId,
    report.contract.parentOrganization,
    report.contract.organizationType,
    report.contract.snp ? `SNP: ${report.contract.snp}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ReportPageFrame
      pageRef={pageRef}
      eyebrow={reportEyebrow(report.starsYear, sample)}
      title={report.contract.contractName ?? report.contract.contractId}
      subtitle={contractLine}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      sample={sample}
    >
      <ReportSection
        title="Predicted Overall Rating"
        note={`Accrued plan preview scores rated at projected Stars ${report.starsYear} cut points. Overall uses MA-PD reward factor thresholds and CAI; Part C and Part D summaries use their own CAI.`}
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
              Predicted Stars {report.starsYear} Overall
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
              {formatStars(score?.finalRating ?? null)}
            </p>
            <StarGlyphs value={score?.finalRating ?? null} size={19} />
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--fep-muted)",
              }}
            >
              Final score {formatScore(score?.finalScoreRaw)}
            </p>
            {report.overallOutlook?.hasUpside ? (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 10,
                  fontWeight: 800,
                  color: REPORT_COLORS.positive,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "center",
                  lineHeight: 1.3,
                }}
              >
                {`Upside ${formatStars(report.overallOutlook.upsideRounded)}★`}
              </p>
            ) : null}
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
              {`Part C ${formatScore(score?.partCFinalRating ?? null, 2)} · Part D ${formatScore(score?.partDFinalRating ?? null, 2)}`}
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
                Without QI
              </span>
            </p>
            <BuildupRow
              label={`Base mean (${leg?.measureCount ?? 0} measures, weighted)`}
              value={formatScore(leg?.baseMean)}
            />
            <BuildupRow
              label="Reward factor"
              value={formatSigned(leg?.rewardFactor ?? null, 1)}
            />
            <BuildupRow
              label="CAI adjustment"
              value={formatSigned(score?.caiValue ?? null, 6)}
            />
            <BuildupRow
              label="Final score (unrounded)"
              value={formatScore(score?.finalScoreRaw)}
              emphasis
            />
            <BuildupRow
              label="Predicted rating (rounded to half star)"
              value={`${formatStars(score?.finalRating ?? null)}★`}
              emphasis
            />
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 9,
                color: "var(--fep-faint)",
              }}
            >
              QI is not scored in plan preview 1, so the projection excludes
              those measures.
              {report.measures.some((m) => m.starSource === "cahps_plan_file")
                ? " CAHPS stars come from the plan's PP1 Star Rating when uploaded; Base X→Y marks measures adjusted off their Base Group. Otherwise official cut points apply."
                : ""}
              {report.overallOutlook?.hasUpside
                ? " Upside eases conservative cut-point forecasts by historical methodology error (same reward factor and CAI)."
                : ""}
            </p>
          </div>
        </div>
      </ReportSection>

      <ReportSection title="Projection Inputs" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <ReportStat
            label="Measures scored"
            value={report.measures.length}
            detail={`${report.measures.filter((m) => m.predictedStar !== null).length} rated; ${
              report.measures.filter((m) => m.starSource === "cahps_plan_file")
                .length
            } CAHPS from PP1; ${leg?.measureCount ?? 0} enter Overall after Part C/D deduplicated`}
          />
          <ReportStat
            label="Reward factor"
            value={formatSigned(leg?.rewardFactor ?? null, 1)}
            detail={
              thresholds
                ? `Mean P65 ${thresholds.mean65th.toFixed(3)} / P85 ${thresholds.mean85th.toFixed(3)}`
                : "Thresholds unavailable"
            }
          />
          <ReportStat
            label="Weighted variance"
            value={formatScore(leg?.weightedVariance)}
            detail={
              thresholds
                ? `Var P30 ${thresholds.variance30th.toFixed(3)} / P70 ${thresholds.variance70th.toFixed(3)}`
                : undefined
            }
          />
          <ReportStat
            label="Weighted mean"
            value={formatScore(leg?.baseMean)}
            detail={`${leg?.measureCount ?? 0} measures in the Overall base mean`}
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Predicted Measure Star Distribution"
        note="Count of accrued measures at each whole-star rating. Non-CAHPS use projected cut points; CAHPS use the plan Star Rating when uploaded (Base Group shown when it differs)."
        style={{ marginTop: 12 }}
      >
        <div className="fep-report-panel" style={{ padding: "12px 10px 4px" }}>
          <BarChart
            width={686}
            height={185}
            data={distribution}
            margin={{ top: 16, right: 16, left: -14, bottom: 0 }}
          >
            <CartesianGrid stroke={REPORT_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="star"
              tick={{ fontSize: 11, fontWeight: 700, fill: REPORT_COLORS.ink }}
              axisLine={{ stroke: REPORT_COLORS.grid }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 10, fill: REPORT_COLORS.muted }}
              axisLine={false}
              tickLine={false}
            />
            <Bar
              dataKey="count"
              radius={[5, 5, 0, 0]}
              isAnimationActive={false}
            >
              {distribution.map((entry, index) => (
                <Cell
                  key={entry.star}
                  fill={
                    index >= 3
                      ? REPORT_COLORS.accent
                      : index === 2
                        ? REPORT_COLORS.accentSoft
                        : REPORT_COLORS.negative
                  }
                />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  fill: REPORT_COLORS.ink,
                }}
              />
            </Bar>
          </BarChart>
        </div>
      </ReportSection>

      {score && !score.qualifiesOverall ? (
        <p className="fep-banner-error" style={{ marginTop: 14, fontSize: 11 }}>
          {score.reason}
        </p>
      ) : null}
    </ReportPageFrame>
  );
}
