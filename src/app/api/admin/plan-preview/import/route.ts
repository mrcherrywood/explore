import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import {
  createPlanPreviewBatch,
  upsertPlanPreviewCai,
  upsertPlanPreviewMeasureScores,
} from "@/lib/plan-preview/store";
import { parsePlanPreviewWorkbook } from "@/lib/plan-preview/workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const formData = await request.formData();
    const file = formData.get("file");
    const starsYearValue = Number(formData.get("starsYear"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A .xlsx file is required." }, { status: 400 });
    }
    if (!Number.isFinite(starsYearValue) || starsYearValue < 2020 || starsYearValue > 2100) {
      return NextResponse.json({ error: "A valid stars year is required." }, { status: 400 });
    }
    // The selected stars year is authoritative; the year printed in the file
    // title is surfaced for transparency (sample/mock files can carry a
    // prior-year layout title).
    const starsYear = Math.round(starsYearValue);

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parsePlanPreviewWorkbook(buffer);

    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: "No contract rows could be parsed from the file." },
        { status: 400 }
      );
    }

    const batch = await createPlanPreviewBatch(admin.serviceClient, {
      fileName: file.name,
      fileType: parsed.fileType,
      starsYear,
      sourceSheet: parsed.sheetName,
      detectedStarsYear: parsed.detectedStarsYear,
      rowCount: parsed.summary.rowCount,
      contractCount: parsed.summary.contractCount,
      measureCount: parsed.fileType === "measure_data" ? parsed.summary.measureCount : 0,
      importedBy: admin.userId,
    });

    if (parsed.fileType === "measure_data") {
      await upsertPlanPreviewMeasureScores(admin.serviceClient, {
        batchId: batch.id,
        starsYear,
        rows: parsed.rows,
      });
    } else {
      await upsertPlanPreviewCai(admin.serviceClient, {
        batchId: batch.id,
        starsYear,
        rows: parsed.rows,
      });
    }

    const yearMismatch =
      parsed.detectedStarsYear !== null && parsed.detectedStarsYear !== starsYear
        ? `The file title says CY ${parsed.detectedStarsYear} but the upload was saved under Stars ${starsYear}.`
        : null;

    return NextResponse.json({
      batch,
      summary: { ...parsed.summary, fileType: parsed.fileType, starsYear },
      warning: yearMismatch,
    });
  } catch (error) {
    console.error("Failed to import plan preview workbook", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to import plan preview workbook",
      },
      { status: 500 }
    );
  }
}
