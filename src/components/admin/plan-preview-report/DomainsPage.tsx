"use client";

import type { Ref } from "react";

import type { PlanPreviewContractReport } from "@/lib/plan-preview/report-data";

import { DomainMeansChart, domainChartName } from "./report-charts";
import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  deltaColor,
  formatSigned,
  formatStars,
  reportEyebrow,
} from "./report-shared";

export function DomainsPage({
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
  const domains = report.domains;
  const chartData = domains.map((domain) => ({
    name: domainChartName(domain.domain),
    predicted: domain.predictedMean,
    baseline: domain.baselineMean,
    recalculated: domain.recalculatedMean,
  }));

  return (
    <ReportPageFrame
      pageRef={pageRef}
      eyebrow={reportEyebrow(report.starsYear, sample)}
      title="Performance by Domain"
      subtitle={`${report.contract.contractId} · Weighted mean of predicted measure stars, grouped by CMS domain`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      sample={sample}
    >
      <ReportSection
        title="Weighted mean stars by domain"
        note={`Predicted Stars ${report.starsYear} domain means versus this contract's published Stars ${report.baselineYear ?? "—"} domain stars and Stars ${report.baselineYear ?? "—"} recalculated (Official CMS recalculation measure set).`}
      >
        <div className="fep-report-panel" style={{ padding: "14px 12px 4px" }}>
          <DomainMeansChart
            data={chartData}
            series={[
              {
                dataKey: "baseline",
                name: `Stars ${report.baselineYear ?? "—"} published`,
                fill: REPORT_COLORS.band,
              },
              {
                dataKey: "recalculated",
                name: `Stars ${report.baselineYear ?? "—"} recalculated`,
                fill: REPORT_COLORS.positive,
                labelFill: REPORT_COLORS.positive,
              },
              {
                dataKey: "predicted",
                name: `Predicted Stars ${report.starsYear}`,
                fill: REPORT_COLORS.accent,
                labelFill: REPORT_COLORS.accent,
                labelWeight: 800,
              },
            ]}
          />
        </div>
      </ReportSection>

      <ReportSection title="Domain Detail" style={{ marginTop: 14 }}>
        <div className="fep-report-panel" style={{ padding: "12px 0 4px" }}>
          <table className="fep-report-table compact">
            <thead>
              <tr>
                <th className="l">Domain</th>
                <th className="l">Part</th>
                <th>Measures rated</th>
                <th>Stars {report.baselineYear ?? "—"} published</th>
                <th>Stars {report.baselineYear ?? "—"} recalculated</th>
                <th>Predicted Stars {report.starsYear}</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => {
                const delta =
                  domain.predictedMean !== null && domain.baselineMean !== null
                    ? Math.round(
                        (domain.predictedMean - domain.baselineMean) * 100,
                      ) / 100
                    : null;
                return (
                  <tr key={domain.domain}>
                    <td
                      className="l"
                      style={{
                        fontWeight: 600,
                        color: "var(--fep-ink)",
                        whiteSpace: "normal",
                      }}
                    >
                      {domain.domain}
                    </td>
                    <td className="l">{domain.part}</td>
                    <td>
                      {domain.ratedMeasureCount} of {domain.measureCount}
                    </td>
                    <td>{formatStars(domain.baselineMean, 2)}</td>
                    <td>{formatStars(domain.recalculatedMean, 2)}</td>
                    <td style={{ fontWeight: 800, color: "var(--fep-ink)" }}>
                      {formatStars(domain.predictedMean, 2)}
                    </td>
                    <td style={{ fontWeight: 700, color: deltaColor(delta) }}>
                      {formatSigned(delta, 2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 8 }}>
          Stars {report.baselineYear ?? "—"} published domain means match
          Contract Summary: published measure stars weighted by that year&apos;s
          measure weights. Recalculated means drop the Official CMS
          recalculation removals from those published stars — including all Part
          D measures — so Pharmacy has no recalculated bar. Predicted means use
          accrued plan preview stars (plan CAHPS Star Rating when uploaded,
          otherwise official cut points) with Stars {report.starsYear} weights.
          Domain groupings
          follow CMS Stars {report.baselineYear ?? "—"} measure-to-domain
          assignments; measures new to Stars {report.starsYear} (e.g.
          Polypharmacy Poly-ACH) are assigned to their CMS domain.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
