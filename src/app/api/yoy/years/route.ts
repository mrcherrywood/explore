import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contractId = typeof body?.contractId === "string" ? body.contractId.trim() : "";
    const parentOrganization = typeof body?.parentOrganization === "string" ? body.parentOrganization.trim() : "";

    if (!contractId && !parentOrganization) {
      return NextResponse.json({ error: "contractId or parentOrganization is required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    if (contractId) {
      // Get years where this contract has data
      const { data, error } = await supabase
        .from("summary_ratings")
        .select("year")
        .eq("contract_id", contractId)
        .order("year", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      const years = Array.from(new Set((data || []).map((d: { year: number }) => d.year))).sort(
        (a, b) => b - a
      );

      return NextResponse.json({ years });
    } else {
      // Get years where this organization has contracts with data
      // First get all contracts for this organization across all years
      const { data: contractData, error: contractError } = await supabase
        .from("ma_contracts")
        .select("contract_id, year")
        .eq("parent_organization", parentOrganization);

      if (contractError) {
        throw new Error(contractError.message);
      }

      type ContractRow = {
        contract_id: string;
        year: number;
      };

      const contractsByYear = new Map<number, string[]>();
      (contractData as ContractRow[] || []).forEach((row) => {
        if (!contractsByYear.has(row.year)) {
          contractsByYear.set(row.year, []);
        }
        contractsByYear.get(row.year)!.push(row.contract_id);
      });

      // Get years where at least one contract has metrics data
      const yearsWithData = new Set<number>();
      for (const [year, contractIds] of contractsByYear.entries()) {
        const { data: metricsData, error: metricsError } = await supabase
          .from("ma_metrics")
          .select("year")
          .in("contract_id", contractIds)
          .eq("year", year)
          .limit(1);

        if (!metricsError && metricsData && metricsData.length > 0) {
          yearsWithData.add(year);
        }
      }

      const years = Array.from(yearsWithData).sort((a, b) => b - a);
      return NextResponse.json({ years });
    }
  } catch (error) {
    console.error("YoY years API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch years",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
