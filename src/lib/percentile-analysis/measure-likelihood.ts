import path from "node:path";

import {
  deriveMeasureStarRating,
  isInvertedMeasure,
  loadMeasureCutPoints,
  matchCutPointToMeasureName,
} from "@/lib/percentile-analysis/measure-matching";
import type {
  MeasureLikelihoodDistribution,
  MeasureLikelihoodPoint,
  MeasureLikelihoodResponse,
  MeasureLikelihoodSeries,
  MeasureSelectableStar,
  MeasureStarPercentileResponse,
  MeasureLikelihoodTableResponse,
  MeasureObservation,
  MeasureStarRating,
  MeasureYearMetadata,
} from "@/lib/percentile-analysis/measure-likelihood-types";
import { getContractPercentilesOutput, SUPPORTED_MEASURE_YEARS, YEAR_RECENCY_WEIGHTS } from "@/lib/percentile-analysis/run";
import type { PercentileMethod } from "@/lib/percentile-analysis/workbook-types";

const CUT_POINTS_WORKBOOK_PATH = path.join(process.cwd(), "data", "Stars 2016-2028 Cut Points 12.2025_with_weights.xlsx");
const LOOKUP_RADII = [0, 2.5, 5, 7.5, 10, 15, 20] as const;
const MIN_LOOKUP_SAMPLE = 15;

type MeasureDatasetEntry = {
  observations: MeasureObservation[];
  metadataByYear: Map<number, MeasureYearMetadata>;
};

type MeasureDataset = {
  availableMeasures: string[];
  byMeasure: Map<string, MeasureDatasetEntry>;
};

const datasetCache = new Map<PercentileMethod, Promise<MeasureDataset>>();

function roundToOne(value: number) {
  return Number(value.toFixed(1));
}

function clampPercentile(value: number) {
  if (!Number.isFinite(value)) return 80;
  return Math.min(100, Math.max(0, roundToOne(value)));
}

function emptyDistribution(): MeasureLikelihoodDistribution {
  return {
    oneStar: 0,
    twoStar: 0,
    threeStar: 0,
    fourStar: 0,
    fiveStar: 0,
    fourPlus: 0,
    fiveOnly: 0,
  };
}

export function buildDistribution(observations: MeasureObservation[]): MeasureLikelihoodDistribution {
  if (observations.length === 0) return emptyDistribution();

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  let totalWeight = 0;
  for (const observation of observations) {
    const w = observation.yearWeight;
    counts[observation.starRating] += w;
    totalWeight += w;
  }

  const asPercent = (count: number) => roundToOne((count / totalWeight) * 100);
  return {
    oneStar: asPercent(counts[1]),
    twoStar: asPercent(counts[2]),
    threeStar: asPercent(counts[3]),
    fourStar: asPercent(counts[4]),
    fiveStar: asPercent(counts[5]),
    fourPlus: asPercent(counts[4] + counts[5]),
    fiveOnly: asPercent(counts[5]),
  };
}

export function buildLikelihoodPoint(observations: MeasureObservation[], percentile: number): MeasureLikelihoodPoint {
  const target = clampPercentile(percentile);

  for (const radius of LOOKUP_RADII) {
    const candidates = observations.filter((observation) => Math.abs(observation.percentile - target) <= radius);
    if (candidates.length >= MIN_LOOKUP_SAMPLE || radius === LOOKUP_RADII[LOOKUP_RADII.length - 1]) {
      return {
        percentile: target,
        sampleSize: candidates.length,
        windowStart: clampPercentile(target - radius),
        windowEnd: clampPercentile(target + radius),
        distribution: buildDistribution(candidates),
      };
    }
  }

  return {
    percentile: target,
    sampleSize: 0,
    windowStart: target,
    windowEnd: target,
    distribution: emptyDistribution(),
  };
}


