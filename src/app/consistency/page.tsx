import { AppShell } from "@/components/layout/AppShell";
import { ConsistencyBuilder } from "@/components/consistency/ConsistencyBuilder";

export const metadata = {
  title: "Scoring Consistency • Program Insight Studio",
  description:
    "Analyze year-over-year scoring consistency for Medicare Advantage contracts across all measures.",
};

export default function ConsistencyPage() {
  return (
    <AppShell
      title="Scoring Consistency Analysis"
      subtitle="See how consistently contracts keep, gain, or lose stars year over year."
    >
      <div className="space-y-2 text-sm text-muted-foreground text-pretty">
        <p>
          This page analyzes how consistently Medicare Advantage contracts
          maintain their star ratings year-over-year for each measure. Select a
          domain, measure, and star rating to see how many contracts kept,
          gained, or lost stars between consecutive years.
        </p>
        <p>
          The{" "}
          <strong className="text-foreground">
            Measure Volatility Leaderboard
          </strong>{" "}
          ranks measures by how often their star ratings change. Consistency
          rate = contracts that maintained the same rating ÷ total contracts
          with data in both years. Volatility rate = contracts that changed
          rating ÷ total contracts.
        </p>
      </div>
      <ConsistencyBuilder />
    </AppShell>
  );
}
