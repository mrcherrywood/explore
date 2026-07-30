import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { getPlanPreviewRun } from "@/lib/plan-preview/run-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const url = new URL(request.url);
    const starsYear = Math.round(Number(url.searchParams.get("starsYear")));
    const contractId = url.searchParams.get("contractId");

    if (!Number.isFinite(starsYear) || starsYear <= 0) {
      return NextResponse.json({ error: "A valid stars year is required." }, { status: 400 });
    }

    const { result, scenarios } = await getPlanPreviewRun(admin.serviceClient, starsYear);

    // Per-contract measure detail is only returned for the requested contract
    // to keep the payload manageable as market coverage accrues.
    const contracts = result.contracts.map(({ measures: _measures, ...summary }) => summary);
    const contractDetail = contractId
      ? result.contracts.find((contract) => contract.contractId === contractId) ?? null
      : null;

    return NextResponse.json({
      starsYear: result.starsYear,
      baselineYear: result.baselineYear,
      generatedAt: result.generatedAt,
      summary: result.summary,
      cutPoints: result.cutPoints,
      contracts,
      contractDetail,
      scenarios,
    });
  } catch (error) {
    console.error("Failed to build plan preview predictions", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to build plan preview predictions",
      },
      { status: 500 }
    );
  }
}
