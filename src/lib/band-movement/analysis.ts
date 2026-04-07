import { readFileSync } from "node:fs";
import path from "node:path";

import {
  isInvertedMeasure,
  loadMeasureCutPoints,
  matchCutPointToMeasureName,
  normalizeMeasureName,
} from "@/lib/percentile-analysis/measure-matching";
import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";

const DATA_DIR = path.join(process.cwd(), "data");
const CUT_POINTS_PATH = path.join(DATA_DIR, "Stars 2016-2028 Cut Points 12.2025_with_weights.xlsx");
const AVAILABLE_YEARS = [2023, 2024, 2025, 2026] as const;
const TRANSITION_FROM_YEARS = [2023, 2024, 2025] as const;

type StarRating = 1 | 2 | 3 | 4 | 5;

export type ContractRecord = {
  contractId: string;
  contractName: string;
  orgName: string;
  parentOrg: string;
};

export type ContractMeasureYear = {
  star: StarRating;
  score: number | null;
  measureKey: string;
};

export type MeasureScoreSample = {
  contractId: string;
  score: number;
};

export type ContractMovementRow = ContractRecord & {
  fromStar: StarRating;
  fromScore: number | null;
  toStar: StarRating;
  toScore: number | null;
  starChange: number;
  fractionalFrom: number | null;
  fractionalTo: number | null;
  fractionalChange: number | null;
};

export type MovementBucket = {
  toStar: StarRating;
  count: number;
  pct: number;
};

export type ScoreChangeGroup = {
  count: number;
  avgScoreChange: number | null;
};

/** Cohort slice by numeric score in the from-year (within the star band). */
export type PerFromScoreRow = {
  fromScore: number;
  cohortSize: number;
  avgScoreChange: number | null;
};

export type WithinBandDensity = {
  nearLowerThreshold: number;
  nearLowerPct: number;
  middle: number;
  middlePct: number;
  nearUpperThreshold: number;
  nearUpperPct: number;
  lowerThreshold: number;
  upperThreshold: number;
};

export type BandMovementStats = {
  cohortSize: number;
  improved: number;
  improvedPct: number;
  held: number;
  heldPct: number;
  declined: number;
  declinedPct: number;
  buckets: MovementBucket[];
  improvedScores: ScoreChangeGroup;
  heldScores: ScoreChangeGroup;
  declinedScores: ScoreChangeGroup;
  withinBandDensity: WithinBandDensity | null;
  avgFractionalFrom: number | null;
  avgFractionalTo: number | null;
  avgFractionalChange: number | null;
};

export type CutPointYearData = {
  year: number;
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
};

export type CutPointComparison = {
  fromYear: CutPointYearData;
  toYear: CutPointYearData;
  delta: {
    twoStar: number;
    threeStar: number;
    fourStar: number;
    fiveStar: number;
  };
  measureName: string;
  hlCode: string;
  domain: string | null;
  weight: number | null;
};

export type ScoreStats = {
  year: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  count: number;
};

export type AllBandRow = {
  star: StarRating;
  cohortSize: number;
  improved: number;
  improvedPct: number;
  held: number;
  heldPct: number;
  declined: number;
  declinedPct: number;
  avgStarChange: number | null;
};

export type UnifiedMeasure = {
  normalizedName: string;
  displayName: string;
  codesByYear: Record<number, string>;
  keysByYear: Record<number, string>;
};

export type BandMovementResponse = {
  status: "ready" | "options";
  measures: UnifiedMeasure[];
  transitions: number[];
  selectedMeasure: string | null;
  selectedStar: StarRating | null;
  fromYear: number | null;
  toYear: number | null;
  movement: BandMovementStats | null;
  scoreStats: { from: ScoreStats; to: ScoreStats } | null;
  cutPoints: CutPointComparison | null;
  contracts: ContractMovementRow[];
  allBands: AllBandRow[];
};

type RawContract = Record<string, string>;

type YearData = {
  stars: Map<string, Map<string, StarRating>>;
  scores: Map<string, Map<string, number | null>>;
  contracts: Map<string, ContractRecord>;
  measureKeys: string[];
};

let dataCache: {
  years: Map<number, YearData>;
  measures: UnifiedMeasure[];
  cutPointsByYear: Map<number, MeasureCutPoint[]>;
} | null = null;

function isHRContract(id: string) {
  const trimmed = id.trim().toUpperCase();
  return trimmed.startsWith("H") || trimmed.startsWith("R");
}

