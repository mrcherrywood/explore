/**
 * Illustrative Plan Preview 2 official contract report for marketing.
 *
 * Built from official 2027 measure catalog / Tech Notes thresholds plus a
 * fictional Northstar contract — not an anonymized live book. Refresh is
 * just rebuilding this module; there is no live-contract snapshot.
 */

import type { PlanPreviewResultsReport } from "./results-report-data";
import { buildSyntheticPp2SampleReport } from "./synthetic-pp2-sample";

/** Static illustrative official report — same structure as a live PP2 report. */
export function getMarketingSampleResultsReport(): PlanPreviewResultsReport {
  return buildSyntheticPp2SampleReport();
}
