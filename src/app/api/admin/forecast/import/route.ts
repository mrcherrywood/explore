import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import {
  aggregateCahpsSurvey,
  buildCahpsProjections,
  cahpsReportingYearToForecastYear,
  parseCahpsSurveyBuffer,
} from "@/lib/cutpoint-forecast/cahps-survey";
import { getAvailableMeasureYears } from "@/lib/band-movement/analysis";
import { isEligibleForecastContract } from "@/lib/cutpoint-forecast/analysis";
import { buildGlidepathProjections } from "@/lib/cutpoint-forecast/glidepath";
import { pickForecastBookRun } from "@/lib/cutpoint-forecast/book-run";
import {
  appendForecastRunNote,
  countForecastProjectionsForRun,
  createForecastImportBatch,
  createForecastProjectionRun,
  getForecastRun,
  insertForecastMonthlyHistory,
  insertForecastProjections,
  listForecastProjectionRuns,
  updateForecastRunProjectionCount,
} from "@/lib/cutpoint-forecast/store";
import { parseForecastWorkbook } from "@/lib/cutpoint-forecast/workbook";
import type {
  ForecastDatasetType,
  ForecastProjectionRunRecord,
  GlidepathProjection,
  ImportedMonthlyMeasureRow,
} from "@/lib/cutpoint-forecast/types";
import { createServiceRoleClient } from "@/lib/supabase/server";

// CMS has already published official Star Ratings through the latest year in our
// reference data, so we never forecast (or overwrite) those years. Only stars
// years beyond the latest published year are forecastable.
function getLatestPublishedStarsYear(): number {
  const years = getAvailableMeasureYears();
  return years.length > 0 ? Math.max(...years) : new Date().getFullYear();
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const formData = await request.formData();
    const file = formData.get("file");
    const forecastYearValue = Number(formData.get("forecastYear"));
    const datasetType: ForecastDatasetType =
      formData.get("datasetType") === "cahps" ? "cahps" : "non_cahps";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A .xlsx or .csv file is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (datasetType === "cahps") {
      return await importCahps(admin.serviceClient, admin.userId, file, buffer, forecastYearValue);
    }

    const parsed = parseForecastWorkbook(buffer);

    // Each unpublished stars year in the file (e.g. SY2027, SY2028) accrues onto
    // that year's book run. Published years (SY2026 and earlier) are left
    // untouched since CMS has already released official results for them.
    const latestPublishedStarsYear = getLatestPublishedStarsYear();
    const forecastableYears = Array.from(
      new Set(parsed.rows.map((row) => row.year))
    )
      .filter((year) => year > latestPublishedStarsYear)
      .sort((a, b) => a - b);

    if (forecastableYears.length === 0) {
      return NextResponse.json(
        {
          error: `No unpublished stars years found to forecast. CMS has published official results through SY${latestPublishedStarsYear}; the file must include scores for SY${latestPublishedStarsYear + 1} or later.`,
        },
        { status: 400 }
      );
    }

    const batch = await createForecastImportBatch(admin.serviceClient, {
      fileName: file.name,
      forecastYear: forecastableYears[forecastableYears.length - 1],
      rowCount: parsed.summary.rowCount,
      contractCount: parsed.summary.contractCount,
      measureCount: parsed.summary.measureCount,
      sourceSheet: parsed.sheetName,
      latestObservedYear: parsed.summary.latestObservedYear,
      latestObservedMonth: parsed.summary.latestObservedMonth,
      importedBy: admin.userId,
    });

    await insertForecastMonthlyHistory(admin.serviceClient, batch.id, parsed.rows);

    const runs: ForecastProjectionRunRecord[] = [];
    const usedProjectedFinal = parsed.rows.some(
      (row) => row.projectedFinal != null && Number.isFinite(row.projectedFinal)
    );
    let existingRuns = await listForecastProjectionRuns(admin.serviceClient);
    const rememberRun = (saved: ForecastProjectionRunRecord) => {
      existingRuns = [
        ...existingRuns.filter((run) => run.id !== saved.id),
        saved,
      ];
      runs.push(saved);
    };
    for (const forecastYear of forecastableYears) {
      const projections = buildGlidepathProjections(parsed.rows, forecastYear).filter(
        (projection) =>
          isEligibleForecastContract(projection.contractId) &&
          // Only keep measures with actual observations in this stars year. A
          // run is generated per unpublished year, so without this a measure
          // lacking SY-year data would emit a carry-forward row that just echoes
          // an earlier stars year's final score. Projected Final-only series set
          // supportingPoints to 1 so they still qualify.
          projection.supportingPoints > 0
      );

      const nonCahpsProjections = projections.filter(
        (projection) => projection.measureType !== "cahps"
      );
      const cahpsProjections = projections.filter(
        (projection) => projection.measureType === "cahps"
      );

      if (nonCahpsProjections.length > 0) {
        const note = usedProjectedFinal
          ? `Imported from ${file.name} (SY${forecastYear}); year-end rates from Projected Final where provided.`
          : `Imported from ${file.name} (SY${forecastYear})`;
        rememberRun(
          await saveProjectionsOntoRun(admin.serviceClient, {
            existingRuns,
            historyRows: parsed.rows,
            forecastYear,
            datasetType: "non_cahps",
            sourceBatchId: batch.id,
            asOfYear: parsed.summary.latestObservedYear,
            asOfMonth: parsed.summary.latestObservedMonth,
            projections: nonCahpsProjections,
            importedBy: admin.userId,
            notes: note,
            mergeNote: `Added ${file.name} (${nonCahpsProjections.length} contract-measure rows merged).`,
          })
        );
      }

      if (cahpsProjections.length > 0) {
        rememberRun(
          await saveProjectionsOntoRun(admin.serviceClient, {
            existingRuns,
            historyRows: parsed.rows,
            forecastYear,
            datasetType: "cahps",
            sourceBatchId: batch.id,
            asOfYear: parsed.summary.latestObservedYear,
            asOfMonth: parsed.summary.latestObservedMonth,
            projections: cahpsProjections,
            importedBy: admin.userId,
            modelVersion: "projected-final-v1",
            notes: `Imported CAHPS year-end rates from Projected Final in ${file.name} (SY${forecastYear}).`,
            mergeNote: `Added ${file.name} (${cahpsProjections.length} CAHPS contract-measure rows merged).`,
          })
        );
      }
    }

    return NextResponse.json({
      batch,
      runs,
      summary: {
        ...parsed.summary,
        forecastYears: forecastableYears,
        runCount: runs.length,
        skippedPublishedThrough: latestPublishedStarsYear,
      },
    });
  } catch (error) {
    console.error("Failed to import forecast workbook", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to import forecast workbook",
      },
      { status: 500 }
    );
  }
}

