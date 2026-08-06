import { AppShell } from "@/components/layout/AppShell";
import { PercentileAnalysisResults } from "@/components/analysis/PercentileAnalysisResults";

export const metadata = {
  title: "Percentile Analysis • Program Insight Studio",
  description:
    "Reference page for the Medicare Star Ratings percentile analysis scripts and workflow.",
};

export default function PercentileAnalysisPage() {
  return (
    <AppShell
      title="Percentile Analysis Toolkit"
      subtitle="Compare percentile methods for Medicare Star Ratings score distributions."
    >
      <PercentileAnalysisResults />
    </AppShell>
  );
}
