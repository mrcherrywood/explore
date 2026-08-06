import { AppShell } from "@/components/layout/AppShell";
import { LeaderboardBuilder } from "@/components/leaderboard/LeaderboardBuilder";

export const metadata = {
  title: "Leaderboard • Program Insight Studio",
  description:
    "Explore top-performing contracts and parent organizations across Medicare Advantage metrics.",
};

export default function LeaderboardPage() {
  return (
    <AppShell
      title="Top Performers & Movers"
      subtitle="Explore top-performing contracts and parent organizations across Medicare Advantage metrics."
    >
      <LeaderboardBuilder />
    </AppShell>
  );
}
