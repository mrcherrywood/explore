import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { getAvailableMeasureYears } from "@/lib/band-movement/analysis";
import {
  getPlanPreviewAccrualSummary,
  listPlanPreviewBatches,
  listPlanPreviewStarsYears,
} from "@/lib/plan-preview/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function defaultStarsYear(): number {
  const years = getAvailableMeasureYears();
  const latestPublished = years.length > 0 ? Math.max(...years) : new Date().getFullYear();
  return latestPublished + 1;
}

export async function GET(request: Request) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const url = new URL(request.url);
    const starsYearParam = Number(url.searchParams.get("starsYear"));

    const uploadedYears = await listPlanPreviewStarsYears(admin.serviceClient);
    const starsYear = Number.isFinite(starsYearParam) && starsYearParam > 0
      ? Math.round(starsYearParam)
      : uploadedYears[0] ?? defaultStarsYear();

    const starsYears = [...new Set([defaultStarsYear(), defaultStarsYear() + 1, ...uploadedYears])].sort(
      (a, b) => b - a
    );

    const [batches, accrual] = await Promise.all([
      listPlanPreviewBatches(admin.serviceClient, starsYear),
      getPlanPreviewAccrualSummary(admin.serviceClient, starsYear),
    ]);

    return NextResponse.json({ starsYear, starsYears, batches, accrual });
  } catch (error) {
    console.error("Failed to load plan preview overview", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load plan preview overview",
      },
      { status: 500 }
    );
  }
}
