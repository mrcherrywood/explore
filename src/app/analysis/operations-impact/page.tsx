import { AlertTriangle } from "lucide-react";
import { DataPageNav } from "@/components/navigation/DataPageNav";
import { OperationsImpactAnalysis } from "@/components/analysis/OperationsImpactAnalysis";

export const metadata = {
  title: "Operations Measures Impact • Program Insight Studio",
  description: "Analyze the impact of removing operations measures from CMS Stars rating calculations.",
};

export default function OperationsImpactPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-10 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/10 text-lg font-semibold">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-muted-foreground">Scenario Analysis</p>
                <h1 className="text-2xl font-semibold text-foreground">Operations Measures Impact</h1>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString()}</div>
          </header>

          <main className="flex flex-1 flex-col gap-6 px-10 pb-10 pt-8">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <h2 className="text-sm font-semibold text-amber-400">What-If Analysis: CMS 2028-2029 Measure Removals</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This analysis shows the projected impact on each plan&apos;s overall star rating based on CMS announcements
                    to remove specific measures from the Stars rating calculation for 2028-2029. Measures include: Appeals decisions,
                    SNP Care Management, Call Center availability, Complaints, Price Accuracy, Diabetes Eye Exam, Statin Therapy,
                    Disenrollment, Customer Service, and Rating of Health Care Quality.
                  </p>
                </div>
              </div>
            </div>

            <OperationsImpactAnalysis />
          </main>
        </div>
      </div>
    </div>
  );
}

