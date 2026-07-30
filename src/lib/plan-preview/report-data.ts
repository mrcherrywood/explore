import { existsSync, readFileSync } from "fs";
import path from "path";

import { loadMeasureStarsFromFile } from "@/lib/reward-factor/backtest";

import type {
  PlanPreviewFinalScore,
  PlanPreviewFinalScoresResult,
  PlanPreviewScenarioId,
} from "./final-scores";
import type {
  PlanPreviewContractMeasurePrediction,
  PlanPreviewContractPrediction,
  PlanPreviewPredictionsResult,
} from "./predictions";

const DATA_DIR = path.join(process.cwd(), "data");

export type ReportMeasure = PlanPreviewContractMeasurePrediction & {
  domain: string | null;
  /** The contract's actual published star for this measure in the baseline year. */
  publishedBaselineStar: number | null;
};

export type ReportDomain = {
  domain: string;
  part: "Part C" | "Part D" | "Mixed";
  measureCount: number;
  ratedMeasureCount: number;
  predictedMean: number | null;
  baselineMean: number | null;
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
  populationSize: number;
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

function buildDomains(measures: ReportMeasure[]): ReportDomain[] {
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
    domains.push({
      domain,
      part: parts.size > 1 ? "Mixed" : parts.has("Part D") ? "Part D" : "Part C",
      measureCount: domainMeasures.length,
      ratedMeasureCount: domainMeasures.filter((m) => m.predictedStar !== null).length,
      predictedMean: weightedMean(
        domainMeasures.map((m) => ({ star: m.predictedStar, weight: m.weight }))
      ),
      baselineMean: weightedMean(
        domainMeasures.map((m) => ({ star: m.publishedBaselineStar, weight: m.weight }))
      ),
    });
  }

  return domains.sort((left, right) => {
    if (left.part !== right.part) return left.part.localeCompare(right.part);
    return left.domain.localeCompare(right.domain);
  });
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

  const measures: ReportMeasure[] = contract.measures.map((measure) => ({
    ...measure,
    domain: domainByCode.get(measure.measureCode.toUpperCase()) ?? null,
    publishedBaselineStar:
      publishedStarByCode.get(measure.measureCode.toUpperCase()) ?? null,
  }));

  const baselineSummaryRow = baselineYear !== null
    ? findSummaryRow(loadSummaryRows(baselineYear) ?? [], contractId)
    : null;

  const contractCodes = new Set(measures.map((measure) => measure.measureCode.toUpperCase()));

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
    domains: buildDomains(measures),
    history: buildHistory(contractId, starsYear),
    yoySummary: buildYoySummary(measures),
    scenarios: buildScenarios(scenarios, contractId, contractCodes),
    populationSize: scenarios[0]?.populationSize ?? 0,
  };
}
