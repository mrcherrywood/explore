"use client";

import type { ExclusionModelReport } from "@/lib/plan-preview/exclusion-model-report";
import type { TrinityContractDetail, TrinityScenarioMath } from "@/lib/plan-preview/exclusion-model-trinity";

import { ReportPageFrame, ReportSection, formatScore, formatSigned, formatStars } from "../plan-preview-report/report-shared";

const CELL = { paddingTop: 3, paddingBottom: 3 } as const;

function meanBand(category: string): string {
  if (category === "high") return "High";
  if (category === "relatively_high") return "Relatively high";
  return "Below 65th";
}

function varianceBand(category: string): string {
  if (category === "low") return "Low";
  if (category === "medium") return "Medium";
  return "High";
}

function pair(left: number, right: number): string {
  return `${formatScore(left)} / ${formatScore(right)}`;
}

export function ExclusionModelsTrinityPage({
  report,
  contract,
  pageNumber,
  totalPages,
}: {
  report: ExclusionModelReport;
  contract: TrinityContractDetail;
  pageNumber: number;
  totalPages: number;
}) {
  const columns = contract.scenarios;
  return (
    <ReportPageFrame
      eyebrow={`${report.parentOrganization} · Stars ${report.starsYear}`}
      title={contract.contractId}
      subtitle={contract.contractName ?? "Trinity Health Corporation"}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel="Exclusion models"
    >
      <ReportSection
        title="Measures removed"
        note="Five C drops C15, C32, C16, C04, and C05. Five C + D drops those five plus D01, D06, D08, and D11. The mean and variance are recalculated from the measures that remain on this contract. The cutoffs stay the published ones. Overall is the mean, plus the reward factor, plus CAI."
        style={{ marginTop: 8 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 8.5 }}>
          <thead>
            <tr>
              <th className="l">Measure removed</th>
              <th>Star</th>
              <th>Weight</th>
              <th>Five C</th>
              <th>Five C + D</th>
            </tr>
          </thead>
          <tbody>
            {contract.dropped.map((measure) => (
              <tr key={measure.code}>
                <td className="l" style={CELL}>
                  <span style={{ fontWeight: 700 }}>{measure.code}</span> {measure.name}
                </td>
                <td style={CELL}>{measure.star == null ? "Not rated" : formatStars(measure.star, Number.isInteger(measure.star) ? 0 : 1)}</td>
                <td style={CELL}>{measure.weight == null ? "—" : formatScore(measure.weight, Number.isInteger(measure.weight) ? 0 : 1)}</td>
                <td style={CELL}>{measure.inFiveC ? (measure.star == null ? "Not rated" : "Dropped") : "Kept"}</td>
                <td style={CELL}>{measure.star == null ? "Not rated" : "Dropped"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection title="Score buildup" style={{ marginTop: 14 }}>
        <table className="fep-report-table compact" style={{ fontSize: 8.5 }}>
          <thead>
            <tr>
              <th className="l"> </th>
              {columns.map((column) => (
                <th key={column.id}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MathRow label="Measures remaining" columns={columns} value={(column) => String(column.keptCount)} />
            <MathRow label="Weighted mean" columns={columns} value={(column) => formatScore(column.weightedMean)} />
            <MathRow label="Mean cutoffs, 65th / 85th" columns={columns} value={(column) => pair(column.mean65th, column.mean85th)} />
            <MathRow label="Mean band" columns={columns} value={(column) => meanBand(column.meanCategory)} />
            <MathRow label="Weighted variance" columns={columns} value={(column) => formatScore(column.weightedVariance)} />
            <MathRow
              label="Variance cutoffs, 30th / 70th"
              columns={columns}
              value={(column) => pair(column.variance30th, column.variance70th)}
            />
            <MathRow label="Variance band" columns={columns} value={(column) => varianceBand(column.varianceCategory)} />
            <MathRow label="Reward factor" columns={columns} value={(column) => column.rewardFactor.toFixed(1)} />
            <MathRow label="CAI" columns={columns} value={(column) => formatSigned(column.cai)} />
            <MathRow label="Overall" columns={columns} value={(column) => formatScore(column.finalScoreRaw)} strong />
            <MathRow label="Rounded rating" columns={columns} value={(column) => formatStars(column.finalRating, 1)} />
          </tbody>
        </table>
        <p className="fep-report-section-note" style={{ marginTop: 8 }}>
          Published Overall is {formatStars(contract.publishedRating, 1)}.{" "}
          {columns.map((column) => `${column.label}: ${column.reason}`).join(" ")}
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}

function MathRow({
  label,
  columns,
  value,
  strong,
}: {
  label: string;
  columns: TrinityScenarioMath[];
  value: (column: TrinityScenarioMath) => string;
  strong?: boolean;
}) {
  return (
    <tr>
      <td className="l" style={CELL}>
        {label}
      </td>
      {columns.map((column) => (
        <td key={column.id} style={{ ...CELL, fontWeight: strong ? 700 : undefined }}>
          {value(column)}
        </td>
      ))}
    </tr>
  );
}
