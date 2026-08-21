import { AppShell } from "@/components/layout/AppShell";
import { StarDistributionAnalysis } from "@/components/analysis/StarDistributionAnalysis";

export const metadata = {
  title: "Book vs CMS · Program Insight Studio",
  description:
    "Compare star mix or average measure scores for our book against the full CMS H+R market.",
};

export default function StarDistributionPage() {
  return (
    <AppShell
      title="Book vs CMS"
      subtitle="Compare star mix or average scores for our book versus the full CMS H+R market — for any measure and year."
    >
      <StarDistributionAnalysis />
    </AppShell>
  );
}
