import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ChartSpec } from "@/types/charts";

export const runtime = "nodejs";

type MetricId = "partC" | "partD";

type MetricDefinition = {
  id: MetricId;
  label: string;
  description: string;
  shortLabel: string;
  nameTokens: string[];
  fallbackCodes: string[];
};

const METRIC_DEFINITIONS: Record<MetricId, MetricDefinition> = {
  partC: {
    id: "partC",
    label: "Part C Quality Improvement",
    description: "CMS Health Plan Quality Improvement measure",
    shortLabel: "Part C",
    nameTokens: ["health", "plan", "quality improvement"],
    fallbackCodes: ["C27", "C30"],
  },
  partD: {
    id: "partD",
    label: "Part D Quality Improvement",
    description: "CMS Drug Plan Quality Improvement measure (D04)",
    shortLabel: "Part D",
    nameTokens: ["drug", "plan", "quality improvement"],
    fallbackCodes: ["D04"],
  },
};

const METRIC_IDS = Object.keys(METRIC_DEFINITIONS) as MetricId[];

const ALL_FALLBACK_CODES = Array.from(
  new Set(
    METRIC_IDS.flatMap((id) => METRIC_DEFINITIONS[id].fallbackCodes.map((code) => code.toUpperCase()))
  )
);

type MetricCodeLookup = Record<MetricId, Set<string>>;

function createInitialCodeLookup(): MetricCodeLookup {
  return METRIC_IDS.reduce((acc, id) => {
    acc[id] = new Set(
      METRIC_DEFINITIONS[id].fallbackCodes.map((code) => code.toUpperCase())
    );
    return acc;
  }, {} as MetricCodeLookup);
}

function matchesDefinitionByLabel(label: string | null | undefined, definition: MetricDefinition): boolean {
  if (!label) return false;
  const normalized = label.trim().toLowerCase();
  if (!normalized) return false;
  return definition.nameTokens.every((token) => normalized.includes(token));
}

async function hydrateCodeLookup(
  supabase: ReturnType<typeof createServiceRoleClient>,
  startYear: number,
  endYear: number
): Promise<MetricCodeLookup> {
  const lookup = createInitialCodeLookup();
  const { data, error } = await supabase
    .from("ma_measures")
    .select("code, name, year")
    .gte("year", startYear)
    .lte("year", endYear)
    .ilike("name", "%Quality Improvement%");

  if (error) {
    throw new Error(error.message);
  }

  (data ?? []).forEach((row: { code: string | null; name: string | null }) => {
    const code = row.code?.trim().toUpperCase();
    if (!code) return;
    for (const id of METRIC_IDS) {
      if (matchesDefinitionByLabel(row.name, METRIC_DEFINITIONS[id])) {
        lookup[id].add(code);
      }
    }
  });

  return lookup;
}
type MetricRow = {
  contract_id: string | null;
  metric_code: string | null;
  metric_label: string | null;
  star_rating: string | null;
  year: number | null;
};

type YearlyStat = {
  year: number;
  sample: number;
  average: number | null;
  highShare: number | null;
  perfectShare: number | null;
};

type TransitionMatrix = {
  fromYear: number;
  toYear: number;
  grid: number[][];
  totalsByFrom: number[];
  stayRates: Array<{ rating: number; stayRate: number | null; sample: number }>;
  pairSample: number;
};

type HighCarryStats = {
  base: number;
  dropRate: number | null;
  riseRate: number | null;
  flatRate: number | null;
  avgChange: number | null;
};

type MeasureSummary = {
  id: MetricId;
  label: string;
  description: string;
  shortLabel: string;
  codesUsed: string[];
  yearlyStats: YearlyStat[];
  transitions: TransitionMatrix[];
  highCarry: HighCarryStats;
  sampleContracts: number;
  samplePoints: number;
};

type NormalizedMetricRow = {
  contract_id: string;
  metric_code: string;
  metric_label: string | null;
  star_rating: string | null;
  year: number;
  metricId: MetricId;
};

type HighlightCard = {
  id: string;
  label: string;
  value: string;
  helper: string;
};