function parseStarValue(value: string): StarRating | null {
  const trimmed = value.trim();
  const num = Number(trimmed);
  if (Number.isFinite(num) && num >= 1 && num <= 5) return Math.round(num) as StarRating;
  return null;
}

function parseScoreValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutPct = trimmed.replace(/%$/, "");
  const num = Number(withoutPct);
  if (Number.isFinite(num)) return num;
  return null;
}

function extractMeasureCode(key: string): string | null {
  const match = key.match(/^([CD]\d+):/);
  return match ? match[1] : null;
}

function extractMeasureName(key: string): string {
  return key.replace(/^[CD]\d+:\s*/, "").trim();
}

function isMeasureKey(key: string): boolean {
  return /^[CD]\d+:/.test(key);
}

function normalizeMeasureKey(key: string): string {
  const code = extractMeasureCode(key);
  const norm = normalizeMeasureName(extractMeasureName(key));
  if (!code) return norm;
  const part = code.startsWith("D") ? " partd" : " partc";
  return norm + part;
}

function loadYearData(year: number): YearData {
  const starsPath = path.join(DATA_DIR, String(year), `measure_stars_${year}.json`);
  const dataPath = path.join(DATA_DIR, String(year), `measure_data_${year}.json`);

  const starsRaw: RawContract[] = JSON.parse(readFileSync(starsPath, "utf-8"));
  const dataRaw: RawContract[] = JSON.parse(readFileSync(dataPath, "utf-8"));

  const stars = new Map<string, Map<string, StarRating>>();
  const scores = new Map<string, Map<string, number | null>>();
  const contracts = new Map<string, ContractRecord>();
  let measureKeys: string[] = [];

  for (const row of starsRaw) {
    const contractId = (row.CONTRACT_ID ?? "").trim().toUpperCase();
    if (!contractId || !isHRContract(contractId)) continue;

    if (measureKeys.length === 0) {
      measureKeys = Object.keys(row).filter(isMeasureKey);
    }

    contracts.set(contractId, {
      contractId,
      contractName: (row["Contract Name"] ?? "").trim(),
      orgName: (row["Organization Marketing Name"] ?? "").trim(),
      parentOrg: (row["Parent Organization"] ?? "").trim(),
    });

    const contractStars = new Map<string, StarRating>();
    for (const key of measureKeys) {
      const star = parseStarValue(row[key] ?? "");
      if (star !== null) {
        contractStars.set(normalizeMeasureKey(key), star);
      }
    }
    stars.set(contractId, contractStars);
  }

  const dataByContract = new Map<string, Record<string, string>>();
  for (const row of dataRaw) {
    const contractId = (row.CONTRACT_ID ?? "").trim().toUpperCase();
    if (contractId && isHRContract(contractId)) {
      dataByContract.set(contractId, row);
    }
  }

  for (const [contractId] of stars) {
    const rawRow = dataByContract.get(contractId);
    const contractScores = new Map<string, number | null>();
    if (rawRow) {
      const dataKeys = Object.keys(rawRow).filter(isMeasureKey);
      for (const key of dataKeys) {
        contractScores.set(normalizeMeasureKey(key), parseScoreValue(rawRow[key] ?? ""));
      }
    }
    scores.set(contractId, contractScores);
  }

  return { stars, scores, contracts, measureKeys };
}

