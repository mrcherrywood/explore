import { existsSync, readFileSync } from "fs";
import path from "path";

import { getMeasureYearScoreSamples } from "@/lib/band-movement/analysis";
import { isCahpsMeasure } from "@/lib/band-movement/cut-point-methodology";
import { OFFICIAL_RECALC_REMOVED_CODES } from "@/lib/clover-impact/scenarios";
import { loadMeasureStarsFromFile } from "@/lib/reward-factor/backtest";

import type {
  PlanPreviewFinalScore,
  PlanPreviewFinalScoresResult,
  PlanPreviewQiSensitivityPoint,
  PlanPreviewScenarioId,
} from "./final-scores";
import { buildPlanPreviewQiSensitivity, type PlanPreviewCaiRecords } from "./final-scores";
import { toBaselineMeasureCode } from "./measure-resolve";
import type {
  PlanPreviewContractMeasurePrediction,
  PlanPreviewContractPrediction,
  PlanPreviewPredictionsResult,
} from "./predictions";
import { scoreForCutPointBanding } from "./predictions";
import {
  buildMeasureStarOutlook,
  buildOverallStarOutlook,
  thresholdValuesFromForecast,
  type MeasureStarOutlook,
  type OverallStarOutlook,
} from "./star-outlook";

const DATA_DIR = path.join(process.cwd(), "data");

export type ReportMeasure = PlanPreviewContractMeasurePrediction & {
  domain: string | null;
  /** The contract's actual published star for this measure in the baseline year. */
  publishedBaselineStar: number | null;
  /** Published CMS measure score for the baseline year, when available. */
  publishedBaselineScore: number | null;
  /** Experimental asymmetric cut-point outlook (null when not cut-point banded). */
  outlook: MeasureStarOutlook | null;
};

export type ReportDomain = {
  domain: string;
  part: "Part C" | "Part D" | "Mixed";
  measureCount: number;
  ratedMeasureCount: number;
  predictedMean: number | null;
  /** Weighted mean of the contract's published baseline-year measure stars in this domain. */
  baselineMean: number | null;
  /**
   * Weighted mean after dropping Official CMS Stars recalculation removals
   * from the published baseline-year stars (same codes as Clover officialRecalc).
   */
  recalculatedMean: number | null;
};

export type ReportHistoryPoint = {
  year: number;
  overall: number | null;
  partC: number | null;
  partD: number | null;
};

export type ReportScenario = {
  id: PlanPreviewScenarioId;
  label: string;
  description: string;
  caiSource: "overall" | "part_c";
  /** Codes removed under this scenario that the contract actually has accrued. */
  removedContractCodes: string[];
  score: PlanPreviewFinalScore | null;
  thresholds: PlanPreviewFinalScoresResult["thresholds"];
  notes: string[];
};

export type ReportYoySummary = {
  declined: number;
  held: number;
  improved: number;
  newOrUnrated: number;
};

export type PlanPreviewContractReport = {
  starsYear: number;
  baselineYear: number | null;
  generatedAt: string;
  contract: {
    contractId: string;
    contractName: string | null;
    parentOrganization: string | null;
    organizationType: string | null;
    snp: string | null;
  };
  measures: ReportMeasure[];
  domains: ReportDomain[];
  history: ReportHistoryPoint[];
  yoySummary: ReportYoySummary;
  scenarios: ReportScenario[];
  /** Overall final score when QI measures are set to each whole-star rating 1–5. */
  qiSensitivity: PlanPreviewQiSensitivityPoint[];
  populationSize: number;
  /**
   * Experimental overall envelope: base predicted rating vs upside if measure
   * cut points ease within historical methodology error.
   */
  overallOutlook: OverallStarOutlook | null;
};

type RawSummaryRow = Record<string, string | number | null | undefined>;

