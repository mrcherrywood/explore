"use client";

import type { CloverRemovalReport } from "@/lib/plan-preview/clover-removal-report-data";
import {
  isLowStar,
  type LowStarMatrixPage,
} from "@/lib/plan-preview/clover-low-star-matrix";

import {
  MeasureLabel,
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
} from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 1, paddingBottom: 1 } as const;
const HEAD = { paddingBottom: 3, fontSize: 7.5 } as const;
const PRODUCT_LABEL = "Stars 2026 Recalc 4-star path";
const LOW_CELL = { background: "#f6ddd4", color: REPORT_COLORS.negative, fontWeight: 800 } as const;

export function CloverRemovalLowStarPage({
  report,
  page,
  pageNumber,
  totalPages,
}: {
  report: CloverRemovalReport;
  page: LowStarMatrixPage;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <ReportPageFrame
      eyebrow={`Plan Preview 2 · Stars ${report.starsYear} Recalc 4-star path`}
      title={`${page.part} measures at 3★ and under`}
      subtitle={`${report.parentOrganization} · ${report.lensLabel}. Salmon cells are 3★ or lower. Shaded measure names are in the Recalc and Clover-20 set.`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <ReportSection
        title="Across contracts"
        note="Measures are listed when at least one contract scores them 3★ or lower, with the most widely shared measures first. Recalc is Yes when the measure is in the Stars 2026 Recalc and Clover-20 set. The count is how many contracts score that measure 3★ or lower."
      >
        <table className="fep-report-table compact" style={{ fontSize: 8, width: "100%", tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <col style={{ width: 42 }} />
            <col style={{ width: 28 }} />
            {page.contractIds.map((contractId) => (
              <col key={contractId} style={{ width: 46 }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="l" style={HEAD}>Measure</th>
              <th style={HEAD}>Recalc</th>
              <th style={HEAD}>≤3</th>
              {page.contractIds.map((contractId) => (
                <th key={contractId} style={HEAD}>{contractId}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row) => (
              <tr key={row.code}>
                <td
                  className="l"
                  style={{
                    ...CELL,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    background: row.inRecalcSet ? REPORT_COLORS.band : undefined,
                  }}
                >
                  <MeasureLabel code={row.code} name={row.displayName} />
                </td>
                <td
                  style={{
                    ...CELL,
                    fontWeight: 800,
                    background: row.inRecalcSet ? REPORT_COLORS.band : undefined,
                    color: row.inRecalcSet ? "var(--fep-ink)" : "var(--fep-faint)",
                  }}
                >
                  {row.inRecalcSet ? "Yes" : "No"}
                </td>
                <td style={{ ...CELL, fontWeight: 800 }}>{row.lowCount}</td>
                {row.stars.map((star, index) => (
                  <td
                    key={page.contractIds[index]}
                    style={{ ...CELL, ...(isLowStar(star) ? LOW_CELL : { color: "var(--fep-muted)" }) }}
                  >
                    {star == null ? "—" : `${star}★`}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="l" style={{ ...CELL, fontWeight: 800 }}>3★ and under</td>
              <td style={CELL} />
              <td style={CELL} />
              {page.contractLowCounts.map((count, index) => (
                <td key={page.contractIds[index]} style={{ ...CELL, fontWeight: 800 }}>{count}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
