import { AppShell } from "@/components/layout/AppShell";
import { OperationsImpactAnalysis } from "@/components/analysis/OperationsImpactAnalysis";

export const metadata = {
  title: "Operations Measures Impact • Program Insight Studio",
  description:
    "Analyze the impact of removing operations measures from CMS Stars rating calculations.",
};

export default function OperationsImpactPage() {
  return (
    <AppShell
      title="Operations Measures Impact"
      subtitle="Projected impact of CMS 2027–2029 measure removals on overall star ratings and reward factors."
    >
      <div className="fep-banner-info">
        <p className="font-semibold">
          What-If Analysis: CMS 2027–2029 Measure Removals
        </p>
        <p className="mt-1 font-medium opacity-90">
          This analysis shows the projected impact on each plan&apos;s overall
          star rating based on CMS announcements to remove specific measures
          from the Stars rating calculation for 2027–2029. Measures include:
          Care for Older Adults Pain Assessment, Medication Reconciliation
          Post-Discharge, MTM, Appeals decisions, SNP Care Management, Call
          Center availability, Complaints, Price Accuracy, Statin Therapy,
          Disenrollment, Customer Service, and Rating of Health Care Quality.
          Reward factor thresholds also shift as the measure set changes.
        </p>
      </div>

      <OperationsImpactAnalysis />
    </AppShell>
  );
}
