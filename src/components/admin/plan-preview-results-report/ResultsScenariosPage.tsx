"use client";

import { ScenariosPage } from "../plan-preview-report/ScenariosPage";
import { reportEyebrowPp2 } from "../plan-preview-report/report-shared";

import { PP2_PRODUCT_LABEL, type ResultsPageProps } from "./results-shared";

export function ResultsScenariosPage({
  report,
  pageNumber,
  totalPages,
}: ResultsPageProps) {
  return (
    <ScenariosPage
      report={report}
      pageNumber={pageNumber}
      totalPages={totalPages}
      eyebrow={reportEyebrowPp2(report.starsYear)}
      subtitle={`${report.contract.contractId} · Same scenario set as Clover Impact / Plan Preview 1, scored on official Plan Preview 2 stars`}
      productLabel={PP2_PRODUCT_LABEL}
      chartTitle="Official score by scenario"
      chartNote={`Each scenario removes its measure set and re-scores the official Plan Preview 2 stars using official Stars ${report.starsYear} weights and Technical Notes reward-factor thresholds. Bar labels show unrounded final scores.`}
      footerNote="Official Recalc uses Part C CAI (Part C summary). Official Quality Improvement stars are included except in the No QI scenario. All scenarios use official measure weights and Technical Notes reward-factor thresholds. Stars 2028 / 2029 impact boxes use the CMS-announced retirement sets."
    />
  );
}
