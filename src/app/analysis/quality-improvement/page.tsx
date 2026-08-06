import { AppShell } from "@/components/layout/AppShell";
import { QualityImprovementAnalysis } from "@/components/analysis/QualityImprovementAnalysis";

export const metadata = {
  title: "Quality Improvement Trends • Program Insight Studio",
  description:
    "See how contracts perform year-over-year on CMS Part C & Part D Quality Improvement measures.",
};

export default function QualityImprovementPage() {
  return (
    <AppShell
      title="Part C & Part D Momentum"
      subtitle="See how contracts perform year-over-year on CMS Quality Improvement measures."
    >
      <QualityImprovementAnalysis />
    </AppShell>
  );
}