function buildSeries(
  key: string,
  label: string,
  years: number[],
  observations: MeasureObservation[],
  percentile: number
): MeasureLikelihoodSeries {
  const sorted = observations.toSorted((a, b) => a.percentile - b.percentile);
  return {
    key,
    label,
    years,
    observationCount: sorted.length,
    curve: Array.from({ length: 101 }, (_, index) => buildLikelihoodPoint(sorted, index)),
    lookup: buildLikelihoodPoint(sorted, percentile),
  };
}

function getDistributionValue(distribution: MeasureLikelihoodDistribution, targetStar: MeasureStarRating) {
  switch (targetStar) {
    case 1:
      return distribution.oneStar;
    case 2:
      return distribution.twoStar;
    case 3:
      return distribution.threeStar;
    case 4:
      return distribution.fourStar;
    case 5:
      return distribution.fiveStar;
  }
}

function calcThresholdPercentile(
  scores: number[],
  threshold: number,
  inverted: boolean,
  method: PercentileMethod
) {
  if (scores.length === 0) return null;

  if (method === "percentrank_inc") {
    if (scores.length <= 1) return null;
    const matchCount = inverted ? scores.filter((score) => score > threshold).length : scores.filter((score) => score < threshold).length;
    return roundToOne((matchCount / (scores.length - 1)) * 100);
  }

  const left = inverted
    ? scores.filter((s) => s > threshold).length
    : scores.filter((s) => s < threshold).length;
  const right = inverted
    ? scores.filter((s) => s >= threshold).length
    : scores.filter((s) => s <= threshold).length;
  return roundToOne(((right + left + (right > left ? 1 : 0)) * 50) / scores.length);
}

function resolveSelectedMeasure(requestedMeasure: string | null | undefined, availableMeasures: string[]) {
  if (requestedMeasure) {
    const directMatch = availableMeasures.find((measure) => measure === requestedMeasure);
    if (directMatch) return directMatch;

    const folded = requestedMeasure.trim().toLowerCase();
    const caseInsensitiveMatch = availableMeasures.find((measure) => measure.toLowerCase() === folded);
    if (caseInsensitiveMatch) return caseInsensitiveMatch;
  }

  return availableMeasures.includes("Breast Cancer Screening") ? "Breast Cancer Screening" : (availableMeasures[0] ?? "");
}

async function buildDataset(method: PercentileMethod): Promise<MeasureDataset> {
  const contractOutput = await getContractPercentilesOutput(method);
  const cutPointsByYear = loadMeasureCutPoints(CUT_POINTS_WORKBOOK_PATH, [...SUPPORTED_MEASURE_YEARS]);
  const byMeasure = new Map<string, MeasureDatasetEntry>();

  for (const [yearKey, contracts] of Object.entries(contractOutput.years ?? {})) {
    const year = Number(yearKey);
    if (!SUPPORTED_MEASURE_YEARS.includes(year as (typeof SUPPORTED_MEASURE_YEARS)[number])) {
      continue;
    }

    const cutPoints = cutPointsByYear.get(year) ?? [];
    const matchedCutPointsByCode = new Map<string, ReturnType<typeof matchCutPointToMeasureName>>();

    for (const contract of contracts) {
      for (const [measureCode, measure] of Object.entries(contract.measures ?? {})) {
        if (typeof measure.name !== "string" || typeof measure.score !== "number" || typeof measure.percentile !== "number") {
          continue;
        }

        const codePrefix = measureCode.slice(0, 1).toUpperCase() || null;
        let cutPoint = matchedCutPointsByCode.get(measureCode);
        if (cutPoint === undefined) {
          cutPoint = matchCutPointToMeasureName(measure.name, codePrefix, cutPoints);
          matchedCutPointsByCode.set(measureCode, cutPoint);
        }
        if (!cutPoint) continue;

        const inverted = typeof measure.inverted === "boolean" ? measure.inverted : isInvertedMeasure(cutPoint.measureName);
        const observation: MeasureObservation = {
          year,
          contractId: contract.contract_id,
          contractName: contract.contract_name,
          orgName: contract.org_name,
          measureCode,
          measureName: cutPoint.measureName,
          score: measure.score,
          percentile: clampPercentile(measure.percentile),
          starRating: deriveMeasureStarRating(measure.score, cutPoint, inverted),
          inverted,
          yearWeight: YEAR_RECENCY_WEIGHTS[year] ?? 1,
        };

        const existing = byMeasure.get(cutPoint.measureName) ?? {
          observations: [],
          metadataByYear: new Map<number, MeasureYearMetadata>(),
        };
        existing.observations.push(observation);

        const currentMeta = existing.metadataByYear.get(year);
        existing.metadataByYear.set(year, {
          year,
          measureName: cutPoint.measureName,
          measureCode: currentMeta?.measureCode ?? measureCode,
          hlCode: cutPoint.hlCode,
          domain: cutPoint.domain,
          weight: cutPoint.weight,
          inverted,
          thresholds: {
            twoStar: cutPoint.thresholds.twoStar,
            threeStar: cutPoint.thresholds.threeStar,
            fourStar: cutPoint.thresholds.fourStar,
            fiveStar: cutPoint.thresholds.fiveStar,
          },
          observationCount: (currentMeta?.observationCount ?? 0) + 1,
        });

        byMeasure.set(cutPoint.measureName, existing);
      }
    }
  }

  return {
    availableMeasures: Array.from(byMeasure.keys()).toSorted((a, b) => a.localeCompare(b)),
    byMeasure,
  };
}

