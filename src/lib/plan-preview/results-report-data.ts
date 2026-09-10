import { existsSync, readFileSync } from "fs";
import path from "path";

import { getMeasureYearScoreSamples } from "@/lib/band-movement/analysis";
import { loadMeasureStarsFromFile } from "@/lib/reward-factor/backtest";
import { getOfficialForUsage } from "@/lib/reward-factor/official-threshold-data";

import { scoreForecastOnOfficialInputs } from "./forecast-official-score";
import type { PlanPreviewFinalScore } from "./final-scores";
import { toBaselineMeasureCode } from "./measure-resolve";
import type { PlanPreviewPredictionsResult } from "./predictions";
import { buildOfficialRemovalScenarios } from "./official-scenarios";
import {
  toReportScenarios,
  type ReportHistoryPoint,
  type ReportYoySummary,
} from "./report-data";
import { buildResultsBookCompare } from "./results-book-compare";
import { buildRiskOpportunityRows } from "./risk-opportunity";
import type { OfficialStarRow, OfficialSummaryRow } from "./official-row-types";
import type {
  PlanPreviewResultsReport,
  ResultsAccuracyRow,
  ResultsDomain,
  ResultsMeasure,
  ResultsOfficialSummary,
  ResultsPp1PublishedScore,
  ResultsRewardFactorThresholds,
} from "./results-report-types";

export type {
  PlanPreviewResultsReport,
  ResultsAccuracyRow,
  ResultsDomain,
  ResultsMeasure,
  ResultsOfficialSummary,
  ResultsPp1PublishedScore,
  ResultsRewardFactorThresholds,
} from "./results-report-types";

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * The Overall the PP1 contract report published: the without-QI leg
 * (QI is not scored at PP1). Pass the baseline scenario contract from
 * `getPlanPreviewRun().scenarios[0]`, not `forecastBaseline`.
 */
export function publishedScoreFromForecast(
  contract: PlanPreviewFinalScore | null | undefined,
): ResultsPp1PublishedScore | null {
  const leg = contract?.withoutQi ?? contract?.withQi;
  if (!leg || !contract) return null;
  const finalScoreRaw = contract.withoutQi?.finalScoreRaw ?? contract.finalScoreRaw;
  const finalRating = contract.withoutQi
    ? Math.round(Math.min(5, Math.max(1, contract.withoutQi.finalScoreRaw)) * 2) / 2
    : contract.finalRating;
  if (finalScoreRaw === null || finalRating === null) return null;
  return {
    measureCount: leg.measureCount,
    baseMean: leg.baseMean,
    weightedVariance: leg.weightedVariance,
    rewardFactor: leg.rewardFactor,
    caiValue: contract.caiValue,
    finalScoreRaw,
    finalRating,
  };
}

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
    rows.find((row) => String(row.CONTRACT_ID ?? "").trim().toUpperCase() === contractId) ?? null
  );
}

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

function weightedMean(items: { star: number | null; weight: number }[]): number | null {
  let sum = 0;
  let weightSum = 0;
  for (const item of items) {
    if (item.star === null) continue;
    sum += item.star * item.weight;
    weightSum += item.weight;
  }
  return weightSum > 0 ? Math.round((sum / weightSum) * 100) / 100 : null;
}

const NEW_MEASURE_DOMAINS: Record<string, string> = {
  D13: "Pharmacy",
};

export function publishedFinalRating(summary: ResultsOfficialSummary | null): number | null {
  return summary?.finalRating ?? null;
}

/** CMS summary usage text ("Yes"/"No", "With"/"Without") → included flag; defaults to included. */
function usageIncluded(value: string | null | undefined): boolean {
  const text = (value ?? "").trim().toLowerCase();
  return !(text === "no" || text === "without" || text === "n" || text === "false");
}

export function resolveRewardFactorThresholds(
  starsYear: number,
  overall: ResultsOfficialSummary | null
): ResultsRewardFactorThresholds | null {
  const usage = {
    improvementIncluded: usageIncluded(overall?.improvementUsage),
    newMeasuresIncluded: usageIncluded(overall?.newMeasureUsage),
  };
  const thresholds = getOfficialForUsage(starsYear, "overall_mapd", usage);
  return thresholds ? { ...thresholds, ...usage } : null;
}

export function buildupChecksOut(summary: ResultsOfficialSummary | null, digits = 6): boolean {
  if (!summary || summary.calculatedMean === null || summary.finalSummary === null) return false;
  const reward = summary.rewardFactor ?? 0;
  const cai = summary.caiValue ?? 0;
  const expected = summary.calculatedMean + reward + cai;
  return Math.abs(expected - summary.finalSummary) < 10 ** -digits + 1e-9;
}

