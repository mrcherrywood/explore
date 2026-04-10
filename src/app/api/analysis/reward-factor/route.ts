import { NextResponse } from "next/server";
import { getRewardFactorOverview, getAvailableBacktestYears } from "@/lib/reward-factor/backtest";
import type { RatingType } from "@/lib/reward-factor/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_RATING_TYPES = new Set<RatingType>(["overall_mapd", "part_c", "part_d_mapd", "part_d_pdp"]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year") ?? 2026);
    const ratingType = (searchParams.get("ratingType") ?? "overall_mapd") as RatingType;

    const available = getAvailableBacktestYears();
    if (!available.includes(year)) {
      return NextResponse.json(
        { error: `Year ${year} not available. Available: ${available.join(", ")}` },
        { status: 400 },
      );
    }
    if (!VALID_RATING_TYPES.has(ratingType)) {
      return NextResponse.json(
        { error: `Invalid ratingType. Valid: ${[...VALID_RATING_TYPES].join(", ")}` },
        { status: 400 },
      );
    }

    const result = getRewardFactorOverview(year, ratingType);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Reward factor overview error:", error);
    return NextResponse.json(
      { error: "Failed to compute reward factor data", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}
