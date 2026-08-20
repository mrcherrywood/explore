import { NextRequest, NextResponse } from "next/server";

import { analyzeStarDistribution } from "@/lib/star-distribution/analysis";
import { loadBookRoster, rosterIdsForMode } from "@/lib/star-distribution/roster";
import type { RosterMode } from "@/lib/star-distribution/types";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRoster(value: string | null): RosterMode {
  if (value === "forecast" || value === "pp1" || value === "combined") return value;
  return "combined";
}

export async function GET(request: NextRequest) {
  try {
    const roster = parseRoster(request.nextUrl.searchParams.get("roster"));
    const book = await loadBookRoster(createServiceRoleClient());
    return NextResponse.json(
      analyzeStarDistribution(rosterIdsForMode(book, roster), roster, book.inventory, {
        forecast: book.forecast,
        pp1: book.pp1,
        parentById: book.parentById,
      }),
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (error) {
    console.error("Star distribution analysis error:", error);
    return NextResponse.json(
      {
        error: "Failed to compare book vs CMS star shares",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