type AdminServiceClient = ReturnType<typeof createServiceRoleClient>;

async function importCahps(
  serviceClient: AdminServiceClient,
  userId: string,
  file: File,
  buffer: Buffer,
  forecastYearValue: number
) {
  const rawRows = parseCahpsSurveyBuffer(buffer);
  const rates = aggregateCahpsSurvey(rawRows);

  if (rates.length === 0) {
    return NextResponse.json(
      { error: "No CAHPS measure rates could be derived from the file." },
      { status: 400 }
    );
  }

  const projections = buildCahpsProjections(rates).filter((projection) =>
    isEligibleForecastContract(projection.contractId)
  );
  const reportingYear = rates.find((rate) => rate.reportingYear !== null)?.reportingYear ?? null;
  const latestSurveyWeek = rates.reduce((max, rate) => Math.max(max, rate.latestSurveyWeek), 0);
  // Runs are keyed by stars year. CAHPS reporting year is 1 behind the stars
  // year, so add one to line up with the non-CAHPS run for the same stars year.
  // The file's reporting year is authoritative (the offset is non-obvious); the
  // UI value is only a fallback when the file lacks one.
  const forecastYear =
    reportingYear !== null
      ? cahpsReportingYearToForecastYear(reportingYear)
      : Number.isFinite(forecastYearValue)
        ? Math.round(forecastYearValue)
        : new Date().getFullYear();

  const contractCount = new Set(rates.map((rate) => rate.contractId)).size;
  const measureCount = new Set(rates.map((rate) => rate.measureNormalized)).size;

  const batch = await createForecastImportBatch(serviceClient, {
    fileName: file.name,
    forecastYear,
    rowCount: rates.length,
    contractCount,
    measureCount,
    sourceSheet: "CAHPS survey",
    latestObservedYear: reportingYear,
    latestObservedMonth: latestSurveyWeek || null,
    importedBy: userId,
  });

  const existingRuns = await listForecastProjectionRuns(serviceClient);
  const run = await saveProjectionsOntoRun(serviceClient, {
    existingRuns,
    forecastYear,
    datasetType: "cahps",
    sourceBatchId: batch.id,
    asOfYear: reportingYear,
    asOfMonth: latestSurveyWeek || null,
    projections,
    importedBy: userId,
    modelVersion: "cahps-survey-v1",
    notes: `Imported CAHPS survey from ${file.name} (through week ${latestSurveyWeek}).`,
    mergeNote: `Added ${file.name} (${projections.length} CAHPS contract-measure rows merged).`,
  });

  return NextResponse.json({
    batch,
    runs: [run],
    summary: {
      rowCount: rates.length,
      contractCount,
      measureCount,
      forecastYears: [forecastYear],
      runCount: 1,
      latestObservedYear: reportingYear,
      latestObservedMonth: latestSurveyWeek || null,
      projectionCount: run.projectionCount,
    },
  });
}

