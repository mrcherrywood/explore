import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { MeasureCutPoint } from "@/lib/percentile-analysis/measure-likelihood-types";
import { normalizeMeasureName } from "@/lib/percentile-analysis/measure-matching";

export type OfficialCutPointRow = {
  year: number;
  measureCode: string;
  measureName: string;
  inverted: boolean;
  weightCategory: string | null;
  weight: number | null;
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
};

const DATA_DIR = path.join(process.cwd(), "data");

export function officialCutPointsPath(starsYear: number): string {
  return path.join(DATA_DIR, `official_cut_points_${Math.round(starsYear)}.csv`);
}

export function hasOfficialTechNotesCutPoints(starsYear: number): boolean {
  return existsSync(officialCutPointsPath(starsYear));
}

/** Official Tech Notes measure weights keyed by that star year's measure code. */
export function loadOfficialMeasureWeights(starsYear: number): Map<string, number> {
  const filePath = officialCutPointsPath(starsYear);
  const weights = new Map<string, number>();
  if (!existsSync(filePath)) return weights;
  for (const row of parseOfficialCutPointsCsv(readFileSync(filePath, "utf-8"))) {
    if (row.weight != null && row.weight > 0 && row.measureCode) {
      weights.set(row.measureCode, row.weight);
    }
  }
  return weights;
}

/** Overlay Tech Notes weights onto last-year ma_measures so SY27 HOS outcomes stay 3. */
export function overlayOfficialMeasureWeights(
  starsYear: number,
  weights: Map<string, number>
): Map<string, number> {
  for (const [code, weight] of loadOfficialMeasureWeights(starsYear)) {
    weights.set(code, weight);
  }
  return weights;
}

export function parseOfficialCutPointsCsv(content: string): OfficialCutPointRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  const index = (name: string) => headers.indexOf(name);
  const yearIdx = index("year");
  const codeIdx = index("measure_code");
  const nameIdx = index("measure_name");
  const invertedIdx = index("inverted");
  const categoryIdx = index("weight_category");
  const weightIdx = index("weight");
  const twoIdx = index("two_star");
  const threeIdx = index("three_star");
  const fourIdx = index("four_star");
  const fiveIdx = index("five_star");

  const rows: OfficialCutPointRow[] = [];
  for (const line of lines.slice(1)) {
    const values = splitCsvLine(line);
    const twoStar = Number(values[twoIdx]);
    const threeStar = Number(values[threeIdx]);
    const fourStar = Number(values[fourIdx]);
    const fiveStar = Number(values[fiveIdx]);
    const year = Number(values[yearIdx]);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(twoStar) ||
      !Number.isFinite(threeStar) ||
      !Number.isFinite(fourStar) ||
      !Number.isFinite(fiveStar)
    ) {
      continue;
    }
    rows.push({
      year,
      measureCode: (values[codeIdx] ?? "").toUpperCase(),
      measureName: values[nameIdx] ?? "",
      inverted: (values[invertedIdx] ?? "").toLowerCase() === "true",
      weightCategory: values[categoryIdx] || null,
      weight: Number.isFinite(Number(values[weightIdx])) ? Number(values[weightIdx]) : null,
      twoStar,
      threeStar,
      fourStar,
      fiveStar,
    });
  }
  return rows;
}

/**
 * Shared-name Part C/D twins (Call Center, Members Choosing to Leave) get a
 * `(Part C)`/`(Part D)` suffix so name matching resolves the right part.
 */
export function disambiguateTwinMeasureNames(rows: OfficialCutPointRow[]): OfficialCutPointRow[] {
  const countByName = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeMeasureName(row.measureName);
    countByName.set(key, (countByName.get(key) ?? 0) + 1);
  }
  return rows.map((row) =>
    (countByName.get(normalizeMeasureName(row.measureName)) ?? 0) > 1
      ? { ...row, measureName: `${row.measureName} (Part ${row.measureCode[0]})` }
      : row
  );
}

export function loadOfficialTechNotesCutPoints(starsYear: number): MeasureCutPoint[] {
  const filePath = officialCutPointsPath(starsYear);
  if (!existsSync(filePath)) return [];
  const rows = disambiguateTwinMeasureNames(
    parseOfficialCutPointsCsv(readFileSync(filePath, "utf-8"))
  );
  return rows.map((row) => ({
    hlCode: "",
    measureName: row.measureName,
    domain: null,
    year: row.year,
    weight: row.weight,
    thresholds: {
      oneStarUpperBound: null,
      twoStar: row.twoStar,
      threeStar: row.threeStar,
      fourStar: row.fourStar,
      fiveStar: row.fiveStar,
    },
  }));
}

export function overlayOfficialTechNotesCutPoints(
  byYear: Map<number, MeasureCutPoint[]>
): Map<number, MeasureCutPoint[]> {
    for (const year of new Set([...byYear.keys(), ...guessNearbyOfficialYears()])) {
    const official = loadOfficialTechNotesCutPoints(year);
    if (official.length > 0) byYear.set(year, official);
  }
  return byYear;
}

function guessNearbyOfficialYears(): number[] {
  const current = new Date().getFullYear();
  return [current - 1, current, current + 1, current + 2];
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

export function formatOfficialCutPointsCsv(rows: OfficialCutPointRow[]): string {
  const header = [
    "year",
    "measure_code",
    "measure_name",
    "inverted",
    "weight_category",
    "weight",
    "two_star",
    "three_star",
    "four_star",
    "five_star",
  ].join(",");
  const lines = rows.map((row) =>
    [
      row.year,
      row.measureCode,
      csvEscape(row.measureName),
      row.inverted ? "true" : "false",
      csvEscape(row.weightCategory ?? ""),
      row.weight ?? "",
      row.twoStar,
      row.threeStar,
      row.fourStar,
      row.fiveStar,
    ].join(",")
  );
  return `${header}\n${lines.join("\n")}\n`;
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