async function loadDataset(method: PercentileMethod) {
  const cached = datasetCache.get(method);
  if (cached) return cached;

  const datasetPromise = buildDataset(method).catch((error) => {
    datasetCache.delete(method);
    throw error;
  });
  datasetCache.set(method, datasetPromise);
  return datasetPromise;
}

export async function getMeasureLikelihoodTableData(params: {
  method?: PercentileMethod;
  targetStar?: string | null;
}): Promise<MeasureLikelihoodTableResponse> {
  const method = params.method ?? "percentrank_inc";
  const parsedTargetStar = Number(params.targetStar ?? "4");
  const targetStar: MeasureStarRating = [1, 2, 3, 4, 5].includes(parsedTargetStar)
    ? (parsedTargetStar as MeasureStarRating)
    : 4;

  try {
    const dataset = await loadDataset(method);
    if (dataset.availableMeasures.length === 0) {
      return {
        status: "missing_inputs",
        method,
        targetStar,
        availableMeasures: [],
        percentileColumns: [],
        views: [],
        assumptions: [],
        error: "No matched measure-level records were found for 2024-2026.",
      };
    }

    const percentileColumns = Array.from({ length: 101 }, (_, index) => index);
    const measureEntries = dataset.availableMeasures.flatMap((measureName) => {
      const entry = dataset.byMeasure.get(measureName);
      return entry ? [[measureName, entry] as const] : [];
    });

    const buildRows = (labelYears: number[]) =>
      measureEntries.map(([measureName, entry]) => {
        const observations = entry.observations.filter((observation) => labelYears.includes(observation.year));
        const metadata =
          labelYears
            .toReversed()
            .map((year) => entry.metadataByYear.get(year))
            .find((value) => value !== undefined) ?? Array.from(entry.metadataByYear.values())[0];

        return {
          measureName,
          domain: metadata?.domain ?? null,
          weight: metadata?.weight ?? null,
          inverted: metadata?.inverted ?? false,
          cells: percentileColumns.map((percentile) => {
            const point = buildLikelihoodPoint(observations, percentile);
            return {
              percentile,
              likelihood: getDistributionValue(point.distribution, targetStar),
              sampleSize: point.sampleSize,
              windowStart: point.windowStart,
              windowEnd: point.windowEnd,
            };
          }),
        };
      });

    return {
      status: "ready",
      method,
      targetStar,
      availableMeasures: dataset.availableMeasures,
      percentileColumns,
      views: [
        {
          key: "pooled_2024_2026",
          label: "2024-2026 pooled",
          years: [...SUPPORTED_MEASURE_YEARS],
          rows: buildRows([...SUPPORTED_MEASURE_YEARS]),
        },
        {
          key: "year_2026",
          label: "2026 only",
          years: [2026],
          rows: buildRows([2026]),
        },
      ],
      assumptions: [
        "Each cell is the empirical chance of hitting the selected exact star level at that percentile.",
        "Likelihoods use the smallest percentile window that yields at least 15 observations, up to a +/-20 percentile-point band.",
        "Measure stars are derived from year-specific CMS cut points, keyed by stable measure names.",
        "Pooled view applies recency weighting: 2024 (1x), 2025 (2x), 2026 (3x).",
      ],
    };
  } catch (error) {
    return {
      status: "error",
      method,
      targetStar,
      availableMeasures: [],
      percentileColumns: [],
      views: [],
      assumptions: [],
      error: error instanceof Error ? error.message : "Failed to build measure likelihood table.",
    };
  }
}

