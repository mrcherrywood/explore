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
  isEligibleForecastContract,
  overlayProjectedSamples,
} from "@/lib/cutpoint-forecast/analysis";
import {
  loadPp1SamplesForMeasure,
  mergeOverlaySamplesPreferPrimary,
} from "@/lib/cutpoint-forecast/pp1-overlay";
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

    // Current-year union: Projected Final first, PP1 fills. Full Market then
    // pads with last year's published scores; Client Only does not.
    let overlaySamples = projectedSamples;
    let pp1OverlayCount = 0;
    try {
      const pp1Samples = (
        await loadPp1SamplesForMeasure(admin.serviceClient, run.forecastYear, measure)
      ).filter((sample) => isEligibleForecastContract(sample.contractId));
      const merged = mergeOverlaySamplesPreferPrimary(projectedSamples, pp1Samples);
      overlaySamples = merged.samples;
      pp1OverlayCount = merged.pp1FillCount;
    } catch {
      overlaySamples = projectedSamples;
      pp1OverlayCount = 0;
    }

    const latestHistoricalYear = getAvailableMeasureYears().at(-1) ?? null;
    const baselineSamples = latestHistoricalYear === null
      ? []
      : getMeasureYearScoreSamples(measure, latestHistoricalYear);
    const overlayContractIds = new Set(overlaySamples.map((sample) => sample.contractId));
    const scenarioBaselineSamples =
      populationMode === "full_market"
        ? baselineSamples
        : baselineSamples.filter((sample) => overlayContractIds.has(sample.contractId));
    const samples =
      populationMode === "full_market" && latestHistoricalYear !== null
        ? overlayProjectedSamples(measure, overlaySamples, latestHistoricalYear)
        : overlaySamples;

    console.log(
      `[methodology] measure=${measure} mode=${populationMode} projected=${projectedSamples.length} pp1Fill=${pp1OverlayCount} baselineYear=${latestHistoricalYear} combined=${samples.length}`
    );

    const result = analyzeCutPointMethodologyForecast(measure, run.forecastYear, samples, {
      baselineSamples: scenarioBaselineSamples,
      baselineYear: latestHistoricalYear,
    });
    const withPp1Note =
      result.status === "ready" && pp1OverlayCount > 0
        ? {
            ...result,
            notes: [
              ...result.notes,
              populationMode === "full_market"
                ? `Full-market overlay includes ${pp1OverlayCount} accrued Plan Preview contract${pp1OverlayCount === 1 ? "" : "s"} without a forecast Projected Final.`
                : `Client-only population includes ${pp1OverlayCount} accrued Plan Preview contract${pp1OverlayCount === 1 ? "" : "s"} without a forecast Projected Final.`,
            ],
          }
        : result;
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
        projectedContractCount: projectedSamples.length,
        pp1OverlayCount,
        manualThresholds,
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
