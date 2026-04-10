/**
 * Shared CSV-based official threshold loading
 *
 * Reads mean_thresholds.csv and variance_thresholds.csv and exposes
 * helpers used by both the backtest and the QI-correlation endpoint.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { RatingType, PercentileThresholds } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const MEAN_THRESHOLDS_PATH = path.join(DATA_DIR, "mean_thresholds.csv");
const VARIANCE_THRESHOLDS_PATH = path.join(DATA_DIR, "variance_thresholds.csv");

export const CSV_COLUMN_TO_RATING_TYPE: Record<string, RatingType> = {
  "Part C Rating": "part_c",
  "Part D Rating (MA-PD)": "part_d_mapd",
  "Part D Rating (PDP)": "part_d_pdp",
  "Overall Rating": "overall_mapd",
};

export function parseThresholdCsv(content: string): Array<Record<string, string>> {
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }
    return row;
  });
}

let officialCache: Map<string, number> | null = null;

/**
 * Load official thresholds from mean_thresholds.csv and variance_thresholds.csv.
 * Uses "With New Measures" scenario when available (since our backtest includes all measures).
 * For 2025 where no "New Measures" column distinction exists, uses the single available scenario.
 */
export function loadOfficialThresholds(): Map<string, number> {
  if (officialCache) return officialCache;
  const cache = new Map<string, number>();

  const meanRows = parseThresholdCsv(readFileSync(MEAN_THRESHOLDS_PATH, "utf-8"));
  const varRows = parseThresholdCsv(readFileSync(VARIANCE_THRESHOLDS_PATH, "utf-8"));

  for (const row of meanRows) {
    const year = Number(row.Year);
    const newMeasures = (row["New Measures"] ?? "").trim();
    if (newMeasures === "Without") continue;

    const improvementKey = row.Improvement === "With" ? "with" : "without";
    const percentile = Number(row.Percentile);
    const pKey = percentile === 65 ? "mean65" : "mean85";

    for (const [csvCol, rt] of Object.entries(CSV_COLUMN_TO_RATING_TYPE)) {
      const val = Number(row[csvCol]);
      if (Number.isFinite(val)) {
        cache.set(`${year}_${improvementKey}_${pKey}_${rt}`, val);
      }
    }
  }

  for (const row of varRows) {
    const year = Number(row.Year);
    const newMeasures = (row["New Measures"] ?? "").trim();
    if (newMeasures === "Without") continue;

    const improvementKey = row.Improvement === "With" ? "with" : "without";
    const percentile = Number(row.Percentile);
    const pKey = percentile === 30 ? "var30" : "var70";

    for (const [csvCol, rt] of Object.entries(CSV_COLUMN_TO_RATING_TYPE)) {
      const val = Number(row[csvCol]);
      if (Number.isFinite(val)) {
        cache.set(`${year}_${improvementKey}_${pKey}_${rt}`, val);
      }
    }
  }

  officialCache = cache;
  return cache;
}

export function getOfficialForScenario(
  year: number,
  ratingType: RatingType,
  improvementIncluded: boolean,
): PercentileThresholds | null {
  const cache = loadOfficialThresholds();
  const ik = improvementIncluded ? "with" : "without";
  const mean65 = cache.get(`${year}_${ik}_mean65_${ratingType}`);
  const mean85 = cache.get(`${year}_${ik}_mean85_${ratingType}`);
  const var30 = cache.get(`${year}_${ik}_var30_${ratingType}`);
  const var70 = cache.get(`${year}_${ik}_var70_${ratingType}`);
  if (mean65 == null || mean85 == null || var30 == null || var70 == null) return null;
  return { mean65th: mean65, mean85th: mean85, variance30th: var30, variance70th: var70 };
}

export function hasOfficialThresholdsForYear(year: number): boolean {
  const cache = loadOfficialThresholds();
  return cache.has(`${year}_with_mean65_part_c`);
}

export function computeDifferences(
  computed: PercentileThresholds,
  official: PercentileThresholds,
): { differences: Record<string, number>; percentDifferences: Record<string, number> } {
  const keys = ["mean65th", "mean85th", "variance30th", "variance70th"] as const;
  const differences: Record<string, number> = {};
  const percentDifferences: Record<string, number> = {};
  for (const k of keys) {
    differences[k] = computed[k] - official[k];
    percentDifferences[k] = official[k] !== 0 ? ((computed[k] - official[k]) / official[k]) * 100 : 0;
  }
  return { differences, percentDifferences };
}

/**
 * Get all available years from the threshold CSVs.
 */
export function getOfficialThresholdYears(): number[] {
  const cache = loadOfficialThresholds();
  const years = new Set<number>();
  for (const key of cache.keys()) {
    const year = Number(key.split("_")[0]);
    if (Number.isFinite(year)) years.add(year);
  }
  return [...years].sort((a, b) => a - b);
}
