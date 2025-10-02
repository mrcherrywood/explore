import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    type ContractRow = Pick<Database["public"]["Tables"]["ma_contracts"]["Row"], "contract_id" | "contract_name" | "organization_marketing_name" | "snp_indicator">;

    const rows: ContractRow[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("ma_contracts")
        .select("contract_id, contract_name, organization_marketing_name, snp_indicator")
        .order("contract_id", { ascending: true })
        .order("organization_marketing_name", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        throw new Error(error.message);
      }

      const batch = (data ?? []) as ContractRow[];
      rows.push(...batch);
      hasMore = batch.length === pageSize;
      page += 1;
    }

    // Get SNP status from plan landscape by checking plan_type
    const { data: planData } = await supabase
      .from("ma_plan_landscape")
      .select("contract_id, plan_type, special_needs_plan_indicator")
      .in("contract_id", rows.map(r => r.contract_id));

    type PlanRow = Pick<Database["public"]["Tables"]["ma_plan_landscape"]["Row"], "contract_id" | "plan_type" | "special_needs_plan_indicator">;

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
      
      // Check if plan_type contains SNP indicators (D-SNP, I-SNP, C-SNP) OR special_needs_plan_indicator starts with 'yes'
      if (planType.toLowerCase().includes('snp') || snpIndicator.toLowerCase().startsWith('yes')) {
        snpContracts.add(plan.contract_id);
      }
    });

    const uniqueContracts = Array.from(new Map(rows.map((row) => [row.contract_id, row])).values()).map((row) => ({
      contract_id: row.contract_id,
      contract_name: row.contract_name,
      organization_marketing_name: row.organization_marketing_name,
      has_snp_plans: snpContracts.has(row.contract_id),
    }));

    return NextResponse.json({ contracts: uniqueContracts });
  } catch (error) {
    console.error("Peer contracts API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch contracts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
