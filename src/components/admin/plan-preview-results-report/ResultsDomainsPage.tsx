"use client";

import {
  DomainMeansChart,
  domainChartName,
} from "../plan-preview-report/report-charts";
import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  deltaColor,
  formatSigned,
  formatStars,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

import { PP2_PRODUCT_LABEL, type ResultsPageProps } from "./results-shared";

export function ResultsDomainsPage({
  report,
  pageNumber,
  totalPages,
  sample,
}: ResultsPageProps) {
  const baselineYear = report.baselineYear ?? "—";
  const chartData = report.domains.map((domain) => ({
    name: domainChartName(domain.domain),
    official: domain.officialMean,
    baseline: domain.baselineMean,
  }));

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear, sample)}
      title="Performance by Domain"
      subtitle={`${report.contract.contractId} · Weighted mean of official measure stars, grouped by CMS domain`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.contract.contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      sample={sample}
      productLabel={PP2_PRODUCT_LABEL}
    >
      <ReportSection
        title="Weighted mean stars by domain"
        note={`Official Stars ${report.starsYear} domain means versus this contract's published Stars ${baselineYear} domain stars.`}
      >
        <div className="fep-report-panel" style={{ padding: "14px 12px 4px" }}>
          <DomainMeansChart
            data={chartData}
            series={[
              {
                dataKey: "baseline",
                name: `Stars ${baselineYear} published`,
                fill: REPORT_COLORS.band,
              },
              {
                dataKey: "official",
                name: `Official Stars ${report.starsYear}`,
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
                <th>Stars {baselineYear} published</th>
                <th>Official Stars {report.starsYear}</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {report.domains.map((domain) => {
                const delta =
                  domain.officialMean !== null && domain.baselineMean !== null
                    ? Math.round(
                        (domain.officialMean - domain.baselineMean) * 100,
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
                    <td style={{ fontWeight: 800, color: "var(--fep-ink)" }}>
                      {formatStars(domain.officialMean, 2)}
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
          Stars {baselineYear} published domain means match Contract Summary:
          published measure stars weighted by that year&apos;s measure weights.
          Official Stars {report.starsYear} means use the Plan Preview 2 star
          file with Stars {report.starsYear} weights. Domain groupings follow
          CMS Stars {baselineYear} measure-to-domain assignments; measures new
          to Stars {report.starsYear} are assigned to their CMS domain.
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
