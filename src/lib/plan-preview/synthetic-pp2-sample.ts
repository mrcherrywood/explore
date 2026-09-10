import { readFileSync } from "node:fs";

import { OVERALL_DEDUP_DROP_CODES } from "@/lib/clover-impact/analysis";
import { isInvertedMeasure } from "@/lib/percentile-analysis/inverted-measure";
import {
  calculateContractStats,
  calculateRewardFactor,
  classifyVariance,
} from "@/lib/reward-factor/calculations";
import { getOfficialForUsage } from "@/lib/reward-factor/official-threshold-data";
import type { ContractMeasure, PercentileThresholds, RatingType } from "@/lib/reward-factor/types";

import { resolveMeasureForPlanPreview } from "./measure-resolve";
import {
  loadOfficialMeasureWeights,
  officialCutPointsPath,
  parseOfficialCutPointsCsv,
  type OfficialCutPointRow,
} from "./official-cut-points";
import type { PlanPreviewPredictionsResult } from "./predictions";
import {
  buildPlanPreviewResultsReport,
  publishedScoreFromForecast,
  type PlanPreviewResultsReport,
  type ResultsPp1PublishedScore,
} from "./results-report-data";
import type { OfficialStarRow, OfficialSummaryRow } from "./store-official";
import {
  BOOK_LEAD_CODES,
  BOOK_PEERS,
  BOOK_TRAIL_CODES,
  DOMAIN_BY_BASELINE_CODE,
  OFFICIAL_STARS,
  QI_SIGNIFICANCE,
  OPPORTUNITY_CODES,
  PP1_STAR_MISSES,
  PRIOR_STARS,
  RISK_CODES,
  SAMPLE_CONTRACT_ID,
  SAMPLE_CONTRACT_NAME,
  SAMPLE_GENERATED_AT,
  SAMPLE_HISTORY,
  SAMPLE_ORG,
  SAMPLE_STARS_YEAR,
} from "./synthetic-pp2-catalog";

const QI_2027 = new Set(["C29", "D04"]);

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function identity() {
  return {
    contractId: SAMPLE_CONTRACT_ID,
    contractName: SAMPLE_CONTRACT_NAME,
    organizationMarketingName: SAMPLE_CONTRACT_NAME,
    parentOrganization: SAMPLE_ORG,
  };
}

function bandScore(cut: OfficialCutPointRow, star: number, code: string): number {
  const edges = numericBand(cut, star);
  const span = edges.high - edges.low;
  const t = RISK_CODES.has(code) ? 0.12 : OPPORTUNITY_CODES.has(code) ? 0.88 : 0.42;
  const raw = edges.low + span * t;
  const decimals = Math.abs(cut.fiveStar - cut.twoStar) <= 3 ? 3 : cut.twoStar < 5 ? 2 : 1;
  const factor = 10 ** decimals;
  return Math.round(raw * factor) / factor;
}

function numericBand(cut: OfficialCutPointRow, star: number): { low: number; high: number } {
  if (!cut.inverted) {
    if (star <= 1) return { low: cut.twoStar - 6, high: cut.twoStar };
    if (star === 2) return { low: cut.twoStar, high: cut.threeStar };
    if (star === 3) return { low: cut.threeStar, high: cut.fourStar };
    if (star === 4) return { low: cut.fourStar, high: cut.fiveStar };
    return { low: cut.fiveStar, high: cut.fiveStar === 100 ? 100 : cut.fiveStar + 1 };
  }
  if (star >= 5) return { low: Math.min(0, cut.fiveStar), high: cut.fiveStar };
  if (star === 4) return { low: cut.fiveStar, high: cut.fourStar };
  if (star === 3) return { low: cut.fourStar, high: cut.threeStar };
  if (star === 2) return { low: cut.threeStar, high: cut.twoStar };
  return { low: cut.twoStar, high: cut.twoStar + 2 };
}

function toContractMeasures(
  stars: Record<string, number | null>,
  weights: Map<string, number>,
  drop: Set<string> = new Set(),
): ContractMeasure[] {
  return Object.entries(stars)
    .filter(([code, star]) => star != null && !drop.has(code))
    .map(([code, star]) => ({
      code,
      starValue: star as number,
      weight: weights.get(code) ?? 1,
      category: code.startsWith("D") ? ("Part D" as const) : ("Part C" as const),
    }));
}

