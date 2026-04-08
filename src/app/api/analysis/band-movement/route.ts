import { NextRequest, NextResponse } from "next/server";

import {
  analyzeBandMovement,
  analyzeHistoricalBandMovement,
  getAvailableOptions,
  type BandMovementResponse,
  type HistoricalBandMovementResponse,
} from "@/lib/band-movement/analysis";
import { analyzeCutPointMethodologyBacktest, ensureOfficialCutPoints, loadClientContractIds } from "@/lib/band-movement/cut-point-methodology";
import { analyzeCutPointImpact } from "@/lib/band-movement/cut-point-impact";
import { analyzeRosterAccuracyCurve } from "@/lib/band-movement/roster-accuracy-curve";
import { analyzeDecimalUpliftCurve } from "@/lib/band-movement/decimal-uplift-curve";

export const runtime = "nodejs";

type StarRating = 1 | 2 | 3 | 4 | 5;

function parseStarParam(value: string | null): StarRating | null {
  if (!value) return null;
  const num = Number(value);
  if (num >= 1 && num <= 5 && Number.isInteger(num)) return num as StarRating;
  return null;
}

function parseYearParam(value: string | null): number | null {
  if (!value) return null;
  const num = Number(value);
  if (Number.isFinite(num) && Number.isInteger(num)) return num;
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view");
    const measure = searchParams.get("measure");
    const star = parseStarParam(searchParams.get("star"));
    const fromYearRaw = searchParams.get("fromYear");

    const { measures, transitions } = getAvailableOptions();

    if (view === "cut-point-impact") {
      if (!measure) {
        return NextResponse.json(
          { error: "measure parameter is required for cut-point-impact view" },
          { status: 400 }
        );
      }
      const result = analyzeCutPointImpact(measure);
      if (!result) {
        return NextResponse.json(
          { error: `Measure not found: ${measure}` },
          { status: 404 }
        );
      }
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (view === "decimal-uplift-curve") {
      if (!measure) {
        return NextResponse.json(
          { error: "measure parameter is required for decimal-uplift-curve view" },
          { status: 400 }
        );
      }
      const result = analyzeDecimalUpliftCurve(measure, ensureOfficialCutPoints());
      const status = result.status === "unsupported" ? 400 : 200;
      return NextResponse.json(result, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (view === "roster-accuracy-curve") {
      if (!measure) {
        return NextResponse.json(
          { error: "measure parameter is required for roster-accuracy-curve view" },
          { status: 400 }
        );
      }
      const result = analyzeRosterAccuracyCurve(measure, ensureOfficialCutPoints());
      const status = result.status === "unsupported" ? 400 : 200;
      return NextResponse.json(result, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (view === "methodology-backtest") {
      if (!measure) {
        return NextResponse.json(
          { error: "measure parameter is required for methodology-backtest view" },
          { status: 400 }
        );
      }

      const clientOnly = searchParams.get("clientOnly") === "true";
      const contractFilter = clientOnly ? loadClientContractIds() : undefined;
      const result = analyzeCutPointMethodologyBacktest(measure, contractFilter);
      const status = result.status === "unsupported" ? 400 : 200;
      return NextResponse.json(result, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (!measure || star === null || !fromYearRaw) {
      const response: BandMovementResponse = {
        status: "options",
        measures,
        transitions,
        selectedMeasure: null,
        selectedStar: null,
        fromYear: null,
        toYear: null,
        movement: null,
        scoreStats: null,
        cutPoints: null,
        contracts: [],
        allBands: [],
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (fromYearRaw === "all") {
      const result = analyzeHistoricalBandMovement(measure, star);
      const response: HistoricalBandMovementResponse = {
        status: "ready",
        measures,
        transitions,
        ...result,
      };
      return NextResponse.json(response, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const fromYear = parseYearParam(fromYearRaw);
    if (fromYear === null || !transitions.includes(fromYear)) {
      return NextResponse.json(
        { error: `fromYear must be "all" or one of: ${transitions.join(", ")}` },
        { status: 400 }
      );
    }

    const result = analyzeBandMovement(measure, star, fromYear);

    const response: BandMovementResponse = {
      status: "ready",
      measures,
      transitions,
      ...result,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to build band movement analysis", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build analysis" },
      { status: 500 }
    );
  }
}
