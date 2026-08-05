import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { buildMeasureDataExportWorkbook } from "@/lib/plan-preview/export-workbook";
import { getPlanPreviewExportRows } from "@/lib/plan-preview/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const url = new URL(request.url);
    const starsYearValue = Number(url.searchParams.get("starsYear"));
    if (!Number.isFinite(starsYearValue) || starsYearValue < 2020 || starsYearValue > 2100) {
      return NextResponse.json({ error: "A valid stars year is required." }, { status: 400 });
    }
    const starsYear = Math.round(starsYearValue);

    const rows = await getPlanPreviewExportRows(admin.serviceClient, starsYear);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: `No accrued measure scores for Stars ${starsYear}.` },
        { status: 404 }
      );
    }

    const buffer = buildMeasureDataExportWorkbook(starsYear, rows);
    const fileName = `SR_${starsYear}_measure_data_with_decimals.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to export plan preview measure data", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to export plan preview measure data",
      },
      { status: 500 }
    );
  }
}
