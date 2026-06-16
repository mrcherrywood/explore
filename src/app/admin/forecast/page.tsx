import { Sparkles } from "lucide-react";

import { CutPointForecastAdmin } from "@/components/admin/CutPointForecastAdmin";
import { DataPageNav } from "@/components/navigation/DataPageNav";

export const metadata = {
  title: "Forecast Admin • Program Insight Studio",
  description: "Import glidepath data, edit year-end projections, and approve cut-point forecast runs.",
};

export default function ForecastAdminPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <DataPageNav />
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border px-10 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-sky-500/50 bg-sky-500/10 text-lg font-semibold">
                <Sparkles className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-muted-foreground">
                  Admin
                </p>
                <h1 className="text-2xl font-semibold text-foreground">
                  Future Cut-Point Forecasts
                </h1>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date().toLocaleString()}
            </div>
          </header>

          <main className="flex flex-1 flex-col gap-6 px-10 pb-10 pt-8">
            <CutPointForecastAdmin />
          </main>
        </div>
      </div>
    </div>
  );
}
