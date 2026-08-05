import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { PlanPreviewAdmin } from "@/components/admin/PlanPreviewAdmin";
import { DataPageNav } from "@/components/navigation/DataPageNav";

export const metadata = {
  title: "Plan Preview Admin • Program Insight Studio",
  description:
    "Upload plan preview measure and CAI files, track accrued contract coverage, and prepare cut point predictions.",
};

export default function PlanPreviewAdminPage() {
  return (
    <div className="flex min-h-screen">
      <DataPageNav />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-5 px-[30px] pb-4 pt-[22px]">
          <div>
            <h1 className="fep-title">Plan Preview 1</h1>
            <p className="fep-subtitle">
              Contract-level measure scores from CMS plan preview files, accrued across uploads to
              power cut point predictions, final score projections, and scenario analyses.
            </p>
          </div>
          <div className="pt-2">
            <AdminSubNav variant="fep" />
          </div>
        </div>

        <div className="flex flex-1 flex-col px-[30px] pb-8">
          <PlanPreviewAdmin />
        </div>
      </main>
    </div>
  );
}
