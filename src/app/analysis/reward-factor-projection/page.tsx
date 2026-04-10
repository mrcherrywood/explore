import { Target } from "lucide-react";
import { DataPageNav } from "@/components/navigation/DataPageNav";
import { RewardFactorMethodology } from "@/components/analysis/RewardFactorMethodology";
import { RewardFactorOverview } from "@/components/analysis/RewardFactorOverview";
import { RewardFactorQICorrelation } from "@/components/analysis/RewardFactorQICorrelation";
import { RewardFactorBacktest } from "@/components/analysis/RewardFactorBacktest";

export const metadata = {
  title: "Reward Factor • Program Insight Studio",
  description: "CMS reward factor thresholds and per-contract analysis.",
};

export default function RewardFactorPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-10 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-violet-500/50 bg-violet-500/10 text-lg font-semibold">
                <Target className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-muted-foreground">Analysis</p>
                <h1 className="text-2xl font-semibold text-foreground">Reward Factor</h1>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString()}</div>
          </header>

          <main className="flex flex-1 flex-col gap-6 px-10 pb-10 pt-8">
            <RewardFactorMethodology />
            <RewardFactorOverview />
            <RewardFactorQICorrelation />
            <RewardFactorBacktest />
          </main>
        </div>
      </div>
    </div>
  );
}
