import {
  analyzeCutPointMethodologyForecast,
  isCahpsMeasure,
  type MethodologyForecastResponse,
} from "@/lib/band-movement/cut-point-methodology";
import {
  getAvailableMeasureYears,
  getLatestContractRecords,
  getMeasureByNormalizedName,
  getMeasureYearScoreSamples,
  type MeasureScoreSample,
} from "@/lib/band-movement/analysis";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  getAllForecastProjectionsForRun,
  getLatestForecastRunForYear,
  listForecastMeasureApprovalsForRuns,
  listForecastProjectionRuns,
} from "./store";
import type {
  ForecastDatasetType,
  ForecastMeasureApprovalRecord,
  ForecastPopulationMode,
  ForecastProjectionRunRecord,
} from "./types";

export type CutPointForecastAnalysisResponse = MethodologyForecastResponse & {
  availableForecastYears: number[];
  populationMode: ForecastPopulationMode;
  runId: string | null;
  runStatus: ForecastProjectionRunRecord["status"] | null;
  approvalScope: "run" | "measure" | null;
  approvedAt: string | null;
  baselineYear: number | null;
  projectedContractCount: number | null;
};

type ApprovedForecastSource = {
  run: ForecastProjectionRunRecord;
  approvalScope: "run" | "measure";
  approvedAt: string | null;
};

/** Dummy/test contracts use a repeating-digit pattern (H1111, H2222, … H9999, H0000). */
const DUMMY_CONTRACT_PATTERN = /^H(\d)\1{3}$/;

export function isDummyContractId(contractId: string): boolean {
  return DUMMY_CONTRACT_PATTERN.test(contractId.trim().toUpperCase());
}

let parentOrgContractIdsCache: Set<string> | null = null;

/**
 * Contract IDs from the latest published star ratings data that are tied to a
 * real parent organization. Used to drop dummy/test contracts that aren't
 * associated with any parent org.
 */
function getContractIdsWithParentOrg(): Set<string> {
  if (parentOrgContractIdsCache) return parentOrgContractIdsCache;
  parentOrgContractIdsCache = new Set(
    getLatestContractRecords()
      .filter((record) => record.parentOrg.trim().length > 0)
      .map((record) => record.contractId.trim().toUpperCase())
  );
  return parentOrgContractIdsCache;
}

/** A clean MA contract ID is "H" followed by exactly four digits. */
const CONTRACT_ID_PATTERN = /^H\d{4}$/;

/**
 * Must be a clean "H####" id — no segment/suffix forms such as H0838-P or
 * H0838P, no repeating-digit dummy IDs (H1111, H2222, …), and must be a real
 * contract tied to a parent organization in the published star ratings
 * universe (filters out dummy/test contracts).
 */
export function isEligibleForecastContract(contractId: string): boolean {
  const id = contractId.trim().toUpperCase();
  if (!CONTRACT_ID_PATTERN.test(id)) return false;
  if (isDummyContractId(id)) return false;
  if (!getContractIdsWithParentOrg().has(id)) return false;
  return true;
}

function uniqueDescending(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => right - left);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function approvedSourceYears(
  runs: ForecastProjectionRunRecord[],
  approvals: ForecastMeasureApprovalRecord[],
  datasetType?: ForecastDatasetType
): number[] {
  const runById = new Map(runs.map((run) => [run.id, run] as const));
  const years = [
    ...runs
      .filter((run) =>
        run.status === "approved" &&
        (datasetType === undefined || run.datasetType === datasetType)
      )
      .map((run) => run.forecastYear),
    ...approvals
      .map((approval) => runById.get(approval.runId))
      .filter((run): run is ForecastProjectionRunRecord => Boolean(run))
      .filter((run) => datasetType === undefined || run.datasetType === datasetType)
      .map((run) => run.forecastYear),
  ];

  return uniqueDescending(years);
}