function scoreSummary(
  contractId: string,
  measures: ContractMeasure[],
  ratingType: RatingType,
  caiValue: number,
  thresholds: PercentileThresholds,
): {
  mean: number;
  variance: number;
  rewardFactor: number;
  varianceCategory: string;
  finalSummary: number;
  finalRating: number;
  rated: number;
} {
  const stats = calculateContractStats(contractId, measures, null);
  const rf = calculateRewardFactor(stats, thresholds, ratingType);
  const finalSummary = round6(stats.weightedMean + rf.rFactor + caiValue);
  return {
    mean: round6(stats.weightedMean),
    variance: round6(stats.weightedVariance),
    rewardFactor: rf.rFactor,
    varianceCategory: classifyVariance(stats.weightedVariance, thresholds),
    finalSummary,
    finalRating: roundToHalf(Math.min(5, Math.max(1, finalSummary))),
    rated: stats.measureCount,
  };
}

function officialRows(cuts: OfficialCutPointRow[]): OfficialStarRow[] {
  const id = identity();
  return cuts.map((cut) => {
    const resolved = resolveMeasureForPlanPreview(cut.measureCode, cut.measureName);
    const star = OFFICIAL_STARS[cut.measureCode] ?? null;
    return {
      ...id,
      measureCode: cut.measureCode,
      measureDisplayName: resolved.displayName,
      measureNormalized: resolved.normalizedName,
      metricCategory: cut.measureCode.startsWith("D") ? "Part D" : "Part C",
      star,
      status: star == null ? "not_required" : "scored",
      qiSignificance: QI_SIGNIFICANCE[cut.measureCode] ?? null,
    };
  });
}

function summaryRow(
  ratingType: OfficialSummaryRow["ratingType"],
  scored: ReturnType<typeof scoreSummary>,
  caiValue: number,
  extras: Partial<OfficialSummaryRow>,
): OfficialSummaryRow {
  return {
    ...identity(),
    ratingType,
    contractType: "CCP",
    snpPlans: ratingType === "part_d" ? null : "No",
    disasterYear1: 2024,
    disasterPct1: 0,
    disasterYear2: 2025,
    disasterPct2: 0,
    measuresRequired: ratingType === "overall" ? "19 of 38" : ratingType === "part_c" ? "16 of 31" : "6 of 12",
    measuresMissing: 0,
    measuresRated: scored.rated,
    calculatedMean: scored.mean,
    calculatedVariance: scored.variance,
    scorePercentileRank: scored.rewardFactor > 0 ? 68 : 58,
    variancePercentileRank: 44,
    varianceCategory: scored.varianceCategory,
    rewardFactor: scored.rewardFactor,
    interimSummary: round6(scored.mean + scored.rewardFactor),
    fac: ratingType === "overall" ? "3" : ratingType === "part_c" ? "4" : "2",
    caiValue,
    finalSummary: scored.finalSummary,
    improvementUsage: "Yes",
    newMeasureUsage: "Yes",
    finalRating: scored.finalRating,
    partCSummaryRating: extras.partCSummaryRating ?? null,
    partDSummaryRating: extras.partDSummaryRating ?? null,
    improvementScore: extras.improvementScore ?? null,
  };
}

