import { AppShell } from "@/components/layout/AppShell";
import { CloverImpactAnalysis } from "@/components/analysis/CloverImpactAnalysis";

export const metadata = {
  title: "Clover Scenario Impact - Program Insight Studio",
  description:
    "Analyze Clover lawsuit measure-removal scenarios for CMS Star Ratings.",
};

export default function CloverImpactPage() {
  return (
    <AppShell
      title="Clover Lawsuit Scenario Impact"
      subtitle="Compare official ratings against measure-removal scenarios, including the Stars 2026 voluntary recalculation."
    >
      <CloverImpactAnalysis />
    </AppShell>
  );
}