type ApiResponse = {
  datasetYears: number[];
  measures: MeasureSummary[];
  charts: {
    trend?: ChartSpec | null;
    retention?: ChartSpec | null;
  };
  highlightCards: HighlightCard[];
  insights: string[];
};

const PAGE_SIZE = 1000;
const DEFAULT_START_YEAR = 2023;
const DEFAULT_END_YEAR = 2026;

function parseYearParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStarRating(value: string | null): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0 || numeric > 5) return null;
  return Number(numeric.toFixed(2));
}

function resolveMetricIdFromRow(
  row: MetricRow,
  lookup: MetricCodeLookup
): MetricId | null {
  const code = row.metric_code?.trim().toUpperCase();
  if (code) {
    for (const id of METRIC_IDS) {
      if (lookup[id].has(code)) {
        return id;
      }
    }
  }
  for (const id of METRIC_IDS) {
    if (matchesDefinitionByLabel(row.metric_label, METRIC_DEFINITIONS[id])) {
      return id;
    }
  }
  return null;
}

async function fetchMetricRows(
  supabase: ReturnType<typeof createServiceRoleClient>,
  startYear: number,
  endYear: number,
  metricCodes: string[]
): Promise<MetricRow[]> {
  const codes = metricCodes.length > 0 ? metricCodes : ALL_FALLBACK_CODES;
  const results: MetricRow[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("ma_metrics")
      .select("contract_id, metric_code, metric_label, star_rating, year")
      .in("metric_code", codes)
      .gte("year", startYear)
      .lte("year", endYear)
      .order("year", { ascending: true })
      .order("contract_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      results.push(...(data as MetricRow[]));
      hasMore = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return results;
}

function summarizeMeasure(
  definition: MetricDefinition,
  codesUsed: string[],
  records: NormalizedMetricRow[]
): MeasureSummary {
  const byYear = new Map<number, number[]>();
  const byContract = new Map<string, Array<{ year: number; rating: number }>>();

  for (const row of records) {
    const rating = parseStarRating(row.star_rating);
    if (rating === null) continue;
    const year = Number(row.year);
    if (!Number.isFinite(year)) continue;
    const contractId = (row.contract_id ?? "").trim().toUpperCase();
    if (!contractId) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)?.push(rating);
    if (!byContract.has(contractId)) byContract.set(contractId, []);
    byContract.get(contractId)?.push({ year, rating });
  }

  const yearlyStats: YearlyStat[] = Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, ratings]) => {
      const sample = ratings.length;
      const total = ratings.reduce((sum, val) => sum + val, 0);
      const high = ratings.filter((val) => val >= 4).length;
      const perfect = ratings.filter((val) => val >= 5).length;
      return {
        year,
        sample,
        average: sample > 0 ? Number((total / sample).toFixed(2)) : null,
        highShare: sample > 0 ? Number(((high / sample) * 100).toFixed(1)) : null,
        perfectShare: sample > 0 ? Number(((perfect / sample) * 100).toFixed(1)) : null,
      };
    });

  const transitions: TransitionMatrix[] = [];
  const highCarry = {
    totalPairs: 0,
    drop: 0,
    rise: 0,
    flat: 0,
    sumChange: 0,
  };

  const pairBuckets = new Map<string, number[][]>();

  for (const [contractId, entries] of byContract.entries()) {
    entries.sort((a, b) => a.year - b.year);
    for (let i = 0; i < entries.length - 1; i += 1) {
      const current = entries[i];
      const next = entries[i + 1];
      if (next.year !== current.year + 1) continue;
      const key = `${current.year}->${next.year}`;
      if (!pairBuckets.has(key)) {
        pairBuckets.set(
          key,
          Array.from({ length: 5 }, () => Array(5).fill(0))
        );
      }
      const grid = pairBuckets.get(key)!;
      const fromIdx = Math.min(5, Math.max(1, Math.round(current.rating))) - 1;
      const toIdx = Math.min(5, Math.max(1, Math.round(next.rating))) - 1;
      grid[fromIdx][toIdx] += 1;

      if (current.rating >= 4) {
        highCarry.totalPairs += 1;
        const change = next.rating - current.rating;
        highCarry.sumChange += change;
        if (change < 0) highCarry.drop += 1;
        else if (change > 0) highCarry.rise += 1;
        else highCarry.flat += 1;
      }
    }
  }

  for (const [key, grid] of pairBuckets.entries()) {
    const [fromYearStr, toYearStr] = key.split("->");
    const fromYear = Number(fromYearStr);
    const toYear = Number(toYearStr);
    const totalsByFrom = grid.map((row) => row.reduce((sum, val) => sum + val, 0));
    const stayRates = grid.map((row, index) => {
      const sample = totalsByFrom[index];
      const stayValue = row[index];
      return {
        rating: index + 1,
        stayRate: sample > 0 ? Number(((stayValue / sample) * 100).toFixed(1)) : null,
        sample,
      };
    });
    const pairSample = totalsByFrom.reduce((sum, val) => sum + val, 0);
    transitions.push({ fromYear, toYear, grid, totalsByFrom, stayRates, pairSample });
  }

  transitions.sort((a, b) => a.fromYear - b.fromYear);

  const highCarryStats: HighCarryStats = {
    base: highCarry.totalPairs,
    dropRate: highCarry.totalPairs > 0 ? Number(((highCarry.drop / highCarry.totalPairs) * 100).toFixed(1)) : null,
    riseRate: highCarry.totalPairs > 0 ? Number(((highCarry.rise / highCarry.totalPairs) * 100).toFixed(1)) : null,
    flatRate: highCarry.totalPairs > 0 ? Number(((highCarry.flat / highCarry.totalPairs) * 100).toFixed(1)) : null,
    avgChange: highCarry.totalPairs > 0 ? Number((highCarry.sumChange / highCarry.totalPairs).toFixed(2)) : null,
  };

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    shortLabel: definition.shortLabel,
    codesUsed: Array.from(new Set(codesUsed)).sort(),
    yearlyStats,
    transitions,
    highCarry: highCarryStats,
    sampleContracts: byContract.size,
    samplePoints: records.length,
  };
}

