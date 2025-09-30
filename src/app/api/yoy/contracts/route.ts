import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from("ma_contracts")
      .select("contract_id, contract_name, organization_marketing_name")
      .order("contract_id", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    type ContractRow = {
      contract_id: string;
      contract_name: string | null;
      organization_marketing_name: string | null;
    };

    const uniqueContracts = Array.from(
      new Map((data ?? []).map((row: ContractRow) => [row.contract_id, row])).values()
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
