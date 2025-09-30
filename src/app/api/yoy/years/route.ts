import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contractId = typeof body?.contractId === "string" ? body.contractId.trim() : "";

    if (!contractId) {
      return NextResponse.json({ error: "contractId is required" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

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
