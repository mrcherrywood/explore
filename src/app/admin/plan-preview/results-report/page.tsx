import { PlanPreviewResultsReport } from "@/components/admin/plan-preview-results-report/PlanPreviewResultsReport";

export const metadata = {
  title: "Plan Preview 2 Official Report • Program Insight Studio",
  description:
    "Official Plan Preview 2 contract report with published ratings, year-over-year movement, QI significance, and PP1 prediction accuracy.",
};

export default async function PlanPreviewResultsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ starsYear?: string; contractId?: string }>;
}) {
  const params = await searchParams;
  const starsYear = Math.round(Number(params.starsYear));
  const contractId = (params.contractId ?? "").trim().toUpperCase();

  if (!Number.isFinite(starsYear) || starsYear <= 0 || !contractId) {
    return (
      <div className="px-[30px] py-10">
        <p className="fep-banner-error">
          A stars year and contract ID are required, e.g.
          /admin/plan-preview/results-report?starsYear=2027&amp;contractId=H8003.
        </p>
      </div>
    );
  }

  return <PlanPreviewResultsReport starsYear={starsYear} contractId={contractId} />;
}
