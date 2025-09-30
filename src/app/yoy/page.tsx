import { Calendar } from "lucide-react";
import { DataPageNav } from "@/components/navigation/DataPageNav";
import { YoYComparisonBuilder } from "@/components/yoy/YoYComparisonBuilder";

export const metadata = {
  title: "Year over Year Analysis • Program Insight Studio",
  description: "Analyze contract performance trends across multiple years.",
};

export default function YoYPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-10 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-lg font-semibold">
                <Calendar className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-muted-foreground">Trend Analysis</p>
                <h1 className="text-2xl font-semibold text-foreground">Year over Year Performance</h1>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{new Date().toLocaleString()}</div>
          </header>

          <main className="flex flex-1 flex-col gap-6 px-10 pb-10 pt-8">
            <YoYComparisonBuilder />
          </main>
        </div>
      </div>
    </div>
  );
}
