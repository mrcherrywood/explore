import {
  getMeasureYearScoreSamples,
  type MeasureScoreSample,
} from "@/lib/band-movement/analysis";
import {
  analyzeCutPointMethodologyForecast,
  isCahpsMeasure,
  type MethodologyForecastThreshold,
} from "@/lib/band-movement/cut-point-methodology";
import {
  buildCurrentYearForecastOverlay,
  buildForecastMethodologyInputs,
  significantProjectedVsPp1Delta,
} from "@/lib/cutpoint-forecast/analysis";
import type { ForecastPopulationMode } from "@/lib/cutpoint-forecast/types";
import {
  lookupForecastYearEndSamples,
  type ForecastYearEndOverlay,
} from "@/lib/cutpoint-forecast/pp1-overlay";
import type { AccruedMeasureScore } from "./predictions";
import type { PlanPreviewCutPointPrediction } from "./predictions";

const MA_CONTRACT_PATTERN = /^[HR]\d{4}$/;
const THRESHOLD_KEYS = ["fiveStar", "fourStar", "threeStar", "twoStar"] as const;
const STAR_LABELS: Record<(typeof THRESHOLD_KEYS)[number], string> = {
  fiveStar: "5-star",
  fourStar: "4-star",
  threeStar: "3-star",
  twoStar: "2-star",
};

export type OverlayRole = "forecast" | "pp1_fill" | "pp1_override";

export type ClassifiedOverlayContract = {
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  role: OverlayRole;
  newToMarket: boolean;
  currentScore: number;
  priorScore: number | null;
  scoreDelta: number | null;
};

export type CutPointAdditionDetailRow = {
  measureCode: string | null;
  measureDisplayName: string;
  measureNormalized: string;
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  role: OverlayRole;
  newToMarket: boolean;
  currentScore: number;
  priorScore: number | null;
  scoreDelta: number | null;
  manualStar: number | null;
  fullMarketStar: number | null;
};

export type StarThresholdSnapshot = {
  fiveStar: number | null;
  fourStar: number | null;
  threeStar: number | null;
  twoStar: number | null;
};

export type CutPointAdditionSummary = {
  measureNormalized: string;
  addedSinceLastRun: number;
  fullMarketPrior: StarThresholdSnapshot;
  fullMarketDelta: StarThresholdSnapshot;
  clientOnlyPrior: StarThresholdSnapshot;
  clientOnlyDelta: StarThresholdSnapshot;
  driverParents: string;
  additionNotes: string;
};

/** Contracts added to the SY2027 book after the prior Manual-vs-model export. */
export function isAddedSinceLastBook(parentOrganization: string | null): boolean {
  return /cvs health/i.test(parentOrganization ?? "");
}

export type CutPointAdditionExport = {
  summaries: CutPointAdditionSummary[];
  detailRows: CutPointAdditionDetailRow[];
};

