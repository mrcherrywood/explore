import { AppShell } from "@/components/layout/AppShell";
import { YoYComparisonBuilder } from "@/components/yoy/YoYComparisonBuilder";

export const metadata = {
  title: "Year over Year Analysis • Program Insight Studio",
  description: "Analyze contract performance trends across multiple years.",
};

export default function YoYPage() {
  return (
    <AppShell
      title="Year over Year Performance"
      subtitle="Analyze contract performance trends across multiple years."
    >
      <YoYComparisonBuilder />
    </AppShell>
  );
}
