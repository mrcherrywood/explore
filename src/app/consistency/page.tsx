import { ActivitySquare } from "lucide-react";
import { DataPageNav } from "@/components/navigation/DataPageNav";
import { ConsistencyBuilder } from "@/components/consistency/ConsistencyBuilder";

export const metadata = {
  title: "Scoring Consistency • Program Insight Studio",
  description: "Analyze year-over-year scoring consistency for Medicare Advantage contracts across all measures.",
};

export default function ConsistencyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-10 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-lg font-semibold">
                <ActivitySquare className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-muted-foreground">Consistency</p>
                <h1 className="text-2xl font-semibold text-foreground">Scoring Consistency Analysis</h1>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString()}</div>
          </header>

          <main className="flex flex-1 flex-col gap-6 px-10 pb-10 pt-8">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                This page analyzes how consistently Medicare Advantage contracts maintain their star ratings year-over-year for each measure. 
                Select a domain, measure, and star rating to see how many contracts kept, gained, or lost stars between consecutive years.
              </p>
              <p>
                The <strong>Measure Volatility Leaderboard</strong> ranks measures by how often their star ratings change. 
                Consistency rate = contracts that maintained the same rating ÷ total contracts with data in both years. 
                Volatility rate = contracts that changed rating ÷ total contracts.
              </p>
            </div>
            <ConsistencyBuilder />
          </main>
        </div>
      </div>
    </div>
  );
}