export async function getMeasureStarPercentileData(params: {
  method?: PercentileMethod;
  measure?: string | null;
  star?: string | null;
}): Promise<MeasureStarPercentileResponse> {
  const method = params.method ?? "percentrank_inc";
  const parsedStar = Number(params.star ?? "4");
  const selectedStar: MeasureSelectableStar = [2, 3, 4, 5].includes(parsedStar) ? (parsedStar as MeasureSelectableStar) : 4;

  try {
    const dataset = await loadDataset(method);
    if (dataset.availableMeasures.length === 0) {
      return {
        status: "missing_inputs",
        method,
        selectedMeasure: "",
        selectedStar,
        availableMeasures: [],
        yearlyResults: [],
        historicalSummary: null,
        year2026Result: null,
        assumptions: [],
        error: "No matched measure-level records were found for 2024-2026.",
      };
    }

    const selectedMeasure = resolveSelectedMeasure(params.measure, dataset.availableMeasures);
    const entry = dataset.byMeasure.get(selectedMeasure);
    if (!entry) {
      return {
        status: "error",
        method,
        selectedMeasure,
        selectedStar,
        availableMeasures: dataset.availableMeasures,
        yearlyResults: [],
        historicalSummary: null,
        year2026Result: null,
        assumptions: [],
        error: `No measure records were found for "${selectedMeasure}".`,
      };
    }

    const yearlyResults = Array.from(entry.metadataByYear.values())
      .toSorted((a, b) => a.year - b.year)
      .map((metadata) => {
        const scores = entry.observations.filter((observation) => observation.year === metadata.year).map((observation) => observation.score);
        const cutPointScore =
          selectedStar === 2
            ? metadata.thresholds.twoStar
            : selectedStar === 3
              ? metadata.thresholds.threeStar
              : selectedStar === 4
                ? metadata.thresholds.fourStar
                : metadata.thresholds.fiveStar;

        return {
          year: metadata.year,
          star: selectedStar,
          cutPointScore,
          percentileEquivalent: calcThresholdPercentile(scores, cutPointScore, metadata.inverted, method),
          sampleSize: scores.length,
        };
      });

    const validPercentiles = yearlyResults.filter(
      (result): result is typeof result & { percentileEquivalent: number } => typeof result.percentileEquivalent === "number"
    );
    const effectiveWeights = validPercentiles.map((result) => result.sampleSize * (YEAR_RECENCY_WEIGHTS[result.year] ?? 1));
    const totalEffectiveWeight = effectiveWeights.reduce((sum, w) => sum + w, 0);
    const weightedAveragePercentile =
      totalEffectiveWeight > 0
        ? roundToOne(
            validPercentiles.reduce(
              (sum, result, index) => sum + result.percentileEquivalent * effectiveWeights[index]!,
              0
            ) / totalEffectiveWeight
          )
        : null;
    const totalSampleSize = validPercentiles.reduce((sum, result) => sum + result.sampleSize, 0);

    return {
      status: "ready",
      method,
      selectedMeasure,
      selectedStar,
      availableMeasures: dataset.availableMeasures,
      yearlyResults,
      historicalSummary:
        validPercentiles.length > 0
          ? {
              weightedAveragePercentile,
              minPercentile: Math.min(...validPercentiles.map((result) => result.percentileEquivalent)),
              maxPercentile: Math.max(...validPercentiles.map((result) => result.percentileEquivalent)),
              totalSampleSize,
            }
          : null,
      year2026Result: yearlyResults.find((result) => result.year === 2026) ?? null,
      assumptions: [
        "Percentile equivalents are calculated from the selected star cut point for each year.",
        "Historical summary uses sample-size and recency weighting: 2024 (1x), 2025 (2x), 2026 (3x).",
        "Only stars 2 through 5 are shown because they map directly to explicit CMS cut points.",
      ],
    };
  } catch (error) {
    return {
      status: "error",
      method,
      selectedMeasure: params.measure ?? "",
      selectedStar,
      availableMeasures: [],
      yearlyResults: [],
      historicalSummary: null,
      year2026Result: null,
      assumptions: [],
      error: error instanceof Error ? error.message : "Failed to build measure star percentile analysis.",
    };
  }
}

