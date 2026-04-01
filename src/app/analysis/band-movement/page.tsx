import { ArrowUpDown } from "lucide-react";

import { BandMovementAnalysis } from "@/components/analysis/BandMovementAnalysis";
import { DataPageNav } from "@/components/navigation/DataPageNav";

export const metadata = {
  title: "Band Movement Analysis \u00B7 Program Insight Studio",
  description: "Track how contracts within a star rating band perform year-over-year and how that relates to cut point changes.",
};

export default function BandMovementPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-6 py-6 xl:px-10">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-sky-500/40 bg-sky-500/10 text-lg font-semibold">
                <ArrowUpDown className="h-5 w-5 text-sky-400" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-muted-foreground">Scenario Analysis</p>
                <h1 className="text-2xl font-semibold text-foreground">Band Movement Analysis</h1>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString()}</div>
          </header>

          <main className="flex min-w-0 flex-1 flex-col gap-6 px-6 pb-10 pt-8 xl:px-10">
            <BandMovementAnalysis />
          </main>
        </div>
      </div>
    </div>
  );
}
