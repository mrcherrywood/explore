"use client";

import type { ResultsMeasure } from "@/lib/plan-preview/results-report-data";

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

import {
  PP2_PRODUCT_LABEL,
  type ResultsPageProps,
  compareMeasureCodes,
  qualityImprovementMeasure,
} from "./results-shared";

const MAX_ROWS = 32;
const CELL = { paddingTop: 2, paddingBottom: 2 } as const;

type SignificanceTone = "positive" | "negative" | "neutral";

/** CMS improve_c / improve_d wording: "Significant improvement", "Significant decline", … */
function significanceTone(value: string | null): SignificanceTone {
  if (!value) return "neutral";
  if (/improv/i.test(value)) return "positive";
  if (/declin|decreas|worse/i.test(value)) return "negative";
  return "neutral";
}

const TONE_ORDER: Record<SignificanceTone, number> = {
  positive: 0,
  negative: 1,
  neutral: 2,
};

const TONE_COLOR: Record<SignificanceTone, string> = {
  positive: REPORT_COLORS.positive,
  negative: REPORT_COLORS.negative,
  neutral: "var(--fep-muted)",
};

function qiMeasureStar(measures: ResultsMeasure[], part: "Part C" | "Part D"): {
  code: string;
  starLabel: string;
} {
  const measure = qualityImprovementMeasure(measures, part);
  const star = measure?.star;
  return {
    code: measure?.measureCode ?? (part === "Part D" ? "Part D" : "Part C"),
    starLabel: star === null || star === undefined ? "—" : `${formatStars(star, 0)}★`,
  };
}

export function ResultsQiPage({
  report,
  pageNumber,
  totalPages,
}: ResultsPageProps) {
  const baselineYear = report.baselineYear ?? "—";
  const partCQi = qiMeasureStar(report.measures, "Part C");
  const partDQi = qiMeasureStar(report.measures, "Part D");
  const rows = report.measures
    .filter((measure) => measure.qiSignificance)
    .map((measure) => ({
      ...measure,
      tone: significanceTone(measure.qiSignificance),
    }))
    .sort(
      (left, right) =>
        TONE_ORDER[left.tone] - TONE_ORDER[right.tone] ||
        compareMeasureCodes(left.measureCode, right.measureCode),
    );
  const improved = rows.filter((row) => row.tone === "positive").length;
  const declined = rows.filter((row) => row.tone === "negative").length;
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Quality Improvement"
      subtitle={`${report.contract.contractId} · Official per-measure improvement significance behind the Part C and Part D Quality Improvement measures`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PP2_PRODUCT_LABEL}
    >
      <ReportSection
        title="Improvement measure results"
        note="CMS scores Part C and Part D Quality Improvement from statistically significant year-over-year change on each eligible measure. Summary cards list official scores from the PP2 improve_c / improve_d files."
        style={{ marginTop: 12 }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <ReportStat
            label="Part C QI score"
            value={formatScore(report.partC?.improvementScore, 2)}
            detail={`${partCQi.code} rated ${partCQi.starLabel}`}
          />
          <ReportStat
            label="Part D QI score"
            value={formatScore(report.partD?.improvementScore, 2)}
            detail={`${partDQi.code} rated ${partDQi.starLabel}`}
          />
          <ReportStat
            label="Significant improvements"
            value={improved}
            detail={`of ${rows.length} measures evaluated`}
          />
          <ReportStat
            label="Significant declines"
            value={declined}
            detail={`of ${rows.length} measures evaluated`}
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Measure significance"
        note="Significant changes are listed first, then measures with no significant change, each in measure-code order."
        style={{ marginTop: 12 }}
      >
        <div className="fep-report-panel" style={{ padding: "6px 0 2px" }}>
          <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
            <thead>
              <tr>
                <th className="l">Measure</th>
                <th>Weight</th>
                <th>Stars {baselineYear}</th>
                <th>Stars {report.starsYear}</th>
                <th className="l">Significance</th>
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
                    Upload the PP2 improve_c / improve_d files to show QI
                    significance.
                  </td>
                </tr>
              ) : (
                visible.map((measure) => (
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
                      {measure.publishedBaselineStar === null
                        ? "—"
                        : `${formatStars(measure.publishedBaselineStar, 0)}★`}
                    </td>
                    <td
                      style={{
                        ...CELL,
                        fontWeight: 800,
                        color: "var(--fep-ink)",
                      }}
                    >
                      {measure.star === null
                        ? "—"
                        : `${formatStars(measure.star, 0)}★`}
                    </td>
                    <td
                      className="l"
                      style={{
                        ...CELL,
                        fontWeight: measure.tone === "neutral" ? 600 : 800,
                        color: TONE_COLOR[measure.tone],
                        whiteSpace: "nowrap",
                      }}
                    >
                      {measure.qiSignificance}
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
                    +{hidden} more measure{hidden === 1 ? "" : "s"} evaluated.
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
