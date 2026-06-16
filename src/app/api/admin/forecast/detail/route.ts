import { NextRequest, NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { getForecastProjectionDetail } from "@/lib/cutpoint-forecast/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId") ?? "";
    const contractId = searchParams.get("contractId") ?? "";
    const measureNormalized = searchParams.get("measureNormalized") ?? "";

    if (!runId || !contractId || !measureNormalized) {
      return NextResponse.json(
        { error: "runId, contractId, and measureNormalized are required." },
        { status: 400 }
      );
    }

    const detail = await getForecastProjectionDetail(admin.serviceClient, {
      runId,
      contractId,
      measureNormalized,
    });

    if (!detail) {
      return NextResponse.json({ error: "Projection detail not found." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    console.error("Failed to load forecast projection detail", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load forecast projection detail",
      },
      { status: 500 }
    );
  }
}
