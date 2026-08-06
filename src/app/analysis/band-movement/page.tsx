import { AppShell } from "@/components/layout/AppShell";
import { BandMovementAnalysis } from "@/components/analysis/BandMovementAnalysis";

export const metadata = {
  title: "Band Movement Analysis · Program Insight Studio",
  description:
    "Track how contracts within a star rating band perform year-over-year and how that relates to cut point changes.",
};

export default function BandMovementPage() {
  return (
    <AppShell
      title="Band Movement Analysis"
      subtitle="Track how contracts move between star bands year-over-year and how that relates to cut point changes."
    >
      <BandMovementAnalysis />
    </AppShell>
  );
}
