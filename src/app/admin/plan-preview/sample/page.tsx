import { PlanPreviewReportView } from "@/components/admin/plan-preview-report/PlanPreviewReportView";
import { getMarketingSamplePlanPreviewReport } from "@/lib/plan-preview/marketing-sample-report";

export const metadata = {
  title: "Plan Preview Sample Report • Program Insight Studio",
  description:
    "Illustrative Plan Preview 1 contract report for marketing and sales materials.",
};

export default function PlanPreviewSampleReportPage() {
  const report = getMarketingSamplePlanPreviewReport();

  return (
    <PlanPreviewReportView
      report={report}
      backHref="/admin/plan-preview"
      backLabel="Plan Preview Admin"
      heading="Sample Contract Report"
      subheading="Illustrative Plan Preview 1 report for marketing — fictional Northstar Advantage (H4721), Stars 2027."
      fileName="plan-preview-sample-report_H4721_stars-2027"
      sample
    />
  );
}
