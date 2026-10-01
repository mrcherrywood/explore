"use client";

import type {
  CloverRemovalContractPage as ContractRow,
  CloverRemovalPathMeasure,
  CloverRemovalReport,
} from "@/lib/plan-preview/clover-removal-report-data";
import {
  compareMeasureCodes,
  resultsMeasurePart,
  type ResultsMeasurePart,
} from "../plan-preview-results-report/results-shared";

import {
  formatScore,
  formatSigned,
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
} from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 1, paddingBottom: 1 } as const;
const HEAD = { paddingBottom: 3, fontSize: 7.5 } as const;
const PRODUCT_LABEL = "Stars 2026 Recalc 4-star path";

function IfRemovedCell({
  value,
}: {
  value: CloverRemovalPathMeasure["ifRemoved"];
}) {
  if (!value) return <>—</>;
  if (value.status === "unrated") return <>No rating</>;
  const color =
    value.delta > 0.0005 ? REPORT_COLORS.positive : value.delta < -0.0005 ? REPORT_COLORS.negative : undefined;
  return (
    <span style={{ color, fontWeight: 700 }}>
      {formatScore(value.finalScoreRaw, 3)} ({formatSigned(value.delta, 3)})
    </span>
  );
}

export function cloverMeasurePages(measures: CloverRemovalPathMeasure[]): {
  part: ResultsMeasurePart;
  rows: CloverRemovalPathMeasure[];
}[] {
  const pages: { part: ResultsMeasurePart; rows: CloverRemovalPathMeasure[] }[] = [];
  for (const part of ["Part C", "Part D"] as const) {
    const rows = measures
      .filter((measure) => resultsMeasurePart(measure.code) === part)
      .sort((left, right) => compareMeasureCodes(left.code, right.code));
    if (rows.length > 0) pages.push({ part, rows });
  }
  return pages;
}

export function CloverRemovalMeasuresPage({
  report,
  contract,
  part,
  rows,
  pageNumber,
  totalPages,
}: {
  report: CloverRemovalReport;
  contract: ContractRow;
  part: ResultsMeasurePart;
  rows: CloverRemovalPathMeasure[];
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title="Measure scores"
      subtitle={`${contract.contractId} · ${part} · why each measure is on or off the path to 4.0`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <ReportSection
        title={`${part} measure scores`}
        note="Highlighted rows are removed. The path column says why that measure was removed or kept. If removed is the Overall, and its delta, after also taking that kept measure out. No rating means fewer than 15 Part C and Part D measures would remain."
      >
        <table className="fep-report-table compact" style={{ fontSize: 9, width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "34%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="l" style={HEAD}>Measure</th>
              <th style={HEAD}>Wt</th>
              <th style={HEAD}>Star</th>
              <th className="l" style={HEAD}>Path</th>
              <th className="l" style={HEAD}>If removed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((measure) => (
              <tr key={measure.code} style={{ background: measure.role === "removed" ? REPORT_COLORS.band : undefined }}>
                <td
                  className="l"
                  style={{ ...CELL, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 8.5 }}
                >
                  <MeasureLabel code={measure.displayCode} name={measure.displayName} />
                </td>
                <td style={CELL}>{measure.weight ?? "—"}</td>
                <td style={{ ...CELL, fontWeight: 800 }}>
                  {measure.star === null ? "—" : `${measure.star}★`}
                </td>
                <td
                  className="l"
                  style={{
                    ...CELL,
                    fontWeight: measure.role === "removed" ? 800 : 600,
                    color: measure.role === "ineligible" ? "var(--fep-faint)" : "var(--fep-ink)",
                  }}
                >
                  {measure.reason}
                </td>
                <td className="l" style={{ ...CELL, fontSize: 8, whiteSpace: "nowrap" }}>
                  <IfRemovedCell value={measure.ifRemoved} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