function codeHash(code: string): number {
  let hash = 2166136261;
  for (let i = 0; i < code.length; i++) {
    hash ^= code.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Point gap that will not print as n.0 on the one-decimal book chart. */
function bookGap(code: string, scale: number): number {
  const hash = codeHash(code);
  const min = scale < 6 ? 1.15 : scale < 12 ? 1.35 : 1.55;
  const max = scale < 6 ? 2.35 : scale < 12 ? 3.25 : 3.85;
  let gap = min + (((hash % 97) + 1) / 98) * (max - min);
  if (Math.round(gap * 10) % 10 === 0) {
    gap += gap + 0.3 > max ? -0.3 : 0.3;
  }
  return Math.round(gap * 100) / 100;
}

function peerScoreShift(
  measureCode: string,
  peerIndex: number,
  inverted: boolean,
  scale: number,
): number {
  const spread = (peerIndex - 3.5) * Math.min(0.55, scale * 0.045);
  const lead = BOOK_LEAD_CODES.has(measureCode);
  const trail = BOOK_TRAIL_CODES.has(measureCode);
  if (!lead && !trail) return spread;
  const bias = (lead ? -bookGap(measureCode, scale) : bookGap(measureCode, scale)) * (inverted ? -1 : 1);
  return spread + bias;
}

function predictionMeasures(
  cuts: OfficialCutPointRow[],
  weights: Map<string, number>,
  stars: Record<string, number | null>,
  scoreShift: number | ((code: string, inverted: boolean, scale: number) => number),
) {
  return cuts.map((cut) => {
    const resolved = resolveMeasureForPlanPreview(cut.measureCode, cut.measureName);
    const officialStar = stars[cut.measureCode] ?? null;
    const forecastStar =
      officialStar == null ? null : (PP1_STAR_MISSES[cut.measureCode] ?? officialStar);
    const inverted = isInvertedMeasure(resolved.displayName);
    const scale = Math.abs(cut.fiveStar - cut.twoStar) || 10;
    const shift =
      typeof scoreShift === "function" ? scoreShift(cut.measureCode, inverted, scale) : scoreShift;
    const score = officialStar == null ? null : bandScore(cut, officialStar, cut.measureCode) + shift;
    return {
      measureNormalized: resolved.normalizedName,
      displayName: resolved.displayName,
      measureCode: cut.measureCode,
      score,
      weight: weights.get(cut.measureCode) ?? 1,
      inverted,
      predictedStar: forecastStar,
      starSource: forecastStar != null ? ("cut_points" as const) : null,
      baseGroupStar: null,
      baselineOfficialStar: PRIOR_STARS[cut.measureCode] ?? null,
      forecastStar,
      predictionStatus: forecastStar != null ? ("ready" as const) : ("unavailable" as const),
    };
  });
}

function emptyPredictions(cuts: OfficialCutPointRow[], weights: Map<string, number>): PlanPreviewPredictionsResult {
  const northstar = predictionMeasures(cuts, weights, OFFICIAL_STARS, 0);
  return {
    starsYear: SAMPLE_STARS_YEAR,
    baselineYear: SAMPLE_STARS_YEAR - 1,
    generatedAt: SAMPLE_GENERATED_AT,
    summary: {
      measureCount: cuts.length,
      readyCount: northstar.filter((row) => row.forecastStar != null).length,
      unavailableCount: 0,
      unsupportedCount: 0,
      warningCount: 0,
      accruedContractCount: BOOK_PEERS.length + 1,
      forecastFillCount: 0,
      cahpsPlanStarCount: 0,
    },
    cutPoints: [],
    contracts: [
      {
        contractId: SAMPLE_CONTRACT_ID,
        contractName: SAMPLE_CONTRACT_NAME,
        parentOrganization: SAMPLE_ORG,
        scoredMeasureCount: northstar.length,
        ratedMeasureCount: northstar.filter((row) => row.forecastStar != null).length,
        weightedMeanStar: null,
        measures: northstar,
      },
      ...BOOK_PEERS.map((peer, index) => {
        const measures = predictionMeasures(
          cuts,
          weights,
          OFFICIAL_STARS,
          (code, inverted, scale) => peerScoreShift(code, index, inverted, scale),
        );
        return {
          ...peer,
          scoredMeasureCount: measures.length,
          ratedMeasureCount: measures.filter((row) => row.score != null).length,
          weightedMeanStar: null,
          measures,
        };
      }),
    ],
  };
}

function pp1Published(
  weights: Map<string, number>,
  caiValue: number,
): ResultsPp1PublishedScore | null {
  const thresholds = getOfficialForUsage(SAMPLE_STARS_YEAR, "overall_mapd", {
    improvementIncluded: false,
    newMeasuresIncluded: true,
  });
  if (!thresholds) return null;
  const pp1Stars = { ...OFFICIAL_STARS };
  for (const [code, star] of Object.entries(PP1_STAR_MISSES)) pp1Stars[code] = star;
  const measures = toContractMeasures(pp1Stars, weights, new Set([...OVERALL_DEDUP_DROP_CODES, ...QI_2027]));
  const stats = calculateContractStats(SAMPLE_CONTRACT_ID, measures, null);
  const rf = calculateRewardFactor(stats, thresholds, "overall_mapd");
  const finalScoreRaw = stats.weightedMean + rf.rFactor + caiValue;
  return publishedScoreFromForecast({
    contractId: SAMPLE_CONTRACT_ID,
    contractName: SAMPLE_CONTRACT_NAME,
    parentOrganization: SAMPLE_ORG,
    caiValue,
    withQi: null,
    withoutQi: {
      measureCount: stats.measureCount,
      baseMean: stats.weightedMean,
      weightedVariance: stats.weightedVariance,
      rewardFactor: rf.rFactor,
      meanCategory: "below_threshold",
      varianceCategory: classifyVariance(stats.weightedVariance, thresholds),
      finalScoreRaw,
    },
    selectedLeg: "without_qi",
    finalScoreRaw,
    finalRating: roundToHalf(Math.min(5, Math.max(1, finalScoreRaw))),
    partCFinalRating: null,
    partDFinalRating: null,
    qualifiesOverall: true,
    reason: null,
  });
}

/** Illustrative PP2 report: official 2027 catalog + fictional Northstar results. */
export function buildSyntheticPp2SampleReport(): PlanPreviewResultsReport {
  const cuts = parseOfficialCutPointsCsv(readFileSync(officialCutPointsPath(SAMPLE_STARS_YEAR), "utf-8"));
  const officialWeights = loadOfficialMeasureWeights(SAMPLE_STARS_YEAR);
  const usage = { improvementIncluded: true, newMeasuresIncluded: true };
  const overallTh = getOfficialForUsage(SAMPLE_STARS_YEAR, "overall_mapd", usage);
  const partCTh = getOfficialForUsage(SAMPLE_STARS_YEAR, "part_c", usage);
  const partDTh = getOfficialForUsage(SAMPLE_STARS_YEAR, "part_d_mapd", usage);
  if (!overallTh || !partCTh || !partDTh) {
    throw new Error("Official 2027 reward-factor thresholds are required for the PP2 sample.");
  }

  const overallCai = 0.018;
  const partCCai = 0.024;
  const partDCai = -0.011;
  const overallScored = scoreSummary(
    SAMPLE_CONTRACT_ID,
    toContractMeasures(OFFICIAL_STARS, officialWeights, OVERALL_DEDUP_DROP_CODES),
    "overall_mapd",
    overallCai,
    overallTh,
  );
  const partCScored = scoreSummary(
    SAMPLE_CONTRACT_ID,
    toContractMeasures(OFFICIAL_STARS, officialWeights).filter((row) => row.category === "Part C"),
    "part_c",
    partCCai,
    partCTh,
  );
  const partDScored = scoreSummary(
    SAMPLE_CONTRACT_ID,
    toContractMeasures(OFFICIAL_STARS, officialWeights).filter((row) => row.category === "Part D"),
    "part_d_mapd",
    partDCai,
    partDTh,
  );

  const officialStars = officialRows(cuts);
  const qiScore = (code: string): number | null => {
    const cut = cuts.find((row) => row.measureCode === code);
    const star = OFFICIAL_STARS[code];
    if (!cut || star == null) return null;
    return bandScore(cut, star, code);
  };
  const officialSummaries = [
    summaryRow("overall", overallScored, overallCai, {
      partCSummaryRating: partCScored.finalRating,
      partDSummaryRating: partDScored.finalRating,
    }),
    summaryRow("part_c", partCScored, partCCai, {
      partCSummaryRating: partCScored.finalRating,
      improvementScore: qiScore("C29"),
    }),
    summaryRow("part_d", partDScored, partDCai, {
      partDSummaryRating: partDScored.finalRating,
      improvementScore: qiScore("D04"),
    }),
  ];

  const domainByCode = new Map(Object.entries(DOMAIN_BY_BASELINE_CODE));
  const weightByCode = new Map(officialWeights);
  const predictions = emptyPredictions(cuts, officialWeights);
  const published = pp1Published(officialWeights, overallCai);

  const priorStars = new Map(Object.entries(PRIOR_STARS));
  const priorScores = new Map(
    cuts
      .filter((cut) => PRIOR_STARS[cut.measureCode] != null)
      .map((cut) => [
        cut.measureCode,
        bandScore(cut, PRIOR_STARS[cut.measureCode] as number, cut.measureCode),
      ]),
  );

  const report = buildPlanPreviewResultsReport({
    starsYear: SAMPLE_STARS_YEAR,
    contractId: SAMPLE_CONTRACT_ID,
    officialStars,
    officialSummaries,
    domainByCode,
    weightByCode,
    predictions,
    overallPredicted: published?.finalRating ?? null,
    overallUpside: null,
    pp1Published: published,
    officialMarketStars: officialStars,
    officialMarketSummaries: officialSummaries,
    publishedBaselineByCode: priorStars,
    publishedBaselineScoreByCode: priorScores,
    history: SAMPLE_HISTORY,
  });
  report.generatedAt = SAMPLE_GENERATED_AT;
  return report;
}
