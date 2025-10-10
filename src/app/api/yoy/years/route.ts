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
      // Get all contract IDs currently associated with this organization
      const { data: contractRows, error: contractError } = await supabase
        .from("ma_contracts")
        .select("contract_id")
        .eq("parent_organization", parentOrganization)
        .order("year", { ascending: false })
        .limit(5000);

      if (contractError) {
        throw new Error(contractError.message);
      }

      const contractIds = Array.from(
        new Set(
          (contractRows as Array<{ contract_id: string }> | null)?.map((row) =>
            (row.contract_id || "").trim().toUpperCase()
          ) ?? []
        ).values()
      ).filter((value) => value.length > 0);

      if (contractIds.length === 0) {
        return NextResponse.json({ years: [] });
      }

      const yearsWithData = new Set<number>();

      const { data: metricYearRows, error: metricYearError } = await supabase
        .from("ma_metrics")
        .select("year")
        .in("contract_id", contractIds)
        .order("year", { ascending: false })
        .limit(5000);

      if (metricYearError) {
        throw new Error(metricYearError.message);
      }

      (metricYearRows as Array<{ year: number | null }> | null)?.forEach((row) => {
        if (typeof row.year === "number") {
          yearsWithData.add(row.year);
        }
      });

      const { data: ratingYearRows, error: ratingYearError } = await supabase
        .from("summary_ratings")
        .select("year")
        .in("contract_id", contractIds)
        .order("year", { ascending: false })
        .limit(5000);

      if (ratingYearError) {
        throw new Error(ratingYearError.message);
      }

      (ratingYearRows as Array<{ year: number | null }> | null)?.forEach((row) => {
        if (typeof row.year === "number") {
          yearsWithData.add(row.year);
        }
      });

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
