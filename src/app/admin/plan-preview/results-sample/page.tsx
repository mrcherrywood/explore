import { PlanPreviewResultsReportView } from "@/components/admin/plan-preview-results-report/PlanPreviewResultsReportView";
import { getMarketingSampleResultsReport } from "@/lib/plan-preview/marketing-sample-results-report";

export const metadata = {
  title: "Plan Preview 2 Sample Report • Program Insight Studio",
  description:
    "Illustrative Plan Preview 2 official contract report for marketing and sales materials.",
};

export default function PlanPreviewResultsSamplePage() {
  const report = getMarketingSampleResultsReport();

  return (
    <PlanPreviewResultsReportView
      report={report}
      backHref="/admin/plan-preview"
      backLabel="Plan Preview Admin"
      heading="Sample Official Report"
      subheading="Illustrative Plan Preview 2 report for marketing — fictional Northstar Advantage (H4721), Stars 2027."
      fileName="plan-preview-2-sample-report_H4721_stars-2027"
      sample
    />
  );
}
