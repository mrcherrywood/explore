"use client";

import type { ExclusionModelReport } from "@/lib/plan-preview/exclusion-model-report";
import type { TrinityContractDetail, TrinityDetailPage, TrinityDroppedMeasure, TrinityScenarioMath } from "@/lib/plan-preview/exclusion-model-trinity";

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

function dropCell(dropped: boolean, measure: TrinityDroppedMeasure): string {
  if (!dropped) return "Kept";
  if (measure.alreadyOutOfOverall) return "Already out";
  if (!measure.inPopulation || measure.star == null) return "Not rated";
  return "Dropped";
}

export function ExclusionModelsTrinityPage({
  report,
  contract,
  page,
  pageNumber,
  totalPages,
}: {
  report: ExclusionModelReport;
  contract: TrinityContractDetail;
  page: TrinityDetailPage;
  pageNumber: number;
  totalPages: number;
}) {
  const columns = page.scenarios;
  const cell = page.dropped.length > 12 ? { paddingTop: 1, paddingBottom: 1 } : CELL;
  return (
    <ReportPageFrame
      eyebrow={`${report.parentOrganization} · Stars ${report.starsYear}`}
      title={contract.contractId}
      subtitle={
        page.subtitle
          ? [contract.contractName, page.subtitle].filter(Boolean).join(" · ")
          : (contract.contractName ?? "Trinity Health Corporation")
      }
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel="Exclusion models"
    >
      <ReportSection
        title="Measures removed"
        note={page.note}
        style={{ marginTop: 8 }}
      >
        <MeasureColumns measures={page.dropped} headers={page.dropHeaders} cell={cell} />
      </ReportSection>

      <ReportSection title="Score buildup" style={{ marginTop: page.dropped.length > 12 ? 8 : 14 }}>
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

function MeasureColumns({
  measures,
  headers,
  cell,
}: {
  measures: TrinityDroppedMeasure[];
  headers: string[];
  cell: { paddingTop: number; paddingBottom: number };
}) {
  const split = measures.length > 12;
  const midpoint = Math.ceil(measures.length / 2);
  const columns = split ? [measures.slice(0, midpoint), measures.slice(midpoint)] : [measures];
  return (
    <div style={split ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } : undefined}>
      {columns.map((group, groupIndex) => (
        <MeasureTable
          key={group[0]?.code ?? groupIndex}
          measures={group}
          headers={headers}
          cell={cell}
          showWeight={!split}
        />
      ))}
    </div>
  );
}

function MeasureTable({
  measures,
  headers,
  cell,
  showWeight,
}: {
  measures: TrinityDroppedMeasure[];
  headers: string[];
  cell: { paddingTop: number; paddingBottom: number };
  showWeight: boolean;
}) {
  return (
    <table className="fep-report-table compact" style={{ fontSize: 8 }}>
      <thead>
        <tr>
          <th className="l">Measure</th>
          <th>Star</th>
          {showWeight ? <th>Weight</th> : null}
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {measures.map((measure) => (
          <tr key={measure.code}>
            <td className="l" style={cell}>
              <span style={{ fontWeight: 700 }}>{measure.code}</span> {measure.name}
            </td>
            <td style={cell}>{measure.star == null ? "—" : formatStars(measure.star, Number.isInteger(measure.star) ? 0 : 1)}</td>
            {showWeight ? (
              <td style={cell}>{measure.weight == null ? "—" : formatScore(measure.weight, Number.isInteger(measure.weight) ? 0 : 1)}</td>
            ) : null}
            {headers.map((header, index) => (
              <td key={header} style={cell}>
                {dropCell(measure.columns[index] ?? false, measure)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
