import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { PlanPreviewAdmin } from "@/components/admin/PlanPreviewAdmin";
import { AppShell } from "@/components/layout/AppShell";

export const metadata = {
  title: "Plan Preview Admin • Program Insight Studio",
  description:
    "Upload plan preview measure and CAI files, track accrued contract coverage, and prepare cut point predictions.",
};

export default function PlanPreviewAdminPage() {
  return (
    <AppShell
      title="Plan Preview 1"
      subtitle="Contract-level measure scores from CMS plan preview files, accrued across uploads to power cut point predictions, final score projections, and scenario analyses."
      actions={<AdminSubNav />}
    >
      <PlanPreviewAdmin />
    </AppShell>
  );
}
