import { NextRequest, NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import {
  analyzeCutPointMethodologyForecast,
  buildManualForecastThresholds,
  isSurveyMeasure,
} from "@/lib/band-movement/cut-point-methodology";
import { getAvailableMeasureYears, getMeasureYearScoreSamples } from "@/lib/band-movement/analysis";
import {
  buildClientInformedMarketSamples,
  buildCurrentYearForecastOverlay,
  buildCurrentYearOverlayNotes,
  buildForecastMethodologyInputs,
} from "@/lib/cutpoint-forecast/analysis";
import { loadPp1SamplesForMeasure } from "@/lib/cutpoint-forecast/pp1-overlay";
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
      .filter((p) => p.measureNormalized === measure)
      .map((p) => ({ contractId: p.contractId, score: p.finalScore }));

    let overlaySamples = buildCurrentYearForecastOverlay(
      projectedSamples,
      [],
      measure
    ).samples;
    let pp1OverlayCount = 0;
    let pp1OverrideCount = 0;
    try {
      const pp1Samples = await loadPp1SamplesForMeasure(
        admin.serviceClient,
        run.forecastYear,
        measure
      );
      const merged = buildCurrentYearForecastOverlay(projectedSamples, pp1Samples, measure);
      overlaySamples = merged.samples;
      pp1OverlayCount = merged.pp1FillCount;
      pp1OverrideCount = merged.pp1OverrideCount;
    } catch {
      overlaySamples = buildCurrentYearForecastOverlay(
        projectedSamples,
        [],
        measure
      ).samples;
      pp1OverlayCount = 0;
      pp1OverrideCount = 0;
    }

    const latestHistoricalYear = getAvailableMeasureYears().at(-1) ?? null;
    const { samples, baselineSamples: scenarioBaselineSamples } =
      buildForecastMethodologyInputs(
        measure,
        overlaySamples,
        latestHistoricalYear,
        populationMode
      );
    const baselineSamples =
      latestHistoricalYear === null
        ? []
        : getMeasureYearScoreSamples(measure, latestHistoricalYear);

    console.log(
      `[methodology] measure=${measure} mode=${populationMode} projected=${projectedSamples.length} pp1Fill=${pp1OverlayCount} baselineYear=${latestHistoricalYear} combined=${samples.length}`
    );

    const result = analyzeCutPointMethodologyForecast(measure, run.forecastYear, samples, {
      baselineSamples: scenarioBaselineSamples,
      baselineYear: latestHistoricalYear,
    });
    const overlayNotes = buildCurrentYearOverlayNotes(
      populationMode,
      pp1OverlayCount,
      pp1OverrideCount
    );
    const withPp1Note =
      result.status === "ready" && overlayNotes.length > 0
        ? {
            ...result,
            notes: [...result.notes, ...overlayNotes],
          }
        : result;
    const eligibleProjected = buildCurrentYearForecastOverlay(
      projectedSamples,
      [],
      measure
    ).samples;
    const clientInformed =
      populationMode === "full_market" && latestHistoricalYear !== null
        ? buildClientInformedMarketSamples(measure, eligibleProjected, latestHistoricalYear)
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
    const status = withPp1Note.status === "unsupported" ? 400 : 200;
    const manualThresholds = buildManualForecastThresholds(
      measure,
      run.forecastYear,
      latestHistoricalYear
    );

    return NextResponse.json(
      {
        ...withPp1Note,
        populationMode,
        baselineYear: populationMode === "full_market" ? latestHistoricalYear : null,
        projectedContractCount: eligibleProjected.length,
        pp1OverlayCount,
        pp1OverrideCount,
        manualThresholds,
        clientInformedScenario: clientInformed && clientInformedResult
          ? {
              ...clientInformedResult,
              populationMode,
              baselineYear: latestHistoricalYear,
              projectedContractCount: eligibleProjected.length,
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
