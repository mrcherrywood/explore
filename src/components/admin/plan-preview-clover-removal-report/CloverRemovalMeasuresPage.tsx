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
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
} from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 1, paddingBottom: 1 } as const;
const HEAD = { paddingBottom: 3, fontSize: 7.5 } as const;
const PRODUCT_LABEL = "Stars 2026 Recalc 4-star path";

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
        note={
          report.lensId === "any"
            ? "Highlighted rows are removed. HEDIS, last resort was removed only because the earlier measures were not enough to reach 4.0. Kept: HEDIS was left in place. On the shared list applies to every contract. This contract only is on the own minimum but not the shared list. Kept: 4★ or 5★ would lower the score if removed. Kept: not required is a lower star the removal set did not need. Not eligible is Quality Improvement or a Part D twin left out of Overall."
            : "Highlighted rows are removed. On the shared list applies to every contract. This contract only is on the own minimum but not the shared list. Kept: 4★ or 5★ would lower the score if removed. Kept: not required is a lower star the removal set did not need. Not eligible is outside the Stars 2026 Recalc and Model 2 set."
        }
      >
        <table className="fep-report-table compact" style={{ fontSize: 9, width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "28%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="l" style={HEAD}>Measure</th>
              <th style={HEAD}>Wt</th>
              <th style={HEAD}>Star</th>
              <th className="l" style={HEAD}>Path</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((measure) => (
              <tr key={measure.code} style={{ background: measure.role === "removed" ? REPORT_COLORS.band : undefined }}>
                <td
                  className="l"
                  style={{ ...CELL, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 8.5 }}
                >
                  <MeasureLabel code={measure.code} name={measure.displayName} />
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
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