function buildTrendChart(measures: MeasureSummary[]): ChartSpec | null {
  if (measures.length === 0) return null;
  const years = Array.from(
    new Set(
      measures.flatMap((m) => m.yearlyStats.map((stat) => stat.year))
    )
  ).sort((a, b) => a - b);
  if (years.length === 0) return null;

  const data = years.map((year) => {
    const entry: Record<string, string | number | null> = { year };
    measures.forEach((measure) => {
      const stat = measure.yearlyStats.find((s) => s.year === year);
      entry[measure.id] = stat?.average ?? null;
    });
    return entry;
  });

  return {
    title: "Average Quality Improvement Star Ratings",
    type: "line",
    xKey: "year",
    series: measures.map((m) => ({ key: m.id, name: m.label })),
    data,
    yAxisDomain: [1, 5],
    yAxisTicks: [1, 2, 3, 4, 5],
  };
}

function buildRetentionChart(measures: MeasureSummary[]): ChartSpec | null {
  if (measures.length === 0) return null;
  const data = measures.map((measure) => ({
    measure: measure.label,
    shortLabel: measure.shortLabel,
    dropRate: measure.highCarry.dropRate ?? 0,
    holdRate: measure.highCarry.flatRate ?? 0,
    riseRate: measure.highCarry.riseRate ?? 0,
  }));

  return {
    title: "Next-Year Outcomes for 4-5★ Contracts",
    type: "bar",
    xKey: "shortLabel",
    xLabelKey: "measure",
    xLabelMaxLines: 2,
    series: [
      { key: "dropRate", name: "Lost ground" },
      { key: "holdRate", name: "Held flat" },
      { key: "riseRate", name: "Improved" },
    ],
    data,
    showLabels: true,
    yAxisDomain: [0, 100],
    yAxisTicks: [0, 25, 50, 75, 100],
  };
}

