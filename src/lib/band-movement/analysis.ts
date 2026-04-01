import { readFileSync } from "node:fs";
import path from "node:path";

import {
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

export type ContractMovementRow = ContractRecord & {
  fromStar: StarRating;
  fromScore: number | null;
  toStar: StarRating;
  toScore: number | null;
  starChange: number;
};

export type MovementBucket = {
  toStar: StarRating;
  count: number;
  pct: number;
};

export type ScoreChangeGroup = {
  count: number;
  avgScoreChange: number | null;
  medianScoreChange: number | null;
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
        const norm = normalizeMeasureName(extractMeasureName(key));
        contractStars.set(norm, star);
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
        const norm = normalizeMeasureName(extractMeasureName(key));
        contractScores.set(norm, parseScoreValue(rawRow[key] ?? ""));
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
      const norm = normalizeMeasureName(rawName);
      if (!norm || !code) continue;

      let entry = byNorm.get(norm);
      if (!entry) {
        entry = { displayName: rawName, codesByYear: {}, keysByYear: {} };
        byNorm.set(norm, entry);
      }
      entry.codesByYear[year] = code;
      entry.keysByYear[year] = key;
      if (rawName.length > entry.displayName.length) {
        entry.displayName = rawName;
      }
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

function buildScoreChangeGroup(deltas: number[]): ScoreChangeGroup {
  if (deltas.length === 0) return { count: 0, avgScoreChange: null, medianScoreChange: null };
  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    count: deltas.length,
    avgScoreChange: Number((sum / deltas.length).toFixed(2)),
    medianScoreChange: Number(median.toFixed(2)),
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

export function getAvailableOptions(): { measures: UnifiedMeasure[]; transitions: number[] } {
  const { measures } = ensureData();
  return { measures, transitions: [...TRANSITION_FROM_YEARS] };
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

    contracts.push({ ...record, fromStar: star, fromScore, toStar, toScore, starChange });

    if (fromScore !== null) fromScores.push(fromScore);
    if (toScore !== null) toScores.push(toScore);

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
  };

  const fromStats = computeStats(fromScores);
  const toStats = computeStats(toScores);
  const scoreStats = {
    from: { year: fromYear, mean: fromStats?.mean ?? null, median: fromStats?.median ?? null, min: fromStats?.min ?? null, max: fromStats?.max ?? null, count: fromScores.length },
    to: { year: toYear, mean: toStats?.mean ?? null, median: toStats?.median ?? null, min: toStats?.min ?? null, max: toStats?.max ?? null, count: toScores.length },
  };

  const codePrefix = (measure.codesByYear[fromYear] ?? measure.codesByYear[toYear] ?? "C")[0] as string;
  const fromCutPoints = cutPointsByYear.get(fromYear) ?? [];
  const toCutPoints = cutPointsByYear.get(toYear) ?? [];
  const fromMatch = matchCutPointToMeasureName(measure.displayName, codePrefix, fromCutPoints);
  const toMatch = matchCutPointToMeasureName(measure.displayName, codePrefix, toCutPoints);

  let cutPoints: CutPointComparison | null = null;
  if (fromMatch && toMatch) {
    cutPoints = {
      fromYear: { year: fromYear, ...fromMatch.thresholds },
      toYear: { year: toYear, ...toMatch.thresholds },
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