function buildUnifiedMeasures(yearDataMap: Map<number, YearData>): UnifiedMeasure[] {
  const byNorm = new Map<string, { displayName: string; codesByYear: Record<number, string>; keysByYear: Record<number, string> }>();

  for (const [year, yd] of yearDataMap) {
    for (const key of yd.measureKeys) {
      const code = extractMeasureCode(key);
      const rawName = extractMeasureName(key);
      const norm = normalizeMeasureKey(key);
      if (!norm || !code) continue;

      let entry = byNorm.get(norm);
      if (!entry) {
        entry = { displayName: rawName, codesByYear: {}, keysByYear: {} };
        byNorm.set(norm, entry);
      }
      entry.codesByYear[year] = code;
      entry.keysByYear[year] = key;
      if (rawName.length >= entry.displayName.length) {
        entry.displayName = rawName;
      }
    }
  }

  for (const [norm, entry] of byNorm) {
    const baseName = normalizeMeasureName(entry.displayName);
    const hasPart = norm.endsWith(" partc") || norm.endsWith(" partd");
    if (!hasPart) continue;
    const otherSuffix = norm.endsWith(" partc") ? " partd" : " partc";
    const otherKey = baseName + otherSuffix;
    if (byNorm.has(otherKey)) {
      const partLabel = norm.endsWith(" partd") ? " (Part D)" : " (Part C)";
      entry.displayName = entry.displayName + partLabel;
    }
  }

  return Array.from(byNorm.entries())
    .map(([normalizedName, entry]) => ({
      normalizedName,
      displayName: entry.displayName,
      codesByYear: entry.codesByYear,
      keysByYear: entry.keysByYear,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function ensureData() {
  if (dataCache) return dataCache;

  const years = new Map<number, YearData>();
  for (const year of AVAILABLE_YEARS) {
    years.set(year, loadYearData(year));
  }

  const measures = buildUnifiedMeasures(years);
  const cutPointsByYear = loadMeasureCutPoints(CUT_POINTS_PATH, [...AVAILABLE_YEARS]);

  dataCache = { years, measures, cutPointsByYear };
  return dataCache;
}

export function getAvailableMeasureYears(): number[] {
  return [...AVAILABLE_YEARS];
}

export function getMeasureByNormalizedName(measureNorm: string): UnifiedMeasure | null {
  const { measures } = ensureData();
  return measures.find((measure) => measure.normalizedName === measureNorm) ?? null;
}

export function getMeasureYearScoreSamples(measureNorm: string, year: number): MeasureScoreSample[] {
  const { years } = ensureData();
  const yearData = years.get(year);
  if (!yearData) return [];

  const samples: MeasureScoreSample[] = [];
  for (const [contractId, scores] of yearData.scores) {
    const score = scores.get(measureNorm);
    if (score !== null && score !== undefined) {
      samples.push({ contractId, score });
    }
  }

  return samples;
}

/** Group raw scores to 0.1 resolution so near-integers collapse to one bucket. */
export function scoreBucketKey(score: number): number {
  return Math.round(score * 10) / 10;
}

export function aggregateScoreChangesByFromScore(contracts: ContractMovementRow[]): PerFromScoreRow[] {
  const map = new Map<number, number[]>();
  for (const c of contracts) {
    if (c.fromScore === null || c.toScore === null) continue;
    const key = scoreBucketKey(c.fromScore);
    const delta = c.toScore - c.fromScore;
    const arr = map.get(key);
    if (arr) arr.push(delta);
    else map.set(key, [delta]);
  }
  const rows: PerFromScoreRow[] = [];
  for (const [fromScore, deltas] of map) {
    const sum = deltas.reduce((a, b) => a + b, 0);
    rows.push({
      fromScore,
      cohortSize: deltas.length,
      avgScoreChange: Number((sum / deltas.length).toFixed(2)),
    });
  }
  rows.sort((a, b) => a.fromScore - b.fromScore);
  return rows;
}

function buildScoreChangeGroup(deltas: number[]): ScoreChangeGroup {
  if (deltas.length === 0) return { count: 0, avgScoreChange: null };
  const sum = deltas.reduce((s, v) => s + v, 0);
  return {
    count: deltas.length,
    avgScoreChange: Number((sum / deltas.length).toFixed(2)),
  };
}

function computeStats(values: number[]): { mean: number; median: number; min: number; max: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    mean: Number((sum / sorted.length).toFixed(2)),
    median: Number(median.toFixed(2)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Number(((count / total) * 100).toFixed(1));
}

export type HistoricalTransition = {
  fromYear: number;
  toYear: number;
  movement: BandMovementStats;
  cutPoints: CutPointComparison | null;
  scoreStats: { from: ScoreStats; to: ScoreStats } | null;
  /** Avg score change by from-year numeric score (within this star band). */
  perFromScore: PerFromScoreRow[];
};

export type HistoricalBandMovementResponse = {
  status: "ready";
  measures: UnifiedMeasure[];
  transitions: number[];
  selectedMeasure: string;
  selectedStar: StarRating;
  history: HistoricalTransition[];
};

export function getAvailableOptions(): { measures: UnifiedMeasure[]; transitions: number[] } {
  const { measures } = ensureData();
  return { measures, transitions: [...TRANSITION_FROM_YEARS] };
}

export function analyzeHistoricalBandMovement(
  measureNorm: string,
  star: StarRating
): Omit<HistoricalBandMovementResponse, "status" | "measures" | "transitions"> {
  const history: HistoricalTransition[] = [];

  for (const fromYear of TRANSITION_FROM_YEARS) {
    const result = analyzeBandMovement(measureNorm, star, fromYear);
    if (result.movement) {
      history.push({
        fromYear,
        toYear: fromYear + 1,
        movement: result.movement,
        cutPoints: result.cutPoints,
        scoreStats: result.scoreStats,
        perFromScore: aggregateScoreChangesByFromScore(result.contracts),
      });
    }
  }

  return { selectedMeasure: measureNorm, selectedStar: star, history };
}

function computeFractionalPosition(
  score: number,
  star: StarRating,
  cutPoint: MeasureCutPoint,
  inverted: boolean
): number {
  const t = cutPoint.thresholds;
  let lower: number;
  let upper: number;

  if (inverted) {
    switch (star) {
      case 5: lower = 0; upper = t.fiveStar; break;
      case 4: lower = t.fiveStar; upper = t.fourStar; break;
      case 3: lower = t.fourStar; upper = t.threeStar; break;
      case 2: lower = t.threeStar; upper = t.twoStar; break;
      default: lower = t.twoStar; upper = t.twoStar * 2; break;
    }
    if (upper <= lower) return star;
    const ratio = Math.max(0, Math.min(1, (upper - score) / (upper - lower)));
    return Number((star + ratio).toFixed(2));
  }

  switch (star) {
    case 1: lower = 0; upper = t.twoStar; break;
    case 2: lower = t.twoStar; upper = t.threeStar; break;
    case 3: lower = t.threeStar; upper = t.fourStar; break;
    case 4: lower = t.fourStar; upper = t.fiveStar; break;
    default: lower = t.fiveStar; upper = t.fiveStar + (t.fiveStar - t.fourStar); break;
  }
  if (upper <= lower) return star;
  const ratio = Math.max(0, Math.min(1, (score - lower) / (upper - lower)));
  return Number((star + ratio).toFixed(2));
}

/** Max CMS-style measure score used as an upper bound for 5★ (normal) and 1★ (inverted) density bands. */
const SCORE_SCALE_MAX = 100;
/** Min measure score used as a lower bound for 5★ (inverted) and 1★ (normal) density bands. */
const SCORE_SCALE_MIN = 0;

export function computeWithinBandDensity(
  scores: number[],
  star: StarRating,
  cutPoint: MeasureCutPoint,
  inverted: boolean
): WithinBandDensity | null {
  if (scores.length === 0) return null;
  const t = cutPoint.thresholds;

  let lower: number;
  let upper: number;

  if (inverted) {
    switch (star) {
      case 5: lower = SCORE_SCALE_MIN; upper = t.fiveStar; break;
      case 4: lower = t.fiveStar; upper = t.fourStar; break;
      case 3: lower = t.fourStar; upper = t.threeStar; break;
      case 2: lower = t.threeStar; upper = t.twoStar; break;
      default: lower = t.twoStar; upper = SCORE_SCALE_MAX; break;
    }
  } else {
    switch (star) {
      case 1: lower = SCORE_SCALE_MIN; upper = t.twoStar; break;
      case 2: lower = t.twoStar; upper = t.threeStar; break;
      case 3: lower = t.threeStar; upper = t.fourStar; break;
      case 4: lower = t.fourStar; upper = t.fiveStar; break;
      default: lower = t.fiveStar; upper = SCORE_SCALE_MAX; break;
    }
  }

  const range = Math.abs(upper - lower);
  if (range === 0) return null;
  const margin = Math.max(range * 0.25, 1);

  const lowBound = Math.min(lower, upper);
  const highBound = Math.max(lower, upper);

  let nearLower = 0;
  let nearUpper = 0;
  for (const s of scores) {
    if (Math.abs(s - lowBound) <= margin) nearLower++;
    else if (Math.abs(s - highBound) <= margin) nearUpper++;
  }
  const middle = scores.length - nearLower - nearUpper;

  return {
    nearLowerThreshold: nearLower,
    nearLowerPct: Number(((nearLower / scores.length) * 100).toFixed(1)),
    middle,
    middlePct: Number(((middle / scores.length) * 100).toFixed(1)),
    nearUpperThreshold: nearUpper,
    nearUpperPct: Number(((nearUpper / scores.length) * 100).toFixed(1)),
    lowerThreshold: lowBound,
    upperThreshold: highBound,
  };
}

export function analyzeBandMovement(
  measureNorm: string,
  star: StarRating,
  fromYear: number
): Omit<BandMovementResponse, "status" | "measures" | "transitions"> {
  const { years, measures, cutPointsByYear } = ensureData();
  const toYear = fromYear + 1;

  const fromData = years.get(fromYear);
  const toData = years.get(toYear);

  if (!fromData || !toData) {
    return { selectedMeasure: measureNorm, selectedStar: star, fromYear, toYear, movement: null, scoreStats: null, cutPoints: null, contracts: [], allBands: [] };
  }

  const measure = measures.find((m) => m.normalizedName === measureNorm);
  if (!measure) {
    return { selectedMeasure: measureNorm, selectedStar: star, fromYear, toYear, movement: null, scoreStats: null, cutPoints: null, contracts: [], allBands: [] };
  }

  const cohortIds: string[] = [];
  for (const [contractId, contractStars] of fromData.stars) {
    const s = contractStars.get(measureNorm);
    if (s === star) cohortIds.push(contractId);
  }

  const contracts: ContractMovementRow[] = [];
  const fromScores: number[] = [];
  const toScores: number[] = [];
  let improved = 0;
  let held = 0;
  let declined = 0;
  const toBuckets = new Map<StarRating, number>();
  const improvedDeltas: number[] = [];
  const heldDeltas: number[] = [];
  const declinedDeltas: number[] = [];

  const codePrefix = (measure.codesByYear[fromYear] ?? measure.codesByYear[toYear] ?? "C")[0] as string;
  const fromCutPointsList = cutPointsByYear.get(fromYear) ?? [];
  const toCutPointsList = cutPointsByYear.get(toYear) ?? [];
  const fromMatch = matchCutPointToMeasureName(measure.displayName, codePrefix, fromCutPointsList);
  const toMatch = matchCutPointToMeasureName(measure.displayName, codePrefix, toCutPointsList);
  const inverted = isInvertedMeasure(measure.displayName);

  const fractionalFromValues: number[] = [];
  const fractionalToValues: number[] = [];
  const fractionalChanges: number[] = [];

  for (const contractId of cohortIds) {
    const record = fromData.contracts.get(contractId) ?? toData.contracts.get(contractId);
    if (!record) continue;

    const toStarMap = toData.stars.get(contractId);
    const toStar = toStarMap?.get(measureNorm) ?? null;
    if (toStar === null) continue;

    const fromScore = fromData.scores.get(contractId)?.get(measureNorm) ?? null;
    const toScore = toData.scores.get(contractId)?.get(measureNorm) ?? null;
    const starChange = toStar - star;
    const scoreDelta = fromScore !== null && toScore !== null ? toScore - fromScore : null;

    const fractionalFrom = fromScore !== null && fromMatch ? computeFractionalPosition(fromScore, star, fromMatch, inverted) : null;
    const fractionalTo = toScore !== null && toMatch ? computeFractionalPosition(toScore, toStar, toMatch, inverted) : null;
    const fractionalChange = fractionalFrom !== null && fractionalTo !== null ? Number((fractionalTo - fractionalFrom).toFixed(2)) : null;

    contracts.push({ ...record, fromStar: star, fromScore, toStar, toScore, starChange, fractionalFrom, fractionalTo, fractionalChange });

    if (fromScore !== null) fromScores.push(fromScore);
    if (toScore !== null) toScores.push(toScore);
    if (fractionalFrom !== null) fractionalFromValues.push(fractionalFrom);
    if (fractionalTo !== null) fractionalToValues.push(fractionalTo);
    if (fractionalChange !== null) fractionalChanges.push(fractionalChange);

    if (toStar > star) {
      improved++;
      if (scoreDelta !== null) improvedDeltas.push(scoreDelta);
    } else if (toStar === star) {
      held++;
      if (scoreDelta !== null) heldDeltas.push(scoreDelta);
    } else {
      declined++;
      if (scoreDelta !== null) declinedDeltas.push(scoreDelta);
    }
    toBuckets.set(toStar, (toBuckets.get(toStar) ?? 0) + 1);
  }

  const cohortSize = contracts.length;
  const buckets: MovementBucket[] = ([1, 2, 3, 4, 5] as StarRating[]).map(
    (s): MovementBucket => ({ toStar: s, count: toBuckets.get(s) ?? 0, pct: pct(toBuckets.get(s) ?? 0, cohortSize) })
  );

  const withinBandDensity = fromMatch ? computeWithinBandDensity(fromScores, star, fromMatch, inverted) : null;

  const avgFractional = (vals: number[]) => vals.length > 0 ? Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)) : null;

  const movement: BandMovementStats = {
    cohortSize,
    improved,
    improvedPct: pct(improved, cohortSize),
    held,
    heldPct: pct(held, cohortSize),
    declined,
    declinedPct: pct(declined, cohortSize),
    buckets,
    improvedScores: buildScoreChangeGroup(improvedDeltas),
    heldScores: buildScoreChangeGroup(heldDeltas),
    declinedScores: buildScoreChangeGroup(declinedDeltas),
    withinBandDensity,
    avgFractionalFrom: avgFractional(fractionalFromValues),
    avgFractionalTo: avgFractional(fractionalToValues),
    avgFractionalChange: avgFractional(fractionalChanges),
  };

  const fromStats = computeStats(fromScores);
  const toStats = computeStats(toScores);
  const scoreStats = {
    from: { year: fromYear, mean: fromStats?.mean ?? null, median: fromStats?.median ?? null, min: fromStats?.min ?? null, max: fromStats?.max ?? null, count: fromScores.length },
    to: { year: toYear, mean: toStats?.mean ?? null, median: toStats?.median ?? null, min: toStats?.min ?? null, max: toStats?.max ?? null, count: toScores.length },
  };

  let cutPoints: CutPointComparison | null = null;
  if (fromMatch && toMatch) {
    cutPoints = {
      fromYear: { year: fromYear, twoStar: fromMatch.thresholds.twoStar, threeStar: fromMatch.thresholds.threeStar, fourStar: fromMatch.thresholds.fourStar, fiveStar: fromMatch.thresholds.fiveStar },
      toYear: { year: toYear, twoStar: toMatch.thresholds.twoStar, threeStar: toMatch.thresholds.threeStar, fourStar: toMatch.thresholds.fourStar, fiveStar: toMatch.thresholds.fiveStar },
      delta: {
        twoStar: Number((toMatch.thresholds.twoStar - fromMatch.thresholds.twoStar).toFixed(2)),
        threeStar: Number((toMatch.thresholds.threeStar - fromMatch.thresholds.threeStar).toFixed(2)),
        fourStar: Number((toMatch.thresholds.fourStar - fromMatch.thresholds.fourStar).toFixed(2)),
        fiveStar: Number((toMatch.thresholds.fiveStar - fromMatch.thresholds.fiveStar).toFixed(2)),
      },
      measureName: fromMatch.measureName,
      hlCode: fromMatch.hlCode,
      domain: fromMatch.domain,
      weight: fromMatch.weight,
    };
  }

  const allBands = computeAllBands(measureNorm, fromYear, fromData, toData);

  contracts.sort((a, b) => (b.starChange ?? -99) - (a.starChange ?? -99));

  return { selectedMeasure: measureNorm, selectedStar: star, fromYear, toYear, movement, scoreStats, cutPoints, contracts, allBands };
}

function computeAllBands(
  measureNorm: string,
  fromYear: number,
  fromData: YearData,
  toData: YearData
): AllBandRow[] {
  const rows: AllBandRow[] = [];

  for (const star of [1, 2, 3, 4, 5] as StarRating[]) {
    const cohortIds: string[] = [];
    for (const [contractId, contractStars] of fromData.stars) {
      if (contractStars.get(measureNorm) === star) cohortIds.push(contractId);
    }

    let improved = 0;
    let held = 0;
    let declined = 0;
    let sumChange = 0;
    let matchedCount = 0;

    for (const contractId of cohortIds) {
      const toStar = toData.stars.get(contractId)?.get(measureNorm) ?? null;
      if (toStar === null) continue;
      const change = toStar - star;
      sumChange += change;
      matchedCount++;
      if (change > 0) improved++;
      else if (change === 0) held++;
      else declined++;
    }

    if (matchedCount === 0) {
      rows.push({ star, cohortSize: 0, improved: 0, improvedPct: 0, held: 0, heldPct: 0, declined: 0, declinedPct: 0, avgStarChange: null });
      continue;
    }

    rows.push({
      star,
      cohortSize: matchedCount,
      improved,
      improvedPct: pct(improved, matchedCount),
      held,
      heldPct: pct(held, matchedCount),
      declined,
      declinedPct: pct(declined, matchedCount),
      avgStarChange: matchedCount > 0 ? Number((sumChange / matchedCount).toFixed(2)) : null,
    });
  }

  return rows;
}
