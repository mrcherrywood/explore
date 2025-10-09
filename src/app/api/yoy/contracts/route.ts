import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    type ContractRow = {
      contract_id: string;
      contract_name: string | null;
      organization_marketing_name: string | null;
    };

    const rows: ContractRow[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("ma_contracts")
        .select("contract_id, contract_name, organization_marketing_name")
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

    const uniqueContracts = Array.from(
      new Map(rows.map((row: ContractRow) => [row.contract_id, row])).values()
    );

    return NextResponse.json({ contracts: uniqueContracts });
  } catch (error) {
    console.error("YoY contracts API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch contracts",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
