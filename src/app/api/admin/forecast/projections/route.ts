import { NextRequest, NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { isEligibleForecastContract } from "@/lib/cutpoint-forecast/analysis";
import { buildGlidepathProjections } from "@/lib/cutpoint-forecast/glidepath";
import {
  approveForecastMeasure,
  approveForecastRun,
  deleteForecastMeasureApprovalsForMeasures,
  deleteForecastMeasureApprovalsForRun,
  deleteForecastProjectionsForRun,
  getAllMonthlyHistoryForBatch,
  getAllForecastProjectionsForRun,
  getForecastProjectionsForRun,
  getForecastRun,
  getLatestForecastRunForYear,
  getPriorYearFinalScoresForProjections,
  insertForecastProjections,
  listForecastMeasureApprovals,
  listForecastProjectionRuns,
  updateForecastProjectionOverrides,
  updateForecastRunProjectionCount,
} from "@/lib/cutpoint-forecast/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ForecastServiceClient = Parameters<typeof getAllForecastProjectionsForRun>[0];

type MeasureYearOverYearSummary = {
  contractCount: number;
  withPriorYearCount: number;
  averagePriorYearScore: number | null;
  averageModelScore: number | null;
  averageFinalScore: number | null;
  averageFinalDelta: number | null;
  averageModelDelta: number | null;
  improvedCount: number;
  heldCount: number;
  declinedCount: number;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function getMeasureYearOverYearSummary(
  serviceClient: ForecastServiceClient,
  input: {
    runId: string;
    sourceBatchId: string | null;
    forecastYear: number;
    measureNormalized: string;
    search: string;
    contractIds: string[];
  }
): Promise<MeasureYearOverYearSummary> {
  const rows = await getAllForecastProjectionsForRun(serviceClient, input.runId, {
    search: input.search,
    contractIds: input.contractIds,
    measureNormalized: input.measureNormalized,
  });
  const priorScores = await getPriorYearFinalScoresForProjections(serviceClient, {
    sourceBatchId: input.sourceBatchId,
    forecastYear: input.forecastYear,
    projections: rows,
  });

  const rowsWithPrior = rows
    .map((row) => {
      const prior = priorScores.get(`${row.contractId}::${row.measureNormalized}`);
      return prior ? { row, priorScore: prior.score } : null;
    })
    .filter((value): value is { row: typeof rows[number]; priorScore: number } => Boolean(value));

  const finalDeltas = rowsWithPrior.map(({ row, priorScore }) => row.finalScore - priorScore);
  const modelDeltas = rowsWithPrior.map(({ row, priorScore }) => row.modelScore - priorScore);

  return {
    contractCount: rows.length,
    withPriorYearCount: rowsWithPrior.length,
    averagePriorYearScore: average(rowsWithPrior.map(({ priorScore }) => priorScore)),
    averageModelScore: average(rows.map((row) => row.modelScore)),
    averageFinalScore: average(rows.map((row) => row.finalScore)),
    averageFinalDelta: average(finalDeltas),
    averageModelDelta: average(modelDeltas),
    improvedCount: finalDeltas.filter((delta) => delta > 0).length,
    heldCount: finalDeltas.filter((delta) => delta === 0).length,
    declinedCount: finalDeltas.filter((delta) => delta < 0).length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const forecastYearParam = searchParams.get("forecastYear");
    const runIdParam = searchParams.get("runId");
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");
    const searchParam = searchParams.get("search");
    const contractIdsParam = searchParams.get("contractIds");
    const measureParam = searchParams.get("measure") ?? "";
    const forecastYear = forecastYearParam ? Number(forecastYearParam) : undefined;
    const page = pageParam ? Number(pageParam) : 1;
    const pageSize = pageSizeParam ? Number(pageSizeParam) : 100;
    const contractIds = contractIdsParam
      ? contractIdsParam.split(",").map((value) => value.trim()).filter(Boolean)
      : [];

    const runs = await listForecastProjectionRuns(admin.serviceClient);
    const selectedRun = runIdParam
      ? await getForecastRun(admin.serviceClient, runIdParam)
      : forecastYear !== undefined
        ? await getLatestForecastRunForYear(admin.serviceClient, forecastYear)
        : runs[0] ?? null;

    const projectionResult = selectedRun
      ? await getForecastProjectionsForRun(admin.serviceClient, selectedRun.id, {
          page,
          pageSize,
          search: searchParam ?? "",
          contractIds,
          measureNormalized: measureParam,
        })
      : { rows: [], totalCount: 0 };

    const priorYearScores = selectedRun
      ? await getPriorYearFinalScoresForProjections(admin.serviceClient, {
          sourceBatchId: selectedRun.sourceBatchId,
          forecastYear: selectedRun.forecastYear,
          projections: projectionResult.rows,
        })
      : new Map<string, { score: number; year: number; month: number }>();
    const measureApprovals = selectedRun
      ? await listForecastMeasureApprovals(admin.serviceClient, selectedRun.id)
      : [];
    const measureSummary = selectedRun && measureParam
      ? await getMeasureYearOverYearSummary(admin.serviceClient, {
          runId: selectedRun.id,
          sourceBatchId: selectedRun.sourceBatchId,
          forecastYear: selectedRun.forecastYear,
          measureNormalized: measureParam,
          search: searchParam ?? "",
          contractIds,
        })
      : null;

    return NextResponse.json({
      runs,
      selectedRun,
      measureApprovals,
      measureSummary,
      projections: projectionResult.rows.map((row) => {
        const prior = priorYearScores.get(`${row.contractId}::${row.measureNormalized}`);
        return {
          ...row,
          priorYearScore: prior?.score ?? null,
          priorYearScoreYear: prior?.year ?? null,
          priorYearScoreMonth: prior?.month ?? null,
        };
      }),
      totalCount: projectionResult.totalCount,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Failed to load forecast projections", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load forecast projections",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const body = await request.json();
    const action = body.action as "updateProjections" | "approveRun" | "approveMeasure" | "rerunProjections" | undefined;
    const runId = typeof body.runId === "string" ? body.runId : "";

    if (action === "updateProjections") {
      const updates = Array.isArray(body.updates)
        ? body.updates
            .map((update: { id?: string; manualScore?: number | string | null }) => {
              const manualScore =
                update.manualScore === null || update.manualScore === ""
                  ? null
                  : Number(update.manualScore);
              return {
                id: update.id ?? "",
                manualScore:
                  manualScore === null || Number.isFinite(manualScore) ? manualScore : null,
              };
            })
            .filter((update: { id: string; manualScore: number | null }) => update.id.length > 0)
        : [];

      if (updates.length === 0) {
        return NextResponse.json(
          { error: "At least one projection update is required." },
          { status: 400 }
        );
      }

      const updatedMeasureNames = await updateForecastProjectionOverrides(admin.serviceClient, {
        updates,
        updatedBy: admin.userId,
      });
      if (runId) {
        await deleteForecastMeasureApprovalsForMeasures(admin.serviceClient, {
          runId,
          measureNormalized: updatedMeasureNames,
        });
      }
    } else if (action === "rerunProjections") {
      if (!runId) {
        return NextResponse.json({ error: "runId is required." }, { status: 400 });
      }
      const run = await getForecastRun(admin.serviceClient, runId);
      if (!run) {
        return NextResponse.json({ error: "Run not found." }, { status: 404 });
      }
      if (run.datasetType === "cahps") {
        return NextResponse.json(
          { error: "CAHPS runs use current survey rates directly. Re-import the survey file to refresh." },
          { status: 400 }
        );
      }
      if (!run.sourceBatchId) {
        return NextResponse.json({ error: "Run has no source batch to re-project from." }, { status: 400 });
      }
      const historyRows = await getAllMonthlyHistoryForBatch(admin.serviceClient, run.sourceBatchId);
      const projections = buildGlidepathProjections(historyRows, run.forecastYear).filter(
        (projection) =>
          isEligibleForecastContract(projection.contractId) &&
          // Only measures with observations in this stars year; drop carry-forward
          // rows that would echo an earlier stars year's final score.
          projection.supportingPoints > 0
      );

      await deleteForecastProjectionsForRun(admin.serviceClient, runId);
      await deleteForecastMeasureApprovalsForRun(admin.serviceClient, runId);
      await insertForecastProjections(admin.serviceClient, {
        runId,
        forecastYear: run.forecastYear,
        projections,
        updatedBy: admin.userId,
      });
      await updateForecastRunProjectionCount(admin.serviceClient, runId, projections.length);
    } else if (action === "approveRun") {
      if (!runId) {
        return NextResponse.json({ error: "runId is required." }, { status: 400 });
      }
      await approveForecastRun(admin.serviceClient, runId, admin.userId);
    } else if (action === "approveMeasure") {
      if (!runId) {
        return NextResponse.json({ error: "runId is required." }, { status: 400 });
      }
      const measureNormalized = typeof body.measureNormalized === "string" ? body.measureNormalized : "";
      const measureDisplayName = typeof body.measureDisplayName === "string" ? body.measureDisplayName : "";
      if (!measureNormalized) {
        return NextResponse.json({ error: "measureNormalized is required." }, { status: 400 });
      }
      await approveForecastMeasure(admin.serviceClient, {
        runId,
        measureNormalized,
        measureDisplayName: measureDisplayName || measureNormalized,
        approvedBy: admin.userId,
      });
    } else {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const selectedRun = runId ? await getForecastRun(admin.serviceClient, runId) : null;
    const projectionResult = selectedRun
      ? await getForecastProjectionsForRun(admin.serviceClient, selectedRun.id, {
          page: 1,
          pageSize: 100,
        })
      : { rows: [], totalCount: 0 };

    return NextResponse.json({
      selectedRun,
      projections: projectionResult.rows,
      totalCount: projectionResult.totalCount,
      page: 1,
      pageSize: 100,
    });
  } catch (error) {
    console.error("Failed to update forecast projections", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update forecast projections",
      },
      { status: 500 }
    );
  }
}