export function buildPlanPreviewResultsReport(options: {
  starsYear: number;
  contractId: string;
  officialStars: OfficialStarRow[];
  officialSummaries: OfficialSummaryRow[];
  domainByCode: Map<string, string>;
  weightByCode: Map<string, number>;
  predictions?: PlanPreviewPredictionsResult | null;
  overallPredicted?: number | null;
  overallUpside?: number | null;
  pp1Published?: ResultsPp1PublishedScore | null;
  officialMarketStars?: OfficialStarRow[];
  officialMarketSummaries?: OfficialSummaryRow[];
  /** When set, skip CMS published-file lookup for this contract (synthetic samples). */
  publishedBaselineByCode?: Map<string, number | null>;
  publishedBaselineScoreByCode?: Map<string, number | null>;
  history?: ReportHistoryPoint[];
}): PlanPreviewResultsReport {
  const { starsYear, contractId, officialStars, officialSummaries, domainByCode, weightByCode } =
    options;
  const baselineYear = starsYear - 1;
  const publishedStarByCode =
    options.publishedBaselineByCode ??
    new Map(
      (loadMeasureStarsFromFile(baselineYear).get(contractId) ?? []).map((measure) => [
        measure.code.toUpperCase(),
        measure.starValue,
      ]),
    );
  const predictedMeasures =
    options.predictions?.contracts.find((entry) => entry.contractId === contractId)?.measures ?? [];
  const predictedByCode = new Map(
    predictedMeasures.map((measure) => [measure.measureCode.toUpperCase(), measure])
  );

  const overall = officialSummaries.find((row) => row.ratingType === "overall") ?? null;
  const partC = officialSummaries.find((row) => row.ratingType === "part_c") ?? null;
  const partD = officialSummaries.find((row) => row.ratingType === "part_d") ?? null;

  // QI is never in the PP2 measure-data pool; its score arrives with the
  // improve_c / improve_d files and lives on the Part C / Part D summary rows.
  const qiScoreForCode = (measureCode: string): number | null =>
    (measureCode.toUpperCase().startsWith("D") ? partD : partC)?.improvementScore ?? null;

  const first = officialStars[0];
  const measures: ResultsMeasure[] = officialStars.map((row) => {
    const baselineCode = toBaselineMeasureCode(row.measureNormalized, row.measureCode, baselineYear);
    const predicted = predictedByCode.get(row.measureCode.toUpperCase());
    const isQi = /quality improvement/i.test(row.measureDisplayName);
    const code = row.measureCode.toUpperCase();
    return {
      ...row,
      domain: domainByCode.get(baselineCode) ?? NEW_MEASURE_DOMAINS[baselineCode] ?? null,
      weight:
        weightByCode.get(code) ??
        weightByCode.get(baselineCode) ??
        (isQi ? 5 : 1),
      publishedBaselineStar:
        publishedStarByCode.get(row.measureCode.toUpperCase()) ??
        publishedStarByCode.get(baselineCode) ??
        null,
      publishedBaselineScore:
        options.publishedBaselineScoreByCode?.get(row.measureCode.toUpperCase()) ??
        options.publishedBaselineScoreByCode?.get(baselineCode) ??
        (options.publishedBaselineScoreByCode
          ? null
          : (getMeasureYearScoreSamples(row.measureNormalized, baselineYear).find(
              (sample) => sample.contractId === contractId
            )?.score ?? null)),
      pp1Score: predicted?.score ?? (isQi ? qiScoreForCode(row.measureCode) : null),
      // What PP1 projected on its forecast cut points — not the applied star,
      // which is re-banded on the official Tech Notes once imported.
      pp1PredictedStar: predicted?.forecastStar ?? null,
      pp1UpsideStar: null,
      inverted: predicted?.inverted,
    };
  });

  const yoySummary: ReportYoySummary = { declined: 0, held: 0, improved: 0, newOrUnrated: 0 };
  for (const measure of measures) {
    if (measure.star === null || measure.publishedBaselineStar === null) {
      yoySummary.newOrUnrated += 1;
    } else if (measure.star > measure.publishedBaselineStar) {
      yoySummary.improved += 1;
    } else if (measure.star < measure.publishedBaselineStar) {
      yoySummary.declined += 1;
    } else {
      yoySummary.held += 1;
    }
  }

  const byDomain = new Map<string, ResultsMeasure[]>();
  for (const measure of measures) {
    const domain = measure.domain ?? "Other";
    const existing = byDomain.get(domain);
    if (existing) existing.push(measure);
    else byDomain.set(domain, [measure]);
  }
  const domains: ResultsDomain[] = [...byDomain.entries()]
    .map(([domain, domainMeasures]) => {
      const parts = new Set(
        domainMeasures.map((measure) => (measure.measureCode.startsWith("D") ? "Part D" : "Part C"))
      );
      return {
        domain,
        part: (parts.size > 1 ? "Mixed" : parts.has("Part D") ? "Part D" : "Part C") as ResultsDomain["part"],
        measureCount: domainMeasures.length,
        ratedMeasureCount: domainMeasures.filter((measure) => measure.star !== null).length,
        officialMean: weightedMean(domainMeasures.map((measure) => ({ star: measure.star, weight: measure.weight }))),
        baselineMean: weightedMean(
          domainMeasures.map((measure) => ({ star: measure.publishedBaselineStar, weight: measure.weight }))
        ),
      };
    })
    .sort((left, right) => {
      if (left.part !== right.part) return left.part.localeCompare(right.part);
      return left.domain.localeCompare(right.domain);
    });

  const rewardFactorThresholds = resolveRewardFactorThresholds(starsYear, overall);
  const predictedBuildup = scoreForecastOnOfficialInputs({
    contractId,
    baselineYear,
    predictedMeasures,
    officialStars,
    thresholds: rewardFactorThresholds,
    caiValue: overall?.caiValue ?? null,
    improvementIncluded: rewardFactorThresholds?.improvementIncluded ?? true,
  });
  const pp1Published = options.pp1Published ?? null;
  const overallPredicted =
    pp1Published?.finalRating ?? options.overallPredicted ?? predictedBuildup?.finalRating ?? null;
  const overallOfficial = overall?.finalRating ?? null;
  const overallInEnvelope =
    overallPredicted === null || overallOfficial === null
      ? null
      : overallOfficial === overallPredicted ||
        (options.overallUpside != null &&
          overallOfficial >= Math.min(overallPredicted, options.overallUpside) &&
          overallOfficial <= Math.max(overallPredicted, options.overallUpside));

  const accuracy: ResultsAccuracyRow[] = measures.map((measure) => {
    const predictedStar = measure.pp1PredictedStar;
    const officialStar = measure.star;
    const delta =
      predictedStar === null || officialStar === null ? null : officialStar - predictedStar;
    return {
      measureCode: measure.measureCode,
      displayName: measure.measureDisplayName,
      predictedStar,
      officialStar,
      delta,
      inUpsideEnvelope: null,
    };
  });
  const compared = accuracy.filter((row) => row.delta !== null);
  const exact = compared.filter((row) => row.delta === 0).length;
  const withinOne = compared.filter((row) => row.delta !== null && Math.abs(row.delta) <= 1).length;
  const { risk, opportunity } = buildRiskOpportunityRows(measures, starsYear);
  const marketStars = options.officialMarketStars ?? officialStars;
  const marketSummaries = options.officialMarketSummaries ?? officialSummaries;
  const contractCodes = new Set(
    officialStars
      .filter((row) => row.star !== null)
      .map((row) => toBaselineMeasureCode(row.measureNormalized, row.measureCode, baselineYear)),
  );
  const scenarios = toReportScenarios(
    buildOfficialRemovalScenarios(
      starsYear,
      options.predictions ?? null,
      marketStars,
      marketSummaries,
      weightByCode,
    ),
    contractId,
    contractCodes,
  );

  return {
    starsYear,
    baselineYear,
    generatedAt: new Date().toISOString(),
    contract: {
      contractId,
      contractName: first?.contractName ?? overall?.contractName ?? null,
      parentOrganization: first?.parentOrganization ?? overall?.parentOrganization ?? null,
    },
    overall,
    partC,
    partD,
    rewardFactorThresholds,
    measures,
    domains,
    history: options.history ?? buildHistory(contractId, starsYear),
    yoySummary,
    accuracy,
    accuracySummary: {
      compared: compared.length,
      exact,
      withinOne,
      overallPredicted,
      overallOfficial,
      overallInEnvelope,
      pp1Published,
      predictedBuildup,
    },
    risk,
    opportunity,
    bookCompare: buildResultsBookCompare({
      contractId,
      measures,
      predictions: options.predictions,
    }),
    scenarios,
  };
}
