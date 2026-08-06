import { AppShell } from "@/components/layout/AppShell";
import { ConditionGroupsBuilder } from "@/components/condition-groups/ConditionGroupsBuilder";

export const metadata = {
  title: "Condition Groups • Program Insight Studio",
  description:
    "Analyze weighted performance scores across Diabetes, Cardiovascular, and Care Transitions measure groups.",
};

export default function ConditionGroupsPage() {
  return (
    <AppShell
      title="Condition Group Performance"
      subtitle="Weighted performance across Diabetes, Cardiovascular, and Care Transitions measure groups."
    >
      <ConditionGroupsBuilder />
    </AppShell>
  );
}
