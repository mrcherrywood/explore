import { NextResponse } from "next/server";
import { analyzeCloverImpact } from "@/lib/clover-impact/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(analyzeCloverImpact());
  } catch (error) {
    console.error("Clover impact analysis error:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze Clover scenario impact",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
