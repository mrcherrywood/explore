import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  parseProjectedData,
  convertToStars,
  loadCutPointsForYear,
  runProjection,
  type ProjectionMode,
} from "@/lib/reward-factor/projection";
import {
  compareWithOfficial,
  type ContractMeasure,
  type RatingType,
} from "@/lib/reward-factor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 1000;
const QI_MEASURES = new Set(["C30", "D04"]);

type MetricRow = {
  contract_id: string;
  metric_code: string;
  metric_category: string;
  star_rating: string | null;
};

type MeasureRow = {
  code: string;
  weight: number | null;
  domain: string | null;
};

async function fetchAllMetrics(
  supabase: ReturnType<typeof createServiceRoleClient>,
  year: number
): Promise<MetricRow[]> {
  const all: MetricRow[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("ma_metrics")
      .select("contract_id, metric_code, metric_category, star_rating")
      .eq("year", year)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      all.push(...(data as MetricRow[]));
      hasMore = data.length === PAGE_SIZE;
      page++;
    } else {
      hasMore = false;
    }
  }
  return all;
}

function buildHistoricalMeasures(
  metrics: MetricRow[],
  measureWeights: Map<string, { weight: number; category: string }>
): Map<string, ContractMeasure[]> {
  const byContract = new Map<string, ContractMeasure[]>();

  for (const m of metrics) {
    if (!m.contract_id || !m.metric_code || !m.star_rating) continue;
    const code = m.metric_code.trim().toUpperCase();
    if (QI_MEASURES.has(code)) continue;

    const starValue = Number.parseFloat(m.star_rating);
    if (!Number.isFinite(starValue) || starValue <= 0) continue;

    const contractId = m.contract_id.trim().toUpperCase();
    const info = measureWeights.get(code);
    const weight = info?.weight ?? 1;
    const category = info?.category ?? m.metric_category?.trim() ?? "";

    if (!byContract.has(contractId)) byContract.set(contractId, []);
    byContract.get(contractId)!.push({ code, starValue, weight, category });
  }

  return byContract;
}

const RATING_TYPES: { key: RatingType; label: string }[] = [
  { key: "overall_mapd", label: "Overall (MA-PD)" },
  { key: "part_c", label: "Part C" },
  { key: "part_d_mapd", label: "Part D (MA-PD)" },
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      projectedData: rawProjected,
      year = 2026,
      mode = "full_market",
    } = body as {
      projectedData: Record<string, string>[];
      year?: number;
      mode?: ProjectionMode;
    };

    if (!rawProjected || !Array.isArray(rawProjected) || rawProjected.length === 0) {
      return NextResponse.json({ error: "projectedData is required and must be a non-empty array" }, { status: 400 });
    }

    const projected = parseProjectedData(rawProjected);
    if (projected.length === 0) {
      return NextResponse.json({ error: "No valid projected measures found after parsing" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: measures, error: measuresError } = await supabase
      .from("ma_measures")
      .select("code, weight, domain")
      .eq("year", year) as { data: MeasureRow[] | null; error: Error | null };

    if (measuresError) throw new Error(measuresError.message);

    const measureWeights = new Map<string, { weight: number; category: string }>();
    for (const m of measures ?? []) {
      if (!m.code || m.weight === null) continue;
      const code = m.code.trim().toUpperCase();
      const domain = (m.domain ?? "").toLowerCase();
      const category = code.startsWith("D") ? "Part D" : "Part C";
      measureWeights.set(code, { weight: m.weight, category });
    }

    const cutPoints = loadCutPointsForYear(year);

    // Group projected data by contract, then convert each contract's measures
    const projectedByContract = new Map<string, typeof projected>();
    for (const item of projected) {
      if (!projectedByContract.has(item.contractId)) {
        projectedByContract.set(item.contractId, []);
      }
      projectedByContract.get(item.contractId)!.push(item);
    }

    const clientMeasuresByContract = new Map<string, ContractMeasure[]>();
    for (const [contractId, items] of projectedByContract) {
      const stars = convertToStars(items, cutPoints, measureWeights);
      if (stars.length > 0) {
        clientMeasuresByContract.set(contractId, stars);
      }
    }

    let historicalMeasuresByContract = new Map<string, ContractMeasure[]>();
    if (mode === "full_market") {
      const historicalMetrics = await fetchAllMetrics(supabase, year);
      historicalMeasuresByContract = buildHistoricalMeasures(historicalMetrics, measureWeights);
    }

    const ratingResults: Record<string, ReturnType<typeof runProjection> & {
      officialComparison: ReturnType<typeof compareWithOfficial> | null;
    }> = {};

    for (const { key: ratingType, label } of RATING_TYPES) {
      const result = runProjection(clientMeasuresByContract, historicalMeasuresByContract, mode, ratingType);

      const officialComparison = compareWithOfficial(result.primaryThresholds, ratingType, false, true);

      ratingResults[ratingType] = { ...result, officialComparison };
    }

    return NextResponse.json({
      year,
      mode,
      projectedMeasureCount: projected.length,
      clientContracts: clientMeasuresByContract.size,
      results: ratingResults,
    });
  } catch (error) {
    console.error("Reward factor projection error:", error);
    return NextResponse.json(
      { error: "Failed to run reward factor projection", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
