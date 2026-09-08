import { isCahpsMeasure } from "@/lib/band-movement/cut-point-methodology";
import type { ForecastYearEndOverlay } from "@/lib/cutpoint-forecast/pp1-overlay";
import { loadContractMetadata } from "@/lib/reward-factor/backtest";

import {
  classifyOverlayContracts,
  explainCutPointAdditions,
  isAddedSinceLastBook,
  predictPopulation,
  rankDriverParents,
  snapshotDelta,
  snapshotFromThresholds,
  type ClassifiedOverlayContract,
  type CutPointAdditionDetailRow,
  type CutPointAdditionExport,
  type CutPointAdditionSummary,
  type StarThresholdSnapshot,
} from "./cut-point-drivers";
import { thresholdValues } from "./cut-point-drivers";
import {
  starFromThresholds,
  type AccruedMeasureScore,
  type PlanPreviewCutPointPrediction,
  type PlanPreviewPredictionsResult,
} from "./predictions";

const MA_CONTRACT_PATTERN = /^[HR]\d{4}$/;

const EMPTY_SNAPSHOT: StarThresholdSnapshot = {
  fiveStar: null,
  fourStar: null,
  threeStar: null,
  twoStar: null,
};

export type CutPointAdditionExportOptions = {
  /** When omitted, CVS Health / Aetna book adds are treated as new since last run. */
  addedContractIds?: Set<string>;
};

function addedIdsFor(
  classified: ClassifiedOverlayContract[][],
  explicit?: Set<string>,
): Set<string> {
  if (explicit) return explicit;
  return new Set(
    classified
      .flat()
      .filter((row) => isAddedSinceLastBook(row.parentOrganization))
      .map((row) => row.contractId),
  );
}

function priorSamples(
  contracts: ClassifiedOverlayContract[],
  addedIds: Set<string>,
) {
  return contracts
    .filter((row) => !addedIds.has(row.contractId))
    .map((row) => ({ contractId: row.contractId, score: row.currentScore }));
}

function summarizeMeasure(
  cutPoint: PlanPreviewCutPointPrediction,
  contracts: ClassifiedOverlayContract[],
  addedIds: Set<string>,
  starsYear: number,
  baselineYear: number | null,
): CutPointAdditionSummary {
  const added = contracts.filter((row) => addedIds.has(row.contractId));
  const canModel =
    Boolean(cutPoint.fullMarketThresholds) &&
    baselineYear !== null &&
    !isCahpsMeasure(cutPoint.displayName);
  const priorSamplesForMeasure = priorSamples(contracts, addedIds);
  const priorFullMarket = canModel
    ? predictPopulation(
        cutPoint.measureNormalized,
        starsYear,
        baselineYear,
        priorSamplesForMeasure,
        "full_market",
      )
    : null;
  const priorClientOnly = canModel
    ? predictPopulation(
        cutPoint.measureNormalized,
        starsYear,
        baselineYear,
        priorSamplesForMeasure,
        "client_only",
      )
    : null;
  const driverParents = rankDriverParents(added);

  return {
    measureNormalized: cutPoint.measureNormalized,
    addedSinceLastRun: added.length,
    fullMarketPrior: snapshotFromThresholds(priorFullMarket),
    fullMarketDelta: canModel
      ? snapshotDelta(cutPoint.fullMarketThresholds, priorFullMarket)
      : EMPTY_SNAPSHOT,
    clientOnlyPrior: snapshotFromThresholds(priorClientOnly),
    clientOnlyDelta: canModel
      ? snapshotDelta(cutPoint.clientOnlyThresholds, priorClientOnly)
      : EMPTY_SNAPSHOT,
    driverParents,
    additionNotes: explainCutPointAdditions({
      cutPoint,
      addedSinceLastRun: added.length,
      priorFullMarket,
      priorClientOnly,
      driverParents,
    }),
  };
}

export function buildCutPointAdditionExport(
  predictions: PlanPreviewPredictionsResult,
  rows: AccruedMeasureScore[],
  forecastOverlay?: ForecastYearEndOverlay,
  options: CutPointAdditionExportOptions = {},
): CutPointAdditionExport {
  const rowsByMeasure = new Map<string, AccruedMeasureScore[]>();
  for (const row of rows) {
    if (!MA_CONTRACT_PATTERN.test(row.contractId)) continue;
    const existing = rowsByMeasure.get(row.measureNormalized);
    if (existing) existing.push(row);
    else rowsByMeasure.set(row.measureNormalized, [row]);
  }

  const metadata = predictions.baselineYear
    ? loadContractMetadata(predictions.baselineYear)
    : new Map();
  const classifiedByMeasure = predictions.cutPoints.map((cutPoint) =>
    classifyOverlayContracts({
      measureNormalized: cutPoint.measureNormalized,
      measureCode: cutPoint.measureCode,
      measureRows: rowsByMeasure.get(cutPoint.measureNormalized) ?? [],
      forecastOverlay,
      baselineYear: predictions.baselineYear,
      metadata,
    }),
  );
  const addedIds = addedIdsFor(classifiedByMeasure, options.addedContractIds);

  const summaries: CutPointAdditionSummary[] = [];
  const detailRows: CutPointAdditionDetailRow[] = [];

  predictions.cutPoints.forEach((cutPoint, index) => {
    const contracts = classifiedByMeasure[index] ?? [];
    summaries.push(
      summarizeMeasure(
        cutPoint,
        contracts,
        addedIds,
        predictions.starsYear,
        predictions.baselineYear,
      ),
    );

    const manualValues = thresholdValues(cutPoint.thresholds);
    const fullMarketValues = thresholdValues(cutPoint.fullMarketThresholds);
    for (const contract of contracts) {
      if (!addedIds.has(contract.contractId)) continue;
      detailRows.push({
        measureCode: cutPoint.measureCode,
        measureDisplayName: cutPoint.displayName,
        measureNormalized: cutPoint.measureNormalized,
        contractId: contract.contractId,
        contractName: contract.contractName,
        parentOrganization: contract.parentOrganization,
        role: contract.role,
        newToMarket: contract.newToMarket,
        currentScore: contract.currentScore,
        priorScore: contract.priorScore,
        scoreDelta: contract.scoreDelta,
        manualStar: manualValues
          ? starFromThresholds(contract.currentScore, manualValues, cutPoint.inverted)
          : null,
        fullMarketStar: fullMarketValues
          ? starFromThresholds(
              contract.currentScore,
              fullMarketValues,
              cutPoint.inverted,
            )
          : null,
      });
    }
  });

  detailRows.sort(
    (left, right) =>
      left.measureDisplayName.localeCompare(right.measureDisplayName) ||
      (left.parentOrganization ?? "").localeCompare(right.parentOrganization ?? "") ||
      left.contractId.localeCompare(right.contractId),
  );

  return { summaries, detailRows };
}
