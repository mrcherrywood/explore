import { existsSync, readFileSync } from "node:fs";

import {
  getWorkbookCutPointsForYear,
  isCahpsMeasure,
} from "@/lib/band-movement/cut-point-methodology";
import {
  isInvertedMeasure,
  matchCutPointToMeasureName,
} from "@/lib/percentile-analysis/measure-matching";

import {
  hasOfficialTechNotesCutPoints,
  loadOfficialTechNotesCutPoints,
  officialCutPointsPath,
  parseOfficialCutPointsCsv,
} from "./official-cut-points";
import type { ThresholdValues } from "./star-outlook";

import type {
  ResultsRiskOpportunityKind,
  ResultsRiskOpportunityRow,
} from "./results-report-types";

export type RiskOpportunityKind = ResultsRiskOpportunityKind;
export type RiskOpportunityRow = ResultsRiskOpportunityRow;

const STANDARD_CLOSE_POINTS = 1;
const CAHPS_CLOSE_POINTS = 1;
const INVERTED_CLOSE_POINTS = 0.05;

export function closeThreshold(inverted: boolean, displayName?: string): number {
  if (inverted) return INVERTED_CLOSE_POINTS;
  if (displayName && isCahpsMeasure(displayName)) return CAHPS_CLOSE_POINTS;
  return STANDARD_CLOSE_POINTS;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function bandCuts(
  star: number,
  thresholds: ThresholdValues
): { riskCut: number | null; opportunityCut: number | null } {
  const byStar: Record<number, number> = {
    2: thresholds.twoStar,
    3: thresholds.threeStar,
    4: thresholds.fourStar,
    5: thresholds.fiveStar,
  };
  return {
    riskCut: star <= 1 ? null : (byStar[star] ?? null),
    opportunityCut: star >= 5 ? null : (byStar[star + 1] ?? null),
  };
}

export function proximityGaps(
  score: number,
  officialStar: number,
  thresholds: ThresholdValues,
  inverted: boolean
): { riskGap: number | null; opportunityGap: number | null; riskCut: number | null; opportunityCut: number | null } {
  const { riskCut, opportunityCut } = bandCuts(officialStar, thresholds);
  const riskGap =
    riskCut === null ? null : round2(inverted ? riskCut - score : score - riskCut);
  const opportunityGap =
    opportunityCut === null
      ? null
      : round2(inverted ? score - opportunityCut : opportunityCut - score);
  return { riskGap, opportunityGap, riskCut, opportunityCut };
}

export function classifyRiskOpportunity(input: {
  measureCode: string;
  displayName: string;
  officialStar: number;
  score: number;
  inverted: boolean;
  thresholds: ThresholdValues;
  weight?: number;
}): RiskOpportunityRow[] {
  const { riskGap, opportunityGap, riskCut, opportunityCut } = proximityGaps(
    input.score,
    input.officialStar,
    input.thresholds,
    input.inverted
  );
  const close = closeThreshold(input.inverted, input.displayName);
  const rows: RiskOpportunityRow[] = [];
  if (riskCut !== null && riskGap !== null && riskGap >= 0 && riskGap <= close) {
    rows.push({
      measureCode: input.measureCode,
      displayName: input.displayName,
      officialStar: input.officialStar,
      score: input.score,
      inverted: input.inverted,
      kind: "risk",
      cut: riskCut,
      gap: riskGap,
      weight: input.weight ?? 1,
    });
  }
  if (
    opportunityCut !== null &&
    opportunityGap !== null &&
    opportunityGap >= 0 &&
    opportunityGap <= close
  ) {
    rows.push({
      measureCode: input.measureCode,
      displayName: input.displayName,
      officialStar: input.officialStar,
      score: input.score,
      inverted: input.inverted,
      kind: "opportunity",
      cut: opportunityCut,
      gap: opportunityGap,
      weight: input.weight ?? 1,
    });
  }
  return rows;
}

export function sortRiskOpportunity(rows: RiskOpportunityRow[]): RiskOpportunityRow[] {
  return [...rows].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "risk" ? -1 : 1;
    if (left.gap !== right.gap) return left.gap - right.gap;
    if (left.weight !== right.weight) return right.weight - left.weight;
    const part = left.measureCode[0].localeCompare(right.measureCode[0]);
    if (part !== 0) return part;
    return left.measureCode.localeCompare(right.measureCode);
  });
}

export function thresholdsForMeasure(input: {
  starsYear: number;
  measureCode: string;
  measureName: string;
  measureNormalized: string;
}): ThresholdValues | null {
  const code = input.measureCode.toUpperCase();
  if (hasOfficialTechNotesCutPoints(input.starsYear)) {
    const filePath = officialCutPointsPath(input.starsYear);
    if (existsSync(filePath)) {
      const official = parseOfficialCutPointsCsv(readFileSync(filePath, "utf-8")).find(
        (row) => row.measureCode.toUpperCase() === code
      );
      if (official) {
        return {
          twoStar: official.twoStar,
          threeStar: official.threeStar,
          fourStar: official.fourStar,
          fiveStar: official.fiveStar,
        };
      }
    }
    const byName = loadOfficialTechNotesCutPoints(input.starsYear);
    const matched = matchCutPointToMeasureName(
      input.measureName,
      code[0] ?? null,
      byName,
      input.measureNormalized
    );
    if (matched) {
      return {
        twoStar: matched.thresholds.twoStar,
        threeStar: matched.thresholds.threeStar,
        fourStar: matched.thresholds.fourStar,
        fiveStar: matched.thresholds.fiveStar,
      };
    }
  }

  const workbook = matchCutPointToMeasureName(
    input.measureName,
    code[0] ?? null,
    getWorkbookCutPointsForYear(input.starsYear),
    input.measureNormalized
  );
  if (!workbook) return null;
  return {
    twoStar: workbook.thresholds.twoStar,
    threeStar: workbook.thresholds.threeStar,
    fourStar: workbook.thresholds.fourStar,
    fiveStar: workbook.thresholds.fiveStar,
  };
}

export function buildRiskOpportunityRows(
  measures: Array<{
    measureCode: string;
    measureDisplayName: string;
    measureNormalized: string;
    star: number | null;
    pp1Score: number | null;
    weight: number;
    inverted?: boolean;
  }>,
  starsYear: number
): { risk: RiskOpportunityRow[]; opportunity: RiskOpportunityRow[] } {
  const rows: RiskOpportunityRow[] = [];
  for (const measure of measures) {
    if (measure.star === null || measure.pp1Score === null) continue;
    // QI scores are derived from the other measures' movement on a ±0.5
    // scale, so point-based closeness to a cut is not meaningful.
    if (/quality improvement/i.test(measure.measureDisplayName)) continue;
    const thresholds = thresholdsForMeasure({
      starsYear,
      measureCode: measure.measureCode,
      measureName: measure.measureDisplayName,
      measureNormalized: measure.measureNormalized,
    });
    if (!thresholds) continue;
    const inverted = measure.inverted ?? isInvertedMeasure(measure.measureDisplayName);
    rows.push(
      ...classifyRiskOpportunity({
        measureCode: measure.measureCode,
        displayName: measure.measureDisplayName,
        officialStar: measure.star,
        score: measure.pp1Score,
        inverted,
        thresholds,
        weight: measure.weight,
      })
    );
  }
  const sorted = sortRiskOpportunity(rows);
  return {
    risk: sorted.filter((row) => row.kind === "risk"),
    opportunity: sorted.filter((row) => row.kind === "opportunity"),
  };
}
