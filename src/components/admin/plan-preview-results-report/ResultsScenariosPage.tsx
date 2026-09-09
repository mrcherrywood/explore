"use client";

import { ScenariosPage } from "../plan-preview-report/ScenariosPage";
import { reportEyebrowPp2 } from "../plan-preview-report/report-shared";

import { PP2_PRODUCT_LABEL, type ResultsPageProps } from "./results-shared";

export function ResultsScenariosPage({
  report,
  pageNumber,
  totalPages,
  sample,
}: ResultsPageProps) {
  return (
    <ScenariosPage
      report={report}
      pageNumber={pageNumber}
      totalPages={totalPages}
      sample={sample}
      eyebrow={reportEyebrowPp2(report.starsYear, sample)}
      subtitle={`${report.contract.contractId} · Official Plan Preview 2 stars under CMS-announced measure removals`}
      productLabel={PP2_PRODUCT_LABEL}
      baselineLabel={`S${String(report.starsYear).slice(-2)} Official`}
      chartTitle="Official score by scenario"
      chartNote={`Each scenario removes its measure set and re-scores the official Plan Preview 2 stars using official Stars ${report.starsYear} weights and Technical Notes reward-factor thresholds. Bar labels show unrounded final scores.`}
      footerNote="Official Recalc uses Part C CAI (Part C summary). Official Quality Improvement stars are included except in the No QI scenario. All scenarios use official measure weights and Technical Notes reward-factor thresholds. Stars 2028 removals are the CMS-announced retirement set; the 2029 box uses the later announced set."
    />
  );
}
