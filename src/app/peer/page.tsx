import { AppShell } from "@/components/layout/AppShell";
import { PeerComparisonBuilder } from "@/components/peer/PeerComparisonBuilder";

export const metadata = {
  title: "Peer Comparison • Program Insight Studio",
  description:
    "Compare contract performance against peers by state, plan type, and enrollment level.",
};

export default function PeerPage() {
  return (
    <AppShell
      title="Peer Group Comparison"
      subtitle="Compare contract performance against peers by state, plan type, and enrollment level."
    >
      <PeerComparisonBuilder />
    </AppShell>
  );
}
