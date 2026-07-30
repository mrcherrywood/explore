import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { buildPlanPreviewContractReport } from "@/lib/plan-preview/report-data";
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
    const contractId = (url.searchParams.get("contractId") ?? "").trim().toUpperCase();

    if (!Number.isFinite(starsYear) || starsYear <= 0) {
      return NextResponse.json({ error: "A valid stars year is required." }, { status: 400 });
    }
    if (!contractId) {
      return NextResponse.json({ error: "A contract ID is required." }, { status: 400 });
    }

    const { result, scenarios } = await getPlanPreviewRun(admin.serviceClient, starsYear);
    const contract = result.contracts.find((entry) => entry.contractId === contractId);
    if (!contract) {
      return NextResponse.json(
        { error: `Contract ${contractId} has no accrued plan preview scores for Stars ${starsYear}.` },
        { status: 404 }
      );
    }

    const domainByCode = new Map<string, string>();
    if (result.baselineYear !== null) {
      const { data } = await admin.serviceClient
        .from("ma_measures")
        .select("code, domain")
        .eq("year", result.baselineYear);
      for (const row of (data ?? []) as { code: string; domain: string | null }[]) {
        if (row.domain) domainByCode.set(row.code.toUpperCase(), row.domain);
      }
    }

    const report = buildPlanPreviewContractReport({
      predictions: result,
      scenarios,
      contract,
      domainByCode,
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to build plan preview contract report", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build plan preview contract report",
      },
      { status: 500 }
    );
  }
}