function parseRating(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function loadSummaryRows(year: number): RawSummaryRow[] | null {
  const filePath = path.join(DATA_DIR, String(year), `summary_rating_${year}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as RawSummaryRow[];
  } catch {
    return null;
  }
}

function findSummaryRow(rows: RawSummaryRow[], contractId: string): RawSummaryRow | null {
  return (
    rows.find(
      (row) => String(row.CONTRACT_ID ?? "").trim().toUpperCase() === contractId
    ) ?? null
  );
}

/** Published Overall / Part C / Part D summary ratings for every available year. */
function buildHistory(contractId: string, starsYear: number): ReportHistoryPoint[] {
  const history: ReportHistoryPoint[] = [];
  for (let year = starsYear - 4; year < starsYear; year += 1) {
    const rows = loadSummaryRows(year);
    if (!rows) continue;
    const row = findSummaryRow(rows, contractId);
    history.push({
      year,
      overall: row ? parseRating(row[`${year} Overall`]) : null,
      partC: row ? parseRating(row[`${year} Part C Summary`]) : null,
      partD: row ? parseRating(row[`${year} Part D Summary`]) : null,
    });
  }
  return history;
}

function weightedMean(
  items: { star: number | null; weight: number }[]
): number | null {
  let sum = 0;
  let weightSum = 0;
  for (const item of items) {
    if (item.star === null) continue;
    sum += item.star * item.weight;
    weightSum += item.weight;
  }
  return weightSum > 0 ? Math.round((sum / weightSum) * 100) / 100 : null;
}

export type PublishedMeasureMeta = {
  domain: string | null;
  weight: number | null;
};

/**
 * Weighted domain means using the same inputs as Contract Summary: published
 * measure stars + `ma_measures` domain/weight for that year.
 */
export function computeWeightedDomainMeans(
  starredMeasures: { code: string; star: number }[],
  measureMetaByCode: Map<string, PublishedMeasureMeta>
): Map<string, number | null> {
  const byDomain = new Map<string, { star: number | null; weight: number }[]>();
  for (const measure of starredMeasures) {
    const meta = measureMetaByCode.get(measure.code.toUpperCase());
    if (!meta?.domain) continue;
    const weight = meta.weight;
    if (weight === null || weight === undefined || !Number.isFinite(weight) || weight <= 0) {
      continue;
    }
    if (!Number.isFinite(measure.star) || measure.star <= 0) continue;
    const existing = byDomain.get(meta.domain);
    const entry = { star: measure.star, weight };
    if (existing) existing.push(entry);
    else byDomain.set(meta.domain, [entry]);
  }

  const means = new Map<string, number | null>();
  for (const [domain, items] of byDomain) {
    means.set(domain, weightedMean(items));
  }
  return means;
}

/** Fallback when DB metrics are unavailable: JSON measure stars + cut-point weights. */
function buildPublishedDomainMeansFromFile(
  contractId: string,
  baselineYear: number,
  domainByCode: Map<string, string>
): Map<string, number | null> {
  const published = loadMeasureStarsFromFile(baselineYear).get(contractId) ?? [];
  return computeWeightedDomainMeans(
    published.map((measure) => ({ code: measure.code, star: measure.starValue })),
    new Map(
      published.map((measure) => [
        measure.code.toUpperCase(),
        {
          domain: domainByCode.get(measure.code.toUpperCase()) ?? null,
          weight: measure.weight,
        },
      ])
    )
  );
}

function buildDomains(
  measures: ReportMeasure[],
  publishedDomainMeans: Map<string, number | null>,
  recalculatedDomainMeans: Map<string, number | null>
): ReportDomain[] {
  const byDomain = new Map<string, ReportMeasure[]>();
  for (const measure of measures) {
    const domain = measure.domain ?? "Other";
    const existing = byDomain.get(domain);
    if (existing) existing.push(measure);
    else byDomain.set(domain, [measure]);
  }

  const domains: ReportDomain[] = [];
  for (const [domain, domainMeasures] of byDomain) {
    const parts = new Set(
      domainMeasures.map((m) => (m.measureCode.startsWith("D") ? "Part D" : "Part C"))
    );
    const baselineMean =
      publishedDomainMeans.get(domain) ??
      weightedMean(
        domainMeasures.map((m) => ({ star: m.publishedBaselineStar, weight: m.weight }))
      );
    const keptForRecalc = domainMeasures.filter((measure) => {
      const code = measure.measureCode.toUpperCase();
      // Prefer baseline-year code when the measure was remapped for lookup.
      return !OFFICIAL_RECALC_REMOVED_CODES.has(code);
    });
    domains.push({
      domain,
      part: parts.size > 1 ? "Mixed" : parts.has("Part D") ? "Part D" : "Part C",
      measureCount: domainMeasures.length,
      ratedMeasureCount: domainMeasures.filter((m) => m.predictedStar !== null).length,
      predictedMean: weightedMean(
        domainMeasures.map((m) => ({ star: m.predictedStar, weight: m.weight }))
      ),
      baselineMean,
      recalculatedMean:
        recalculatedDomainMeans.get(domain) ??
        weightedMean(
          keptForRecalc.map((m) => ({ star: m.publishedBaselineStar, weight: m.weight }))
        ),
    });
  }

  return domains.sort((left, right) => {
    if (left.part !== right.part) return left.part.localeCompare(right.part);
    return left.domain.localeCompare(right.domain);
  });
}

/** Domain means from published baseline stars after Official Recalc removals. */
function buildRecalculatedDomainMeans(
  contractId: string,
  baselineYear: number,
  domainByCode: Map<string, string>
): Map<string, number | null> {
  const published = loadMeasureStarsFromFile(baselineYear).get(contractId) ?? [];
  const kept = published.filter(
    (measure) => !OFFICIAL_RECALC_REMOVED_CODES.has(measure.code.toUpperCase())
  );
  return computeWeightedDomainMeans(
    kept.map((measure) => ({ code: measure.code, star: measure.starValue })),
    new Map(
      kept.map((measure) => [
        measure.code.toUpperCase(),
        {
          domain: domainByCode.get(measure.code.toUpperCase()) ?? null,
          weight: measure.weight,
        },
      ])
    )
  );
}

function buildYoySummary(measures: ReportMeasure[]): ReportYoySummary {
  const summary: ReportYoySummary = { declined: 0, held: 0, improved: 0, newOrUnrated: 0 };
  for (const measure of measures) {
    if (measure.predictedStar === null || measure.publishedBaselineStar === null) {
      summary.newOrUnrated += 1;
    } else if (measure.predictedStar > measure.publishedBaselineStar) {
      summary.improved += 1;
    } else if (measure.predictedStar < measure.publishedBaselineStar) {
      summary.declined += 1;
    } else {
      summary.held += 1;
    }
  }
  return summary;
}

function buildScenarios(
  scenarios: PlanPreviewFinalScoresResult[],
  contractId: string,
  contractCodes: Set<string>
): ReportScenario[] {
  return scenarios.map((scenario) => ({
    id: scenario.id,
    label: scenario.label,
    description: scenario.description,
    caiSource: scenario.caiSource,
    removedContractCodes: scenario.removedCodes.filter((code) => contractCodes.has(code)),
    score: scenario.contracts.find((entry) => entry.contractId === contractId) ?? null,
    thresholds: scenario.thresholds,
    notes: scenario.notes,
  }));
}

/**
 * Domain assignments for measures new to a stars year that therefore have no
 * row in the baseline year's ma_measures table.
 */
const NEW_MEASURE_DOMAINS: Record<string, string> = {
  // Polypharmacy Poly-ACH, new for Stars 2027.
  D13: "Pharmacy",
};

/**
 * Assemble every data point the multi-page contract report needs: predicted
 * measure stars with domains, domain rollups, published rating history,
 * year-over-year movement vs the baseline published stars, and each
 * scenario's final-score projection for the contract.
 */
export function buildPlanPreviewContractReport(options: {
  predictions: PlanPreviewPredictionsResult;
  scenarios: PlanPreviewFinalScoresResult[];
  contract: PlanPreviewContractPrediction;
  domainByCode: Map<string, string>;
  /**
   * Preferred published domain means (Contract Summary methodology). When
   * omitted, falls back to measure_stars JSON + cut-point workbook weights.
   */
  publishedDomainMeans?: Map<string, number | null>;
  /** Uploaded CAI records — used for the QI sensitivity sweep. */
  cai?: PlanPreviewCaiRecords;
}): PlanPreviewContractReport {
  const { predictions, scenarios, contract, domainByCode } = options;
  const { starsYear, baselineYear } = predictions;
  const contractId = contract.contractId;

  const publishedBaseline = baselineYear !== null
    ? loadMeasureStarsFromFile(baselineYear).get(contractId) ?? []
    : [];
  const publishedStarByCode = new Map(
    publishedBaseline.map((measure) => [measure.code.toUpperCase(), measure.starValue])
  );

  const cutPointByMeasure = new Map(
    predictions.cutPoints.map((row) => [row.measureNormalized, row] as const)
  );

  // Domain and published-star lookups are keyed by baseline-year codes, so
  // translate each measure's file code (CMS renumbers codes between years).
  const measures: ReportMeasure[] = contract.measures.map((measure) => {
    const code =
      baselineYear !== null
        ? toBaselineMeasureCode(measure.measureNormalized, measure.measureCode, baselineYear)
        : measure.measureCode.toUpperCase();
    const publishedBaselineScore =
      baselineYear !== null
        ? (getMeasureYearScoreSamples(measure.measureNormalized, baselineYear).find(
            (sample) => sample.contractId === contractId
          )?.score ?? null)
        : null;
    const publishedBaselineStar = publishedStarByCode.get(code) ?? null;
    const cutPoint = cutPointByMeasure.get(measure.measureNormalized);
    const appliedThresholds = thresholdValuesFromForecast(cutPoint?.thresholds);
    const bandingScore =
      measure.score === null
        ? null
        : scoreForCutPointBanding(
            measure.score,
            null,
            isCahpsMeasure(measure.displayName),
            appliedThresholds
          );
    const outlook =
      bandingScore === null
        ? null
        : buildMeasureStarOutlook({
            measureNormalized: measure.measureNormalized,
            score: bandingScore,
            comparisonScore: measure.score ?? undefined,
            inverted: measure.inverted,
            starSource: measure.starSource,
            predictedStar: measure.predictedStar,
            publishedBaselineStar,
            publishedBaselineScore,
            appliedThresholds,
            modelThresholds: thresholdValuesFromForecast(cutPoint?.modelThresholds),
          });
    return {
      ...measure,
      domain: domainByCode.get(code) ?? NEW_MEASURE_DOMAINS[code] ?? null,
      publishedBaselineStar,
      publishedBaselineScore,
      outlook,
    };
  });

  const baselineSummaryRow = baselineYear !== null
    ? findSummaryRow(loadSummaryRows(baselineYear) ?? [], contractId)
    : null;

  // Scenario removal sets use baseline-year codes, so intersect on those.
  const contractCodes = new Set(
    measures.map((measure) =>
      baselineYear !== null
        ? toBaselineMeasureCode(measure.measureNormalized, measure.measureCode, baselineYear)
        : measure.measureCode.toUpperCase()
    )
  );

  const publishedDomainMeans =
    options.publishedDomainMeans ??
    (baselineYear !== null
      ? buildPublishedDomainMeansFromFile(contractId, baselineYear, domainByCode)
      : new Map<string, number | null>());

  const recalculatedDomainMeans =
    baselineYear !== null
      ? buildRecalculatedDomainMeans(contractId, baselineYear, domainByCode)
      : new Map<string, number | null>();

  const cai = options.cai ?? { overall: {}, partC: {}, partD: {} };
  const qiSensitivity = buildPlanPreviewQiSensitivity(predictions, cai, contractId);

  const reportScenarios = buildScenarios(scenarios, contractId, contractCodes);
  const baselineScenario = reportScenarios.find((scenario) => scenario.id === "baseline");
  const baselineScore = baselineScenario?.score ?? null;
  const baselineLeg =
    baselineScore?.selectedLeg === "with_qi"
      ? baselineScore.withQi
      : baselineScore?.withoutQi;
  const overallOutlook =
    baselineScore?.finalRating != null
      ? buildOverallStarOutlook({
          measures: measures.map((measure) => ({
            measureCode: measure.measureCode,
            weight: measure.weight,
            predictedStar: measure.predictedStar,
            outlook: measure.outlook,
          })),
          rewardFactor: baselineLeg?.rewardFactor ?? 0,
          caiValue: baselineScore.caiValue ?? 0,
          baseRounded: baselineScore.finalRating,
        })
      : null;

  return {
    starsYear,
    baselineYear,
    generatedAt: predictions.generatedAt,
    contract: {
      contractId,
      contractName: contract.contractName,
      parentOrganization: contract.parentOrganization,
      organizationType: baselineSummaryRow
        ? String(baselineSummaryRow["Organization Type"] ?? "").trim() || null
        : null,
      snp: baselineSummaryRow ? String(baselineSummaryRow.SNP ?? "").trim() || null : null,
    },
    measures,
    domains: buildDomains(measures, publishedDomainMeans, recalculatedDomainMeans),
    history: buildHistory(contractId, starsYear),
    yoySummary: buildYoySummary(measures),
    scenarios: reportScenarios,
    qiSensitivity,
    populationSize: scenarios[0]?.populationSize ?? 0,
    overallOutlook,
  };
}
