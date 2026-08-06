import { AppShell } from "@/components/layout/AppShell";
import { ContractsMapExplorer } from "@/components/maps/ContractsMapExplorer";

export const metadata = {
  title: "Maps • Program Insight Studio",
  description:
    "Explore contract performance within states using interactive geographic comparisons.",
};

export default function MapsContractsPage() {
  return (
    <AppShell
      title="State-Level Contract Insights"
      subtitle="Explore contract performance within states using interactive geographic comparisons."
    >
      <ContractsMapExplorer />
    </AppShell>
  );
}
