import { AppShell } from "@/components/layout/AppShell";
import { UHCComparisonContent } from "@/components/uhc-comparison/UHCComparisonContent";

export const metadata = {
  title: "UnitedHealth vs Market • Program Insight Studio",
  description:
    "Compare UnitedHealth's star distribution against the rest of the marketplace.",
};

export default function UHCComparisonPage() {
  return (
    <AppShell
      title="UnitedHealth vs Market"
      subtitle="Compare UnitedHealth's star distribution against the rest of the marketplace."
    >
      <UHCComparisonContent />
    </AppShell>
  );
}
