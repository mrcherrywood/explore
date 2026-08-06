/**
 * Illustrative Plan Preview 1 contract report for marketing / sales materials.
 *
 * Snapshot is produced by the same report pipeline as production (accrued PP1
 * scores + ma_measures domains + scenario final scores), then anonymized.
 * Refresh with:
 *   npx tsx scripts/generate-marketing-pp1-sample.ts
 */

import type { PlanPreviewContractReport } from "./report-data";
import sampleReport from "./marketing-sample-report.json";

/** Static illustrative report — same structure as a live contract report. */
export function getMarketingSamplePlanPreviewReport(): PlanPreviewContractReport {
  return sampleReport as PlanPreviewContractReport;
}