export type ThresholdValues = {
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function formatNum(value: number): string {
  return String(round2(value));
}

function signed(value: number): string {
  const rounded = round2(value);
  return rounded > 0 ? `+${formatNum(rounded)}` : formatNum(rounded);
}

function thresholdMap(
  thresholds: MethodologyForecastThreshold[] | null | undefined,
): Map<(typeof THRESHOLD_KEYS)[number], number> {
  return new Map(
    (thresholds ?? []).map((item) => [item.key, item.projected] as const),
  );
}

export function thresholdValues(
  thresholds: MethodologyForecastThreshold[] | null | undefined,
): ThresholdValues | null {
  const byKey = thresholdMap(thresholds);
  const twoStar = byKey.get("twoStar");
  const threeStar = byKey.get("threeStar");
  const fourStar = byKey.get("fourStar");
  const fiveStar = byKey.get("fiveStar");
  if (
    twoStar === undefined ||
    threeStar === undefined ||
    fourStar === undefined ||
    fiveStar === undefined
  ) {
    return null;
  }
  return { twoStar, threeStar, fourStar, fiveStar };
}

export function projectedAt(
  thresholds: MethodologyForecastThreshold[] | null | undefined,
  key: (typeof THRESHOLD_KEYS)[number],
): number | null {
  return thresholdMap(thresholds).get(key) ?? null;
}

export function deltaAt(
  withThresholds: MethodologyForecastThreshold[] | null | undefined,
  withoutThresholds: MethodologyForecastThreshold[] | null | undefined,
  key: (typeof THRESHOLD_KEYS)[number],
): number | null {
  const withValue = projectedAt(withThresholds, key);
  const withoutValue = projectedAt(withoutThresholds, key);
  if (withValue === null || withoutValue === null) return null;
  return round2(withValue - withoutValue);
}

function largestMove(
  withThresholds: MethodologyForecastThreshold[] | null | undefined,
  withoutThresholds: MethodologyForecastThreshold[] | null | undefined,
): { key: (typeof THRESHOLD_KEYS)[number]; delta: number } | null {
  let best: { key: (typeof THRESHOLD_KEYS)[number]; delta: number } | null = null;
  for (const key of THRESHOLD_KEYS) {
    const delta = deltaAt(withThresholds, withoutThresholds, key);
    if (delta === null) continue;
    if (best === null || Math.abs(delta) > Math.abs(best.delta)) {
      best = { key, delta };
    }
  }
  return best;
}

export function snapshotFromThresholds(
  thresholds: MethodologyForecastThreshold[] | null | undefined,
): StarThresholdSnapshot {
  return {
    fiveStar: projectedAt(thresholds, "fiveStar"),
    fourStar: projectedAt(thresholds, "fourStar"),
    threeStar: projectedAt(thresholds, "threeStar"),
    twoStar: projectedAt(thresholds, "twoStar"),
  };
}

export function snapshotDelta(
  current: MethodologyForecastThreshold[] | null | undefined,
  prior: MethodologyForecastThreshold[] | null | undefined,
): StarThresholdSnapshot {
  return {
    fiveStar: deltaAt(current, prior, "fiveStar"),
    fourStar: deltaAt(current, prior, "fourStar"),
    threeStar: deltaAt(current, prior, "threeStar"),
    twoStar: deltaAt(current, prior, "twoStar"),
  };
}

export function predictPopulation(
  measureNormalized: string,
  starsYear: number,
  baselineYear: number,
  currentYearSamples: MeasureScoreSample[],
  populationMode: ForecastPopulationMode,
): MethodologyForecastThreshold[] | null {
  const inputs = buildForecastMethodologyInputs(
    measureNormalized,
    currentYearSamples,
    baselineYear,
    populationMode,
  );
  const result = analyzeCutPointMethodologyForecast(
    measureNormalized,
    starsYear,
    inputs.samples,
    { baselineSamples: inputs.baselineSamples, baselineYear },
  );
  return result.status === "ready" ? result.thresholds : null;
}

export function classifyOverlayContracts(input: {
  measureNormalized: string;
  measureCode: string | null;
  measureRows: AccruedMeasureScore[];
  forecastOverlay?: ForecastYearEndOverlay;
  baselineYear: number | null;
  metadata?: Map<string, { contractName: string | null; parentOrganization: string | null }>;
}): ClassifiedOverlayContract[] {
  const pp1Samples: MeasureScoreSample[] = input.measureRows
    .filter(
      (row) =>
        MA_CONTRACT_PATTERN.test(row.contractId) &&
        !row.cmsDataIssue &&
        row.score !== null,
    )
    .map((row) => ({
      contractId: row.contractId.trim().toUpperCase(),
      score: row.score as number,
    }));
  const forecastSamples = lookupForecastYearEndSamples(
    input.forecastOverlay,
    input.measureNormalized,
    input.measureCode,
  );
  const overlay = buildCurrentYearForecastOverlay(
    forecastSamples,
    pp1Samples,
    input.measureNormalized,
  );
  const forecastById = new Map(
    forecastSamples.map((sample) => [sample.contractId.trim().toUpperCase(), sample]),
  );
  const pp1ById = new Map(
    pp1Samples.map((sample) => [sample.contractId.trim().toUpperCase(), sample]),
  );
  const rowById = new Map(
    input.measureRows.map((row) => [row.contractId.trim().toUpperCase(), row]),
  );
  const priorById = new Map(
    (input.baselineYear === null
      ? []
      : getMeasureYearScoreSamples(input.measureNormalized, input.baselineYear)
    ).map((sample) => [sample.contractId, sample.score]),
  );
  const threshold = significantProjectedVsPp1Delta(input.measureNormalized);

  return overlay.samples.map((sample) => {
    const id = sample.contractId.trim().toUpperCase();
    const forecast = forecastById.get(id);
    const pp1 = pp1ById.get(id);
    const row = rowById.get(id);
    const meta = input.metadata?.get(id);
    let role: OverlayRole = "pp1_fill";
    if (forecast && pp1) {
      role =
        Math.abs(forecast.score - pp1.score) >= threshold &&
        Math.abs(sample.score - pp1.score) < 1e-9
          ? "pp1_override"
          : "forecast";
    } else if (forecast) {
      role = "forecast";
    }
    const priorScore = priorById.get(id) ?? null;
    return {
      contractId: id,
      contractName: row?.contractName ?? meta?.contractName ?? null,
      parentOrganization:
        row?.parentOrganization ?? meta?.parentOrganization ?? null,
      role,
      newToMarket: !priorById.has(id),
      currentScore: sample.score,
      priorScore,
      scoreDelta:
        priorScore === null ? null : round2(sample.score - priorScore),
    };
  });
}

export function rankDriverParents(
  contracts: Pick<
    ClassifiedOverlayContract,
    "parentOrganization" | "scoreDelta" | "currentScore" | "priorScore"
  >[],
  limit = 3,
): string {
  const groups = new Map<
    string,
    { count: number; scores: number[]; priors: number[]; deltas: number[] }
  >();
  for (const contract of contracts) {
    const parent = contract.parentOrganization?.trim() || "Unknown parent";
    const group = groups.get(parent) ?? {
      count: 0,
      scores: [],
      priors: [],
      deltas: [],
    };
    group.count += 1;
    group.scores.push(contract.currentScore);
    if (contract.priorScore !== null) group.priors.push(contract.priorScore);
    if (contract.scoreDelta !== null) group.deltas.push(contract.scoreDelta);
    groups.set(parent, group);
  }

  return [...groups.entries()]
    .map(([parent, group]) => {
      const meanScore =
        group.scores.reduce((sum, value) => sum + value, 0) / group.count;
      const meanDelta =
        group.deltas.length === 0
          ? null
          : group.deltas.reduce((sum, value) => sum + value, 0) /
            group.deltas.length;
      const meanPrior =
        group.priors.length === 0
          ? null
          : group.priors.reduce((sum, value) => sum + value, 0) /
            group.priors.length;
      return { parent, count: group.count, meanScore, meanPrior, meanDelta };
    })
    .sort((left, right) => {
      const leftImpact = Math.abs(left.meanDelta ?? 0) * left.count;
      const rightImpact = Math.abs(right.meanDelta ?? 0) * right.count;
      if (rightImpact !== leftImpact) return rightImpact - leftImpact;
      return right.count - left.count;
    })
    .slice(0, limit)
    .map((group) => {
      const scoreBit = `mean score ${formatNum(group.meanScore)}`;
      const priorBit =
        group.meanPrior === null
          ? ""
          : ` vs prior ${formatNum(group.meanPrior)}`;
      const deltaBit =
        group.meanDelta === null ? "" : `, ${signed(group.meanDelta)}`;
      return `${group.parent} (${group.count}, ${scoreBit}${priorBit}${deltaBit})`;
    })
    .join("; ");
}

export function explainCutPointAdditions(input: {
  cutPoint: PlanPreviewCutPointPrediction;
  addedSinceLastRun: number;
  priorFullMarket: MethodologyForecastThreshold[] | null;
  priorClientOnly: MethodologyForecastThreshold[] | null;
  driverParents: string;
}): string {
  const { cutPoint } = input;
  if (cutPoint.source === "official" && isCahpsMeasure(cutPoint.displayName)) {
    return "Official CAHPS cut points are not re-predicted from accrued contracts.";
  }
  if (!cutPoint.fullMarketThresholds) {
    return "Full Market model is unavailable, so additions cannot be attributed.";
  }
  if (input.addedSinceLastRun === 0) {
    return "No contracts were added since the prior book.";
  }

  const parts = [
    `${input.addedSinceLastRun} contract${input.addedSinceLastRun === 1 ? " was" : "s were"} added since the prior book.`,
  ];
  const fullMarketMove = largestMove(
    cutPoint.fullMarketThresholds,
    input.priorFullMarket,
  );
  if (fullMarketMove && Math.abs(fullMarketMove.delta) >= 0.05) {
    const prior = projectedAt(input.priorFullMarket, fullMarketMove.key);
    const current = projectedAt(cutPoint.fullMarketThresholds, fullMarketMove.key);
    if (prior !== null && current !== null) {
      parts.push(
        `Full Market ${STAR_LABELS[fullMarketMove.key]} moved from ${formatNum(prior)} to ${formatNum(current)} (${signed(fullMarketMove.delta)}).`,
      );
    }
  } else {
    parts.push("Full Market cut points are unchanged vs the prior book.");
  }

  const clientMove = largestMove(cutPoint.clientOnlyThresholds, input.priorClientOnly);
  if (clientMove && Math.abs(clientMove.delta) >= 0.05) {
    const prior = projectedAt(input.priorClientOnly, clientMove.key);
    const current = projectedAt(cutPoint.clientOnlyThresholds, clientMove.key);
    if (prior !== null && current !== null) {
      parts.push(
        `Client Only ${STAR_LABELS[clientMove.key]} moved from ${formatNum(prior)} to ${formatNum(current)} (${signed(clientMove.delta)}).`,
      );
    }
  }

  if (input.driverParents) {
    parts.push(`Largest additions: ${input.driverParents}.`);
  }
  return parts.join(" ");
}
