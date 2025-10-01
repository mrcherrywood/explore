import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("YoY organizations API configuration error:", clientError);
      return NextResponse.json(
        {
          error: "Supabase credentials not configured",
          code: "SUPABASE_CONFIG_MISSING",
        },
        { status: 503 }
      );
    }

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

    // Get all parent organizations with contract counts
    const { data: orgData, error: orgError } = await supabase
      .from("ma_contracts")
      .select("parent_organization")
      .eq("year", latestYear)
      .not("parent_organization", "is", null);

    if (orgError) {
      throw new Error(orgError.message);
    }

    type OrgRow = {
      parent_organization: string | null;
    };

    // Count contracts per organization
    const orgCounts = new Map<string, number>();
    (orgData as OrgRow[] || []).forEach((row) => {
      if (row.parent_organization) {
        const org = row.parent_organization.trim();
        orgCounts.set(org, (orgCounts.get(org) || 0) + 1);
      }
    });

    const organizations = Array.from(orgCounts.entries())
      .filter(([, contract_count]) => contract_count > 1)
      .map(([parent_organization, contract_count]) => ({
        parent_organization,
        contract_count,
      }))
      .sort((a, b) => a.parent_organization.localeCompare(b.parent_organization));

    return NextResponse.json({ organizations });
  } catch (error) {
    console.error("YoY organizations API error:", error);
    return NextResponse.json(
      {
        error: "Failed to load organizations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
