import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { buildCloverRemovalReport } from "@/lib/plan-preview/clover-removal-report-data";
import { loadOfficialMeasureCatalog } from "@/lib/plan-preview/official-measure-catalog";
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
    const parentOrganization = (url.searchParams.get("parentOrganization") ?? "").trim();

    if (!Number.isFinite(starsYear) || starsYear <= 0) {
      return NextResponse.json({ error: "A valid stars year is required." }, { status: 400 });
    }
    if (!parentOrganization) {
      return NextResponse.json({ error: "A parent organization is required." }, { status: 400 });
    }

    const [marketOfficialStars, marketOfficialSummaries, catalog] = await Promise.all([
      getPlanPreviewOfficialStars(admin.serviceClient, starsYear),
      getPlanPreviewOfficialSummaries(admin.serviceClient, starsYear),
      loadOfficialMeasureCatalog(admin.serviceClient, starsYear),
    ]);

    let predictions = null;
    try {
      const run = await getPlanPreviewRun(admin.serviceClient, starsYear);
      predictions = run.result;
    } catch {
      predictions = null;
    }

    const report = buildCloverRemovalReport({
      starsYear,
      parentOrganization,
      officialStars: marketOfficialStars,
      officialSummaries: marketOfficialSummaries,
      weightByCode: catalog.weightByCode,
      domainByCode: catalog.domainByCode,
      predictions,
    });

    return NextResponse.json(JSON.parse(JSON.stringify(report)));
  } catch (error) {
    console.error("Failed to build Stars 2026 Recalc 4-star path report", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to build the Stars 2026 Recalc 4-star path report",
      },
      { status: 500 },
    );
  }
}
