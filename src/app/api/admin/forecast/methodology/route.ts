import { NextRequest, NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { analyzeCutPointMethodologyForecast, isSurveyMeasure } from "@/lib/band-movement/cut-point-methodology";
import { getAvailableMeasureYears, getMeasureYearScoreSamples } from "@/lib/band-movement/analysis";
import {
  buildClientInformedMarketSamples,
  isEligibleForecastContract,
  overlayProjectedSamples,
} from "@/lib/cutpoint-forecast/analysis";
import {
  getAllForecastProjectionsForRun,
  getForecastRun,
} from "@/lib/cutpoint-forecast/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId") ?? "";
    const measure = searchParams.get("measure") ?? "";

    if (!runId) {
      return NextResponse.json({ error: "runId is required." }, { status: 400 });
    }

    const run = await getForecastRun(admin.serviceClient, runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    const projections = await getAllForecastProjectionsForRun(admin.serviceClient, runId);

    if (measure === "__list__") {
      const displayNames = new Map(
        projections.map((p) => [p.measureNormalized, p.measureDisplayName] as const)
      );
      // CAHPS runs contain only survey measures (percentile method); non-CAHPS
      // runs use clustering and exclude survey measures.
      const measures = [...new Set(projections.map((p) => p.measureNormalized))]
        .filter((m) =>
          run.datasetType === "cahps"
            ? true
            : !isSurveyMeasure(displayNames.get(m) ?? m)
        )
        .sort();
      return NextResponse.json({
        measures: measures.map((m) => ({
          normalized: m,
          displayName: displayNames.get(m) ?? m,
        })),
      });
    }

    if (!measure) {
      return NextResponse.json({ error: "measure is required." }, { status: 400 });
    }

    const populationMode =
      searchParams.get("populationMode") === "client_only" ? "client_only" : "full_market";

    const projectedSamples = projections
      .filter((p) => p.measureNormalized === measure && isEligibleForecastContract(p.contractId))
      .map((p) => ({ contractId: p.contractId, score: p.finalScore }));

    const latestHistoricalYear = getAvailableMeasureYears().at(-1) ?? null;
    const baselineSamples = latestHistoricalYear === null
      ? []
      : getMeasureYearScoreSamples(measure, latestHistoricalYear);
    const projectedContractIds = new Set(projectedSamples.map((sample) => sample.contractId));
    const scenarioBaselineSamples =
      populationMode === "full_market"
        ? baselineSamples
        : baselineSamples.filter((sample) => projectedContractIds.has(sample.contractId));
    const samples =
      populationMode === "full_market" && latestHistoricalYear !== null
        ? overlayProjectedSamples(measure, projectedSamples, latestHistoricalYear)
        : projectedSamples;

    console.log(
      `[methodology] measure=${measure} mode=${populationMode} projected=${projectedSamples.length} baselineYear=${latestHistoricalYear} combined=${samples.length}`
    );

    const result = analyzeCutPointMethodologyForecast(measure, run.forecastYear, samples, {
      baselineSamples: scenarioBaselineSamples,
      baselineYear: latestHistoricalYear,
    });
    const clientInformed =
      populationMode === "full_market" && latestHistoricalYear !== null
        ? buildClientInformedMarketSamples(measure, projectedSamples, latestHistoricalYear)
        : null;
    const clientInformedResult = clientInformed
      ? analyzeCutPointMethodologyForecast(
          measure,
          run.forecastYear,
          clientInformed.samples,
          {
            baselineSamples,
            baselineYear: latestHistoricalYear,
          }
        )
      : null;
    const status = result.status === "unsupported" ? 400 : 200;

    return NextResponse.json(
      {
        ...result,
        populationMode,
        baselineYear: populationMode === "full_market" ? latestHistoricalYear : null,
        projectedContractCount: projectedSamples.length,
        clientInformedScenario: clientInformed && clientInformedResult
          ? {
              ...clientInformedResult,
              populationMode,
              baselineYear: latestHistoricalYear,
              projectedContractCount: projectedSamples.length,
              inference: clientInformed.metadata,
            }
          : null,
      },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Failed to run forecast methodology", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run forecast methodology" },
      { status: 500 }
    );
  }
}
