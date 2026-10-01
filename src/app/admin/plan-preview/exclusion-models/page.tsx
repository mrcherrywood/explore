import { ExclusionModelsReport } from "@/components/admin/plan-preview-exclusion-models/ExclusionModelsReport";

export const metadata = {
  title: "Exclusion models • Program Insight Studio",
  description:
    "Overall scores after the CMS 2026 recalculation exclusions and the Clover statutory and notice-and-comment exclusions.",
};

export default async function ExclusionModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ starsYear?: string; parentOrganization?: string }>;
}) {
  const params = await searchParams;
  const starsYear = Math.round(Number(params.starsYear));
  const parentOrganization = (params.parentOrganization ?? "").trim();

  if (!Number.isFinite(starsYear) || starsYear <= 0 || !parentOrganization) {
    return (
      <div className="px-[30px] py-10">
        <p className="fep-banner-error">
          A stars year and parent organization are required, e.g.
          /admin/plan-preview/exclusion-models?starsYear=2027&amp;parentOrganization=Trinity.
        </p>
      </div>
    );
  }

  return (
    <ExclusionModelsReport starsYear={starsYear} parentOrganization={parentOrganization} />
  );
}
