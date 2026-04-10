import { NextResponse } from "next/server";
import { runBacktest, getAvailableBacktestYears } from "@/lib/reward-factor/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? Number.parseInt(yearParam, 10) : 2026;

    const available = getAvailableBacktestYears();
    if (!available.includes(year)) {
      return NextResponse.json(
        { error: `Year ${year} not available. Available years: ${available.join(", ")}` },
        { status: 400 }
      );
    }

    const result = runBacktest(year);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Reward factor backtest error:", error);
    return NextResponse.json(
      { error: "Failed to run backtest", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
