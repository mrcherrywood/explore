import { existsSync, readFileSync } from "fs";
import path from "path";

import { getMeasureYearScoreSamples } from "@/lib/band-movement/analysis";
import { loadMeasureStarsFromFile } from "@/lib/reward-factor/backtest";

import { toBaselineMeasureCode } from "./measure-resolve";
import type { PlanPreviewPredictionsResult } from "./predictions";
import type { ReportHistoryPoint, ReportYoySummary } from "./report-data";
import {
  buildRiskOpportunityRows,
  type RiskOpportunityRow,
} from "./risk-opportunity";
import type { OfficialStarRow, OfficialSummaryRow } from "./store-official";

const DATA_DIR = path.join(process.cwd(), "data");

export type ResultsOfficialSummary = OfficialSummaryRow;

export type ResultsMeasure = OfficialStarRow & {
  domain: string | null;
  weight: number;
  publishedBaselineStar: number | null;
  publishedBaselineScore: number | null;
  pp1Score: number | null;
  pp1PredictedStar: number | null;
  pp1UpsideStar: number | null;
  inverted?: boolean;
};

export type ResultsDomain = {
  domain: string;
  part: "Part C" | "Part D" | "Mixed";
  measureCount: number;
  ratedMeasureCount: number;
  officialMean: number | null;
  baselineMean: number | null;
};

export type ResultsAccuracyRow = {
  measureCode: string;
  displayName: string;
  predictedStar: number | null;
  officialStar: number | null;
  delta: number | null;
  inUpsideEnvelope: boolean | null;
};

export type PlanPreviewResultsReport = {
  starsYear: number;
  baselineYear: number | null;
  generatedAt: string;
  contract: {
    contractId: string;
    contractName: string | null;
    parentOrganization: string | null;
  };
  overall: ResultsOfficialSummary | null;
  partC: ResultsOfficialSummary | null;
  partD: ResultsOfficialSummary | null;
  measures: ResultsMeasure[];
  domains: ResultsDomain[];
  history: ReportHistoryPoint[];
  yoySummary: ReportYoySummary;
  accuracy: ResultsAccuracyRow[];
  accuracySummary: {
    compared: number;
    exact: number;
    withinOne: number;
    overallPredicted: number | null;
    overallOfficial: number | null;
    overallInEnvelope: boolean | null;
  };
  risk: RiskOpportunityRow[];
  opportunity: RiskOpportunityRow[];
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
}): PlanPreviewResultsReport {
  const { starsYear, contractId, officialStars, officialSummaries, domainByCode, weightByCode } =
    options;
  const baselineYear = starsYear - 1;
  const publishedBaseline = loadMeasureStarsFromFile(baselineYear).get(contractId) ?? [];
  const publishedStarByCode = new Map(
    publishedBaseline.map((measure) => [measure.code.toUpperCase(), measure.starValue])
  );
  const predictedByCode = new Map(
    (options.predictions?.contracts.find((entry) => entry.contractId === contractId)?.measures ?? []).map(
      (measure) => [measure.measureCode.toUpperCase(), measure]
    )
  );

  const first = officialStars[0];
  const measures: ResultsMeasure[] = officialStars.map((row) => {
    const baselineCode = toBaselineMeasureCode(row.measureNormalized, row.measureCode, baselineYear);
    const predicted = predictedByCode.get(row.measureCode.toUpperCase());
    return {
      ...row,
      domain: domainByCode.get(baselineCode) ?? NEW_MEASURE_DOMAINS[baselineCode] ?? null,
      weight: weightByCode.get(baselineCode) ?? 1,
      publishedBaselineStar: publishedStarByCode.get(baselineCode) ?? null,
      publishedBaselineScore:
        getMeasureYearScoreSamples(row.measureNormalized, baselineYear).find(
          (sample) => sample.contractId === contractId
        )?.score ?? null,
      pp1Score: predicted?.score ?? null,
      pp1PredictedStar: predicted?.predictedStar ?? null,
      pp1UpsideStar: null,
      inverted: predicted?.inverted,
    };
  });

  const overall = officialSummaries.find((row) => row.ratingType === "overall") ?? null;
  const partC = officialSummaries.find((row) => row.ratingType === "part_c") ?? null;
  const partD = officialSummaries.find((row) => row.ratingType === "part_d") ?? null;

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

  const overallPredicted = options.overallPredicted ?? null;
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
    measures,
    domains,
    history: buildHistory(contractId, starsYear),
    yoySummary,
    accuracy,
    accuracySummary: {
      compared: compared.length,
      exact,
      withinOne,
      overallPredicted,
      overallOfficial,
      overallInEnvelope,
    },
    risk,
    opportunity,
  };
}
