import { CloverRemovalReport } from "@/components/admin/plan-preview-clover-removal-report/CloverRemovalReport";

export const metadata = {
  title: "Stars 2026 Recalc 4-star path • Program Insight Studio",
  description:
    "Parent-organization report of the fewest Stars 2026 Recalc or Model 2 measures CMS would need to remove to reach a 4-star Overall rating.",
};

export default async function CloverRemovalReportPage({
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
          /admin/plan-preview/clover-removal-report?starsYear=2027&amp;parentOrganization=Trinity.
        </p>
      </div>
    );
  }

  return (
    <CloverRemovalReport starsYear={starsYear} parentOrganization={parentOrganization} />
  );
}
