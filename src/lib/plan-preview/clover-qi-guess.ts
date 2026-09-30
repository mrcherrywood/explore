import { bandScoreWithOfficialCut } from "./tech-notes";
import type { OfficialCutPointRow } from "./official-cut-points";

/**
 * CMS improvement score is a weighted average of year-over-year labels.
 * Significant improvement is +1, significant decline is −1, and no significant
 * change or hold harmless is 0 and stays in the denominator. Other labels
 * (not eligible, not applicable, not included, disaster) are left out.
 * Checked against published Stars 2027 improvement scores.
 */
export type QiGuessLabel = {
  baselineCode: string;
  part: "part_c" | "part_d";
  significance: string;
  weight: number;
};

export type QiPartGuess = {
  index: number | null;
  star: number | null;
};

function improvementSignal(significance: string): number | null {
  const text = significance.trim().toLowerCase();
  if (text === "significant improvement") return 1;
  if (text === "significant decline") return -1;
  if (text === "no significant change" || text === "hold harmless") return 0;
  return null;
}

function indexForPart(
  rows: readonly QiGuessLabel[],
  part: "part_c" | "part_d",
  removedBaseline: ReadonlySet<string>,
): number | null {
  let weightedNet = 0;
  let includedWeight = 0;
  for (const row of rows) {
    if (row.part !== part || row.weight <= 0) continue;
    const signal = improvementSignal(row.significance);
    if (signal === null) continue;
    if (removedBaseline.has(row.baselineCode.toUpperCase())) continue;
    weightedNet += signal * row.weight;
    includedWeight += row.weight;
  }
  return includedWeight > 0 ? weightedNet / includedWeight : null;
}

function bandIndex(index: number | null, cut: OfficialCutPointRow | null): number | null {
  if (index === null || cut === null) return null;
  return bandScoreWithOfficialCut(index, cut);
}

/** Best-guess Part C and Part D QI stars after dropping the removed measures. */
export function guessRemainingQi(
  rows: readonly QiGuessLabel[],
  removedBaseline: readonly string[],
  cuts: { partC: OfficialCutPointRow | null; partD: OfficialCutPointRow | null },
): { partC: QiPartGuess; partD: QiPartGuess } {
  const removed = new Set(removedBaseline.map((code) => code.toUpperCase()));
  const partCIndex = indexForPart(rows, "part_c", removed);
  const partDIndex = indexForPart(rows, "part_d", removed);
  return {
    partC: { index: partCIndex, star: bandIndex(partCIndex, cuts.partC) },
    partD: { index: partDIndex, star: bandIndex(partDIndex, cuts.partD) },
  };
}
