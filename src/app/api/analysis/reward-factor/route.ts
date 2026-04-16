import { NextResponse } from "next/server";
import { getRewardFactorOverview, getAvailableBacktestYears } from "@/lib/reward-factor/backtest";
import {
  getMeasureRemovalForYear,
  isProjectedYear,
  getAllAvailableYears,
} from "@/lib/reward-factor/measure-removal-projection";
import type { RatingType } from "@/lib/reward-factor/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_RATING_TYPES = new Set<RatingType>(["overall_mapd", "part_c", "part_d_mapd", "part_d_pdp"]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year") ?? 2026);
    const ratingType = (searchParams.get("ratingType") ?? "overall_mapd") as RatingType;

    const backtestYears = getAvailableBacktestYears();
    const allYears = getAllAvailableYears(backtestYears);
    if (!allYears.includes(year)) {
      return NextResponse.json(
        { error: `Year ${year} not available. Available: ${allYears.join(", ")}` },
        { status: 400 },
      );
    }
    if (!VALID_RATING_TYPES.has(ratingType)) {
      return NextResponse.json(
        { error: `Invalid ratingType. Valid: ${[...VALID_RATING_TYPES].join(", ")}` },
        { status: 400 },
      );
    }

    const removal = getMeasureRemovalForYear(year);
    const result = removal
      ? getRewardFactorOverview(year, ratingType, removal.removedCodes, removal.sourceYear)
      : getRewardFactorOverview(year, ratingType);

    return NextResponse.json({
      ...result,
      isProjected: isProjectedYear(year),
      sourceYear: removal?.sourceYear ?? null,
      removedMeasures: removal?.removedMeasures ?? null,
      availableYears: allYears,
    });
  } catch (error) {
    console.error("Reward factor overview error:", error);
    return NextResponse.json(
      { error: "Failed to compute reward factor data", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    );
  }
}
