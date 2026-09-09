/**
 * Print a short sanity check for the synthetic PP2 marketing sample.
 * The sample page builds this at runtime — no live contract snapshot.
 *
 *   npx tsx scripts/generate-marketing-pp2-sample.ts
 */
import { buildupChecksOut } from "../src/lib/plan-preview/results-report-data";
import { buildSyntheticPp2SampleReport } from "../src/lib/plan-preview/synthetic-pp2-sample";

const report = buildSyntheticPp2SampleReport();
console.log(
  `${report.contract.contractId}  official ${report.accuracySummary.overallOfficial}` +
    `  PP1 ${report.accuracySummary.overallPredicted}` +
    `  exact ${report.accuracySummary.exact}/${report.accuracySummary.compared}` +
    `  buildup ${buildupChecksOut(report.overall)}` +
    `  book ${report.bookCompare.bookContractCount}`,
);
