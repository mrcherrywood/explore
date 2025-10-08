import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    // Get the latest year from ma_contracts
    const { data: yearData, error: yearError } = await supabase
      .from("ma_contracts")
      .select("year")
      .order("year", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (yearError) {
      throw new Error(yearError.message);
    }

    const latestYear = (yearData as { year: number } | null)?.year ?? new Date().getFullYear();

    // Get all contracts with parent organizations for the latest year only
    const { data, error } = await supabase
      .from("ma_contracts")
      .select("parent_organization, contract_id, snp_indicator, is_blue_cross_blue_shield")
      .eq("year", latestYear)
      .not("parent_organization", "is", null)
      .order("parent_organization", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    type ContractRow = {
      parent_organization: string | null;
      contract_id: string;
      snp_indicator: string | null;
      is_blue_cross_blue_shield: boolean | null;
    };

    const rows = (data ?? []) as ContractRow[];

    // Get SNP status from plan landscape
    const contractIds = rows.map(r => r.contract_id);

    type PlanRow = {
      contract_id: string;
      plan_type: string | null;
      special_needs_plan_indicator: string | null;
    };

    const { data: planData } = await supabase
      .from("ma_plan_landscape")
      .select("contract_id, plan_type, special_needs_plan_indicator")
      .in("contract_id", contractIds);

    // Determine which contracts have SNP plans
    const snpContracts = new Set<string>();
    
    // First check contract-level snp_indicator
    rows.forEach((contract) => {
      const contractSnpIndicator = contract.snp_indicator || '';
      if (contractSnpIndicator.toLowerCase().startsWith('yes')) {
        snpContracts.add(contract.contract_id);
      }
    });
    
    // Then check plan-level indicators
    ((planData ?? []) as PlanRow[]).forEach((plan) => {
      const planType = plan.plan_type || '';
      const snpIndicator = plan.special_needs_plan_indicator || '';
      
      if (planType.toLowerCase().includes('snp') || snpIndicator.toLowerCase().startsWith('yes')) {
        snpContracts.add(plan.contract_id);
      }
    });

    // Group by parent organization
    const orgMap = new Map<string, { contractCount: number; hasSnpPlans: boolean; hasBlueContracts: boolean; blueCount: number }>();
    
    rows.forEach((row) => {
      const parentOrg = row.parent_organization;
      if (!parentOrg) return;
      
      const existing = orgMap.get(parentOrg);
      const hasSnp = snpContracts.has(row.contract_id);
      
      const isBlue = Boolean(row.is_blue_cross_blue_shield);

      if (existing) {
        existing.contractCount += 1;
        existing.hasSnpPlans = existing.hasSnpPlans || hasSnp;
        existing.hasBlueContracts = existing.hasBlueContracts || isBlue;
        if (isBlue) {
          existing.blueCount += 1;
        }
      } else {
        orgMap.set(parentOrg, {
          contractCount: 1,
          hasSnpPlans: hasSnp,
          hasBlueContracts: isBlue,
          blueCount: isBlue ? 1 : 0,
        });
      }
    });

    const organizations = Array.from(orgMap.entries())
      .map(([parent_organization, data]) => ({
        parent_organization,
        contract_count: data.contractCount,
        has_snp_plans: data.hasSnpPlans,
        has_blue_contracts: data.hasBlueContracts,
        blue_contract_count: data.blueCount,
      }))
      .filter(org => org.contract_count > 1) // Only include orgs with more than one contract
      .sort((a, b) => a.parent_organization.localeCompare(b.parent_organization));

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("Peer organizations API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch organizations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
