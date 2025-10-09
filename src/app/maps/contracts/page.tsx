import { Globe2 } from "lucide-react";
import { DataPageNav } from "@/components/navigation/DataPageNav";
import { ContractsMapExplorer } from "@/components/maps/ContractsMapExplorer";

export const metadata = {
  title: "Maps • Program Insight Studio",
  description: "Explore contract performance within states using interactive geographic comparisons.",
};

export default function MapsContractsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-10 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-lg font-semibold">
                <Globe2 className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-muted-foreground">Maps</p>
                <h1 className="text-2xl font-semibold text-foreground">State-Level Contract Insights</h1>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Interactive cohort benchmarking</div>
          </header>

          <main className="flex flex-1 flex-col gap-6 px-10 pb-10 pt-8">
            <ContractsMapExplorer />
          </main>
        </div>
      </div>
    </div>
  );
}
