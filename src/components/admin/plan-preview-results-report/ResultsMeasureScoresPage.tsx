"use client";

import type {
  PlanPreviewResultsReport,
  ResultsMeasure,
} from "@/lib/plan-preview/results-report-data";

import {
  ReportPageFrame,
  ReportSection,
  formatScore,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

export function chunkOfficialMeasuresByPart(measures: ResultsMeasure[]): {
  part: "Part C" | "Part D";
  rows: ResultsMeasure[];
}[] {
  const partC = measures.filter((measure) => measure.measureCode.startsWith("C"));
  const partD = measures.filter((measure) => measure.measureCode.startsWith("D"));
  return [
    ...(partC.length > 0 ? [{ part: "Part C" as const, rows: partC }] : []),
    ...(partD.length > 0 ? [{ part: "Part D" as const, rows: partD }] : []),
  ];
}

export function ResultsMeasureScoresPage({
  report,
  part,
  rows,
  pageNumber,
  totalPages,
}: {
  report: PlanPreviewResultsReport;
  part: "Part C" | "Part D";
  rows: ResultsMeasure[];
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title={`${part} measure stars`}
      subtitle={`${report.contract.contractId} · Official star beside the PP1 score`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel="Plan Preview 2 official results"
    >
      <ReportSection title={`${part} measures`}>
        <table className="fep-table">
          <thead>
            <tr>
              <th className="l">Measure</th>
              <th>PP1 score</th>
              <th>Official star</th>
              <th>Prior star</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((measure) => (
              <tr key={measure.measureCode}>
                <td className="l">
                  {measure.measureCode}: {measure.measureDisplayName}
                </td>
                <td>{formatScore(measure.pp1Score, 2)}</td>
                <td>{formatStars(measure.star, 0)}</td>
                <td>{formatStars(measure.publishedBaselineStar, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>
    </ReportPageFrame>
  );
}