function buildHighlightCards(measures: MeasureSummary[]): HighlightCard[] {
  const cards: HighlightCard[] = [];
  for (const measure of measures) {
    if (measure.highCarry.dropRate !== null) {
      cards.push({
        id: `${measure.id}-drop-rate`,
        label: `${measure.shortLabel} high performers that declined`,
        value: `${measure.highCarry.dropRate}%`,
        helper: `Share of ${measure.label} contracts scoring ≥4★ that fell the next year`,
      });
    }
    if (measure.highCarry.avgChange !== null) {
      cards.push({
        id: `${measure.id}-avg-change`,
        label: `${measure.shortLabel} average movement`,
        value: `${measure.highCarry.avgChange}★`,
        helper: `Average star change among repeated ${measure.shortLabel} high performers`,
      });
    }
  }
  return cards;
}

function buildInsights(measures: MeasureSummary[]): string[] {
  const insights: string[] = [];

  for (const measure of measures) {
    const stats = measure.yearlyStats;
    if (stats.length >= 2) {
      const first = stats[0];
      const latest = stats[stats.length - 1];
      if (first.average !== null && latest.average !== null) {
        insights.push(
          `${measure.label} averages moved from ${first.average}★ in ${first.year} to ${latest.average}★ in ${latest.year} across ${latest.sample.toLocaleString()} contracts.`
        );
      }
    }

    if (measure.highCarry.dropRate !== null) {
      insights.push(
        `${measure.highCarry.dropRate}% of ${measure.shortLabel} contracts that reached 4-5★ fell the following year; only ${measure.highCarry.riseRate ?? 0}% managed to improve further.`
      );
    }

    const recentTransition = measure.transitions[measure.transitions.length - 1];
    if (recentTransition) {
      const stayFive = recentTransition.stayRates.find((row) => row.rating === 5);
      if (stayFive && stayFive.stayRate !== null && stayFive.sample > 0) {
        insights.push(
          `Just ${stayFive.stayRate}% of ${measure.shortLabel} contracts kept a 5★ Quality Improvement score from ${recentTransition.fromYear} to ${recentTransition.toYear}.`
        );
      }
    }
  }

  return insights.slice(0, 5);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const startYear = parseYearParam(searchParams.get("startYear"), DEFAULT_START_YEAR);
    const endYear = parseYearParam(searchParams.get("endYear"), DEFAULT_END_YEAR);

    if (startYear > endYear) {
      return NextResponse.json(
        { error: "startYear must be less than or equal to endYear" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();
    const codeLookup = await hydrateCodeLookup(supabase, startYear, endYear);
    const codesForQuery = Array.from(
      new Set(
        METRIC_IDS.flatMap((id) => Array.from(codeLookup[id]))
      )
    );

    const rows = await fetchMetricRows(supabase, startYear, endYear, codesForQuery);
    const normalizedRows = rows
      .map((row) => {
        const year = Number(row.year);
        const contractId = (row.contract_id ?? "").trim().toUpperCase();
        const metricCode = row.metric_code?.trim().toUpperCase() ?? null;
        const metricId = resolveMetricIdFromRow(row, codeLookup);
        if (!contractId || !metricCode || !metricId || !Number.isFinite(year)) {
          return null;
        }
        return {
          contract_id: contractId,
          metric_code: metricCode,
          metric_label: row.metric_label ?? null,
          star_rating: row.star_rating,
          year,
          metricId,
        } satisfies NormalizedMetricRow;
      })
      .filter((row): row is NormalizedMetricRow => Boolean(row));

    const datasetYears = Array.from(
      new Set(normalizedRows.map((row) => Number(row.year)))
    ).sort((a, b) => a - b);

    const measures = METRIC_IDS.map((id) => {
      const definition = METRIC_DEFINITIONS[id];
      const metricRows = normalizedRows.filter((row) => row.metricId === id);
      if (metricRows.length === 0) return null;
      return summarizeMeasure(definition, Array.from(codeLookup[id]), metricRows);
    }).filter((measure): measure is MeasureSummary => Boolean(measure));

    const charts = {
      trend: buildTrendChart(measures),
      retention: buildRetentionChart(measures),
    };

    const highlightCards = buildHighlightCards(measures);
    const insights = buildInsights(measures);

    const response: ApiResponse = {
      datasetYears,
      measures,
      charts,
      highlightCards,
      insights,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch (error) {
    console.error("Failed to build quality improvement analysis", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to build analysis",
      },
      { status: 500 }
    );
  }
}
