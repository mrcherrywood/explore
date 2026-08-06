import { AppShell } from "@/components/layout/AppShell";
import { AnalyticsPageContent } from "@/components/analytics/AnalyticsPageContent";

export const metadata = {
  title: "AI Analytics • Program Insight Studio",
  description: "Compare any variables across your Medicare Advantage data.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const contractsParam = params.contracts;
  const measuresParam = params.measures;
  const yearsParam = params.years;

  const selectedContracts =
    typeof contractsParam === "string"
      ? contractsParam.split(",").filter(Boolean)
      : [];
  const selectedMeasures =
    typeof measuresParam === "string"
      ? measuresParam.split(",").filter(Boolean)
      : [];
  const selectedYears =
    typeof yearsParam === "string" ? yearsParam.split(",").filter(Boolean) : [];

  return (
    <AppShell
      title="Performance Comparisons"
      subtitle="Compare any variables across your Medicare Advantage data."
    >
      <AnalyticsPageContent
        selectedContracts={selectedContracts}
        selectedMeasures={selectedMeasures}
        selectedYears={selectedYears}
      />
    </AppShell>
  );
}
