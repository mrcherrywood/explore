import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { deletePlanPreviewYear } from "@/lib/plan-preview/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const body = await request.json().catch(() => ({}));
    const starsYearValue = Number(body.starsYear);
    if (!Number.isFinite(starsYearValue) || starsYearValue < 2020 || starsYearValue > 2100) {
      return NextResponse.json({ error: "A valid stars year is required." }, { status: 400 });
    }
    const starsYear = Math.round(starsYearValue);

    const deletedBatches = await deletePlanPreviewYear(admin.serviceClient, starsYear);

    return NextResponse.json({ starsYear, deletedBatches });
  } catch (error) {
    console.error("Failed to clear plan preview data", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to clear plan preview data",
      },
      { status: 500 }
    );
  }
}
