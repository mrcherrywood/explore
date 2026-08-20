import { AppShell } from "@/components/layout/AppShell";
import { StarDistributionAnalysis } from "@/components/analysis/StarDistributionAnalysis";

export const metadata = {
  title: "Book vs CMS Star Share · Program Insight Studio",
  description:
    "Compare the share of contracts at each measure star rating for our book against the full CMS H+R market.",
};

export default function StarDistributionPage() {
  return (
    <AppShell
      title="Book vs CMS Star Share"
      subtitle="See what share of our book landed at each star versus the full CMS H+R market — for any measure and year."
    >
      <StarDistributionAnalysis />
    </AppShell>
  );
}