async function resolveApprovedForecastSource(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  input: {
    runs: ForecastProjectionRunRecord[];
    forecastYear: number;
    datasetType: ForecastDatasetType;
    measureNorm: string;
  }
): Promise<ApprovedForecastSource | null> {
  const runApprovedSource = await getLatestForecastRunForYear(
    serviceClient,
    input.forecastYear,
    "approved",
    input.datasetType
  );
  if (runApprovedSource) {
    return {
      run: runApprovedSource,
      approvalScope: "run",
      approvedAt: runApprovedSource.approvedAt,
    };
  }

  const candidateRuns = input.runs.filter(
    (run) =>
      run.forecastYear === input.forecastYear &&
      run.datasetType === input.datasetType
  );
  const approvals = await listForecastMeasureApprovalsForRuns(serviceClient, {
    runIds: candidateRuns.map((run) => run.id),
    measureNormalized: input.measureNorm,
  });
  const runById = new Map(candidateRuns.map((run) => [run.id, run] as const));
  const measureApproval = approvals.find((approval) => runById.has(approval.runId));
  if (!measureApproval) return null;

  return {
    run: runById.get(measureApproval.runId)!,
    approvalScope: "measure",
    approvedAt: measureApproval.approvedAt,
  };
}

function withBaselineOnlyNote(result: MethodologyForecastResponse): MethodologyForecastResponse {
  if (result.status !== "ready") return result;
  return {
    ...result,
    notes: [
      "No approved forecast run was available; using the latest historical market baseline only.",
      ...result.notes,
    ],
  };
}

export function overlayProjectedSamples(
  measureNorm: string,
  projectedSamples: MeasureScoreSample[],
  baselineYear: number
): MeasureScoreSample[] {
  const baselineSamples = getMeasureYearScoreSamples(measureNorm, baselineYear);
  const projectedByContract = new Map(
    projectedSamples.map((sample) => [sample.contractId, sample] as const)
  );
  const combined: MeasureScoreSample[] = [];

  for (const baseline of baselineSamples) {
    const override = projectedByContract.get(baseline.contractId);
    combined.push(override ?? baseline);
    projectedByContract.delete(baseline.contractId);
  }

  combined.push(...projectedByContract.values());
  return combined;
}

export type ClientInformedForecastMetadata = {
  scenario: "client_informed";
  baselineYear: number;
  baselineContractCount: number;
  matchedContractCount: number;
  appendedContractCount: number;
  observedClientMeanDelta: number | null;
  historicalMarketMeanDelta: number | null;
  clientBaselineMean: number | null;
  marketBaselineMean: number | null;
  representativenessScore: number;
  sampleCredibility: number;
  shrinkageWeight: number;
  nonClientDeltaCap: number;
  appliedNonClientDelta: number;
  notes: string[];
};

export type ClientInformedForecastSamples = {
  samples: MeasureScoreSample[];
  metadata: ClientInformedForecastMetadata;
};

function computeHistoricalMarketMeanDelta(measureNorm: string): {
  delta: number | null;
  maxAbsYearDelta: number | null;
} {
  const years = getAvailableMeasureYears().sort((left, right) => left - right);
  if (years.length < 2) return { delta: null, maxAbsYearDelta: null };

  const baseYear = years[0] - 1;
  let weightedSum = 0;
  let totalWeight = 0;
  let maxAbsYearDelta = 0;

  for (let index = 1; index < years.length; index += 1) {
    const fromYear = years[index - 1];
    const toYear = years[index];
    const previousScores = new Map(
      getMeasureYearScoreSamples(measureNorm, fromYear).map((sample) => [
        sample.contractId,
        sample.score,
      ] as const)
    );
    const deltas = getMeasureYearScoreSamples(measureNorm, toYear)
      .map((sample) => {
        const previousScore = previousScores.get(sample.contractId);
        return previousScore === undefined ? null : sample.score - previousScore;
      })
      .filter((delta): delta is number => delta !== null);
    const meanDelta = average(deltas);
    if (meanDelta === null) continue;

    const clippedDelta = Math.min(5, Math.max(-5, meanDelta));
    const weight = toYear - baseYear;
    weightedSum += clippedDelta * weight;
    totalWeight += weight;
    maxAbsYearDelta = Math.max(maxAbsYearDelta, Math.abs(clippedDelta));
  }

  return {
    delta: totalWeight === 0 ? null : round2(weightedSum / totalWeight),
    maxAbsYearDelta: totalWeight === 0 ? null : round2(maxAbsYearDelta),
  };
}

