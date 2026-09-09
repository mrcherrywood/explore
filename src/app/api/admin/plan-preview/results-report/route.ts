import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import {
  buildPlanPreviewResultsReport,
  publishedScoreFromForecast,
} from "@/lib/plan-preview/results-report-data";
import { getPlanPreviewRun } from "@/lib/plan-preview/run-cache";
import {
  getPlanPreviewOfficialStars,
  getPlanPreviewOfficialSummaries,
} from "@/lib/plan-preview/store-official";

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

    const [officialStars, officialSummaries] = await Promise.all([
      getPlanPreviewOfficialStars(admin.serviceClient, starsYear, contractId),
      getPlanPreviewOfficialSummaries(admin.serviceClient, starsYear, contractId),
    ]);
    if (officialStars.length === 0 && officialSummaries.length === 0) {
      return NextResponse.json(
        { error: `Contract ${contractId} has no Plan Preview 2 official results for Stars ${starsYear}.` },
        { status: 404 }
      );
    }

    const domainByCode = new Map<string, string>();
    const weightByCode = new Map<string, number>();
    const { data: measureRows } = await admin.serviceClient
      .from("ma_measures")
      .select("code, domain, weight")
      .eq("year", starsYear - 1);
    for (const row of (measureRows ?? []) as {
      code: string;
      domain: string | null;
      weight: number | null;
    }[]) {
      const code = row.code.toUpperCase();
      if (row.domain) domainByCode.set(code, row.domain);
      if (row.weight !== null && Number.isFinite(Number(row.weight))) {
        weightByCode.set(code, Number(row.weight));
      }
    }

    let predictions = null;
    let overallPredicted: number | null = null;
    let pp1Published = null;
    const overallUpside: number | null = null;
    try {
      const run = await getPlanPreviewRun(admin.serviceClient, starsYear);
      predictions = run.result;
      const score = run.forecastBaseline.contracts.find(
        (entry) => entry.contractId === contractId
      );
      overallPredicted = score?.finalRating ?? null;
      pp1Published = publishedScoreFromForecast(score);
    } catch {
      predictions = null;
    }

    const report = buildPlanPreviewResultsReport({
      starsYear,
      contractId,
      officialStars,
      officialSummaries,
      domainByCode,
      weightByCode,
      predictions,
      overallPredicted,
      overallUpside,
      pp1Published,
    });

    return NextResponse.json(JSON.parse(JSON.stringify(report)));
  } catch (error) {
    console.error("Failed to build plan preview 2 results report", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build plan preview 2 results report",
      },
      { status: 500 }
    );
  }
}
