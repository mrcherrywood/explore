import { AppShell } from "@/components/layout/AppShell";
import { SummaryContent } from "@/components/summary/SummaryContent";

export const metadata = {
  title: "Contract Summary • Program Insight Studio",
  description:
    "View contract performance highlights and plan landscape details.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const yearParam = typeof params.year === "string" ? params.year : undefined;
  const contractIdParam =
    typeof params.contractId === "string" ? params.contractId : undefined;
  const parentOrgParam =
    typeof params.parentOrg === "string" ? params.parentOrg : undefined;

  return (
    <AppShell
      title="Contract Summary"
      subtitle="View contract performance highlights and plan landscape details."
    >
      <SummaryContent
        initialYear={yearParam}
        initialContractId={contractIdParam}
        initialParentOrg={parentOrgParam}
      />
    </AppShell>
  );
}
