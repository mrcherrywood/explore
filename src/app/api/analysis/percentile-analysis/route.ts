import { NextRequest, NextResponse } from "next/server";

import { getMeasureLikelihoodData, getMeasureLikelihoodTableData, getMeasureStarPercentileData } from "@/lib/percentile-analysis/measure-likelihood";
import { getWorkbookViewerData } from "@/lib/percentile-analysis/workbook";
import type { PercentileMethod } from "@/lib/percentile-analysis/workbook-types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawMethod = searchParams.get("method");
    const VALID_METHODS: PercentileMethod[] = ["percentrank_inc", "percentileofscore", "percentrank_inc_corrected", "kde_percentile"];
    const method: PercentileMethod = VALID_METHODS.includes(rawMethod as PercentileMethod) ? (rawMethod as PercentileMethod) : "percentrank_inc";

    if (searchParams.get("view") === "measure-likelihood-table") {
      const payload = await getMeasureLikelihoodTableData({
        method,
        targetStar: searchParams.get("targetStar"),
      });

      return NextResponse.json(payload, {
        status: payload.status === "error" ? 500 : payload.status === "missing_inputs" ? 400 : 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (searchParams.get("view") === "measure-star-percentile") {
      const payload = await getMeasureStarPercentileData({
        method,
        measure: searchParams.get("measure"),
        star: searchParams.get("star"),
      });

      return NextResponse.json(payload, {
        status: payload.status === "error" ? 500 : payload.status === "missing_inputs" ? 400 : 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (searchParams.get("view") === "measure-likelihood") {
      const payload = await getMeasureLikelihoodData({
        method,
        measure: searchParams.get("measure"),
        percentile: searchParams.get("percentile"),
      });

      return NextResponse.json(payload, {
        status: payload.status === "error" ? 500 : payload.status === "missing_inputs" ? 400 : 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const payload = await getWorkbookViewerData(searchParams.get("workbook"), searchParams.get("sheet"), method);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load percentile analysis", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load percentile analysis",
      },
      { status: 500 }
    );
  }
}