export async function getMeasureLikelihoodData(params: {
  method?: PercentileMethod;
  measure?: string | null;
  percentile?: string | null;
}): Promise<MeasureLikelihoodResponse> {
  const method = params.method ?? "percentrank_inc";

  try {
    const dataset = await loadDataset(method);
    if (dataset.availableMeasures.length === 0) {
      return {
        status: "missing_inputs",
        method,
        selectedMeasure: "",
        selectedPercentile: 80,
        availableMeasures: [],
        metadataByYear: [],
        series: [],
        assumptions: [],
        error: "No matched measure-level records were found for 2024-2026.",
      };
    }

    const selectedMeasure = resolveSelectedMeasure(params.measure, dataset.availableMeasures);
    const selectedPercentile = clampPercentile(Number(params.percentile ?? "80"));
    const entry = dataset.byMeasure.get(selectedMeasure);
    if (!entry) {
      return {
        status: "error",
        method,
        selectedMeasure,
        selectedPercentile,
        availableMeasures: dataset.availableMeasures,
        metadataByYear: [],
        series: [],
        assumptions: [],
        error: `No measure records were found for "${selectedMeasure}".`,
      };
    }

    const metadataByYear = Array.from(entry.metadataByYear.values()).toSorted((a, b) => a.year - b.year);
    const yearlySeries = metadataByYear
      .map((metadata) => {
        const observations = entry.observations.filter((observation) => observation.year === metadata.year);
        return buildSeries(String(metadata.year), String(metadata.year), [metadata.year], observations, selectedPercentile);
      })
      .filter((series) => series.observationCount > 0);

    return {
      status: "ready",
      method,
      selectedMeasure,
      selectedPercentile,
      availableMeasures: dataset.availableMeasures,
      metadataByYear,
      series: [
        buildSeries("pooled", "2024-2026 pooled", [...SUPPORTED_MEASURE_YEARS], entry.observations, selectedPercentile),
        ...yearlySeries,
      ],
      assumptions: [
        "Likelihoods are empirical and based on historical contract observations for the selected measure.",
        "Each lookup uses the smallest percentile window that yields at least 15 observations, up to a +/-20 percentile-point band.",
        "Measure stars are derived from CMS cut points for that year, using whole-star outcomes only.",
        "Pooled series applies recency weighting: 2024 (1x), 2025 (2x), 2026 (3x).",
      ],
    };
  } catch (error) {
    return {
      status: "error",
      method,
      selectedMeasure: params.measure ?? "",
      selectedPercentile: clampPercentile(Number(params.percentile ?? "80")),
      availableMeasures: [],
      metadataByYear: [],
      series: [],
      assumptions: [],
      error: error instanceof Error ? error.message : "Failed to build measure likelihood analysis.",
    };
  }
}
