import { PlanPreviewContractReport } from "@/components/admin/plan-preview-report/PlanPreviewContractReport";

export const metadata = {
  title: "Plan Preview Contract Report • Program Insight Studio",
  description:
    "Presentation-ready, multi-page contract report with predicted overall rating, domain performance, year-over-year trends, and measure removal scenarios.",
};

export default async function PlanPreviewReportPage({
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
          /admin/plan-preview/report?starsYear=2027&amp;contractId=H8003.
        </p>
      </div>
    );
  }

  return <PlanPreviewContractReport starsYear={starsYear} contractId={contractId} />;
}