/**
 * Land projections on the stars year's book run so the forecast always reflects
 * the newest data. A new run is created only when the year has none yet.
 */
async function saveProjectionsOntoRun(
  serviceClient: AdminServiceClient,
  input: {
    existingRuns: ForecastProjectionRunRecord[];
    historyRows?: ImportedMonthlyMeasureRow[];
    forecastYear: number;
    datasetType: ForecastDatasetType;
    sourceBatchId: string;
    asOfYear: number | null;
    asOfMonth: number | null;
    projections: GlidepathProjection[];
    importedBy: string | null;
    modelVersion?: string;
    notes: string;
    mergeNote: string;
  }
): Promise<ForecastProjectionRunRecord> {
  const candidates = input.existingRuns.filter(
    (run) => run.forecastYear === input.forecastYear && run.datasetType === input.datasetType
  );
  const mergeTarget = pickForecastBookRun(candidates);

  if (!mergeTarget) {
    return createAndInsertRun(serviceClient, input);
  }

  if (input.historyRows?.length && mergeTarget.sourceBatchId) {
    await insertForecastMonthlyHistory(
      serviceClient,
      mergeTarget.sourceBatchId,
      input.historyRows
    );
  }

  await insertForecastProjections(serviceClient, {
    runId: mergeTarget.id,
    forecastYear: input.forecastYear,
    projections: input.projections,
    updatedBy: input.importedBy,
  });
  const projectionCount = await countForecastProjectionsForRun(
    serviceClient,
    mergeTarget.id
  );
  await updateForecastRunProjectionCount(serviceClient, mergeTarget.id, projectionCount);
  await appendForecastRunNote(serviceClient, mergeTarget.id, input.mergeNote);
  const merged = await getForecastRun(serviceClient, mergeTarget.id);
  if (!merged) throw new Error("Failed to reload merged forecast run.");
  return merged;
}

async function createAndInsertRun(
  serviceClient: AdminServiceClient,
  input: {
    forecastYear: number;
    datasetType: ForecastDatasetType;
    sourceBatchId: string;
    asOfYear: number | null;
    asOfMonth: number | null;
    projections: GlidepathProjection[];
    importedBy: string | null;
    modelVersion?: string;
    notes: string;
  }
): Promise<ForecastProjectionRunRecord> {
  const run = await createForecastProjectionRun(serviceClient, {
    sourceBatchId: input.sourceBatchId,
    forecastYear: input.forecastYear,
    datasetType: input.datasetType,
    asOfYear: input.asOfYear,
    asOfMonth: input.asOfMonth,
    projectionCount: input.projections.length,
    importedBy: input.importedBy,
    modelVersion: input.modelVersion,
    notes: input.notes,
  });
  await insertForecastProjections(serviceClient, {
    runId: run.id,
    forecastYear: input.forecastYear,
    projections: input.projections,
    updatedBy: input.importedBy,
  });
  return run;
}