export function buildClientInformedMarketSamples(
  measureNorm: string,
  projectedSamples: MeasureScoreSample[],
  baselineYear: number
): ClientInformedForecastSamples {
  const baselineSamples = getMeasureYearScoreSamples(measureNorm, baselineYear);
  const projectedByContract = new Map(
    projectedSamples.map((sample) => [sample.contractId, sample] as const)
  );
  const matchedBaseline = baselineSamples.filter((sample) =>
    projectedByContract.has(sample.contractId)
  );
  const matchedDeltas = matchedBaseline.map((sample) => {
    const projected = projectedByContract.get(sample.contractId)!;
    return projected.score - sample.score;
  });
  const observedClientMeanDelta = average(matchedDeltas);
  const marketBaselineMean = average(baselineSamples.map((sample) => sample.score));
  const clientBaselineMean = average(matchedBaseline.map((sample) => sample.score));
  const historical = computeHistoricalMarketMeanDelta(measureNorm);
  const representativenessGap =
    clientBaselineMean === null || marketBaselineMean === null
      ? 20
      : Math.abs(clientBaselineMean - marketBaselineMean);
  const representativenessScore = round2(Math.max(0.15, 1 - representativenessGap / 20));
  const sampleCredibility = round2(
    matchedBaseline.length / (matchedBaseline.length + 100)
  );
  const shrinkageWeight = round2(
    Math.min(0.65, sampleCredibility * representativenessScore)
  );
  const historicalDelta = historical.delta ?? 0;
  const clientSignal = observedClientMeanDelta ?? historicalDelta;
  const rawInferredDelta =
    historicalDelta * (1 - shrinkageWeight) + clientSignal * shrinkageWeight;
  const nonClientDeltaCap = round2(
    Math.min(2, Math.max(0.5, historical.maxAbsYearDelta ?? 1))
  );
  const appliedNonClientDelta = round2(
    Math.min(nonClientDeltaCap, Math.max(-nonClientDeltaCap, rawInferredDelta))
  );
  const combined: MeasureScoreSample[] = [];
  const remainingProjected = new Map(projectedByContract);

  for (const baseline of baselineSamples) {
    const override = remainingProjected.get(baseline.contractId);
    combined.push(
      override ?? {
        ...baseline,
        score: round2(clampScore(baseline.score + appliedNonClientDelta)),
      }
    );
    remainingProjected.delete(baseline.contractId);
  }

  combined.push(...remainingProjected.values());

  return {
    samples: combined,
    metadata: {
      scenario: "client_informed",
      baselineYear,
      baselineContractCount: baselineSamples.length,
      matchedContractCount: matchedBaseline.length,
      appendedContractCount: remainingProjected.size,
      observedClientMeanDelta:
        observedClientMeanDelta === null ? null : round2(observedClientMeanDelta),
      historicalMarketMeanDelta: historical.delta,
      clientBaselineMean: clientBaselineMean === null ? null : round2(clientBaselineMean),
      marketBaselineMean: marketBaselineMean === null ? null : round2(marketBaselineMean),
      representativenessScore,
      sampleCredibility,
      shrinkageWeight,
      nonClientDeltaCap,
      appliedNonClientDelta,
      notes: [
        "Client-informed scenario uses matched client contract movement as a signal, shrunk toward recent market movement.",
        "Non-client market movement is capped before running the same cut-point methodology and guardrails.",
      ],
    },
  };
}

