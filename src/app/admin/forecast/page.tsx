import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { CutPointForecastAdmin } from "@/components/admin/CutPointForecastAdmin";
import { AppShell } from "@/components/layout/AppShell";

export const metadata = {
  title: "Forecast Admin • Program Insight Studio",
  description:
    "Import glidepath data, edit year-end projections, and approve cut-point forecast runs.",
};

export default function ForecastAdminPage() {
  return (
    <AppShell
      title="Future Cut-Point Forecasts"
      subtitle="Import glidepath data, edit year-end projections, and approve forecast runs."
      actions={<AdminSubNav />}
    >
      <CutPointForecastAdmin />
    </AppShell>
  );
}
