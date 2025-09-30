import { Users } from "lucide-react";
import { DataPageNav } from "@/components/navigation/DataPageNav";
import { PeerComparisonBuilder } from "@/components/peer/PeerComparisonBuilder";

export const metadata = {
  title: "Peer Comparison • Program Insight Studio",
  description: "Compare contract performance against peers by state, plan type, and enrollment level.",
};

export default function PeerPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-10 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-lg font-semibold">
                <Users className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-muted-foreground">Peer Insights</p>
                <h1 className="text-2xl font-semibold text-foreground">Peer Group Comparison</h1>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString()}</div>
          </header>

          <main className="flex flex-1 flex-col gap-6 px-10 pb-10 pt-8">
            <PeerComparisonBuilder />
          </main>
        </div>
      </div>
    </div>
  );
}
