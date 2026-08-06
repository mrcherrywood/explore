import { AppShell } from "@/components/layout/AppShell";
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
    <AppShell
      title="Reward Factor"
      subtitle="CMS reward factor thresholds, per-contract qualification, and backtests."
    >
      <RewardFactorMethodology />
      <RewardFactorOverview />
      <RewardFactorQICorrelation />
      <RewardFactorBacktest />
    </AppShell>
  );
}