export async function analyzeApprovedCutPointForecast(
  measureNorm: string,
  forecastYear?: number,
  populationMode: ForecastPopulationMode = "full_market"
): Promise<CutPointForecastAnalysisResponse> {
  const serviceClient = createServiceRoleClient();
  // CAHPS measures pull from the separately-uploaded CAHPS survey run; every
  // other measure pulls from the HL-coded non-CAHPS glidepath run. The CAHPS
  // check needs the clean display name — the normalized key carries a
  // "(Part C)" suffix that isCahpsMeasure's name set does not include.
  const measureDisplayName =
    getMeasureByNormalizedName(measureNorm)?.displayName ?? measureNorm;
  const datasetType: ForecastDatasetType = isCahpsMeasure(measureDisplayName)
    ? "cahps"
    : "non_cahps";
  const runs = await listForecastProjectionRuns(serviceClient);
  const measureApprovals = await listForecastMeasureApprovalsForRuns(serviceClient, {
    runIds: runs.map((run) => run.id),
    measureNormalized: measureNorm,
  });
  // Forecast-year selection is shared by stars year across both dataset types:
  // the union of every approved run's stars year plus any year where this
  // specific measure was approved. The per-measure data lookup below still
  // resolves to the run matching this measure's dataset type.
  const availableForecastYears = approvedSourceYears(runs, measureApprovals);
  // Default to the latest stars year that actually has a run for this measure's
  // dataset type (falling back to the shared latest) so a measure doesn't open
  // on a year with no matching run.
  const datasetForecastYears = approvedSourceYears(runs, measureApprovals, datasetType);
  const latestHistoricalYear = getAvailableMeasureYears().at(-1) ?? null;
  const baselineOnlyForecastYear = latestHistoricalYear === null
    ? null
    : latestHistoricalYear + 1;
  const canUseBaselineOnlyForecast =
    populationMode === "full_market" && baselineOnlyForecastYear !== null;
  const effectiveForecastYear =
    forecastYear
    ?? datasetForecastYears[0]
    ?? availableForecastYears[0]
    ?? (canUseBaselineOnlyForecast ? baselineOnlyForecastYear : null);
  const responseForecastYears = effectiveForecastYear === null
    ? availableForecastYears
    : uniqueDescending([...availableForecastYears, effectiveForecastYear]);

  if (!effectiveForecastYear) {
    return {
      status: "unavailable",
      measure: measureNorm,
      displayName: measureNorm,
      forecastYear: forecastYear ?? 0,
      reason: "No approved forecast runs are available yet.",
      availableForecastYears: responseForecastYears,
      populationMode,
      runId: null,
      runStatus: null,
      approvalScope: null,
      approvedAt: null,
      baselineYear: latestHistoricalYear,
      projectedContractCount: null,
    };
  }

  const approvedSource = await resolveApprovedForecastSource(serviceClient, {
    runs,
    forecastYear: effectiveForecastYear,
    datasetType,
    measureNorm,
  });

  if (!approvedSource) {
    if (populationMode === "full_market" && latestHistoricalYear !== null) {
      const baselineSamples = getMeasureYearScoreSamples(measureNorm, latestHistoricalYear);
      const result = withBaselineOnlyNote(
        analyzeCutPointMethodologyForecast(
          measureNorm,
          effectiveForecastYear,
          baselineSamples,
          {
            baselineSamples,
            baselineYear: latestHistoricalYear,
          }
        )
      );

      return {
        ...result,
        availableForecastYears: responseForecastYears,
        populationMode,
        runId: null,
        runStatus: null,
        approvalScope: null,
        approvedAt: null,
        baselineYear: latestHistoricalYear,
        projectedContractCount: 0,
      };
    }

    return {
      status: "unavailable",
      measure: measureNorm,
      displayName: measureNorm,
      forecastYear: effectiveForecastYear,
      reason:
        datasetType === "cahps"
          ? "The selected forecast year does not have an approved CAHPS survey run yet."
          : "The selected forecast year does not have an approved projection run yet.",
      availableForecastYears: responseForecastYears,
      populationMode,
      runId: null,
      runStatus: null,
      approvalScope: null,
      approvedAt: null,
      baselineYear: latestHistoricalYear,
      projectedContractCount: null,
    };
  }

  const projections = await getAllForecastProjectionsForRun(serviceClient, approvedSource.run.id);
  const projectedSamples = projections
    .filter((projection) =>
      projection.measureNormalized === measureNorm &&
      isEligibleForecastContract(projection.contractId)
    )
    .map((projection) => ({
      contractId: projection.contractId,
      score: projection.finalScore,
    }));

  const baselineSamples = latestHistoricalYear === null
    ? []
    : getMeasureYearScoreSamples(measureNorm, latestHistoricalYear);
  const projectedContractIds = new Set(projectedSamples.map((sample) => sample.contractId));
  const scenarioBaselineSamples =
    populationMode === "full_market"
      ? baselineSamples
      : baselineSamples.filter((sample) => projectedContractIds.has(sample.contractId));
  const samples =
    populationMode === "full_market" && latestHistoricalYear !== null
      ? overlayProjectedSamples(measureNorm, projectedSamples, latestHistoricalYear)
      : projectedSamples;

  const result = analyzeCutPointMethodologyForecast(
    measureNorm,
    effectiveForecastYear,
    samples,
    {
      baselineSamples: scenarioBaselineSamples,
      baselineYear: latestHistoricalYear,
    }
  );

  return {
    ...result,
    availableForecastYears: responseForecastYears,
    populationMode,
    runId: approvedSource.run.id,
    runStatus: approvedSource.run.status,
    approvalScope: approvedSource.approvalScope,
    approvedAt: approvedSource.approvedAt,
    baselineYear: populationMode === "full_market" ? latestHistoricalYear : null,
    projectedContractCount: projectedSamples.length,
  };
}
