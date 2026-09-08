import type { OfficialCutPointRow } from "./official-cut-points";

export type TechNotesRewardThresholdRow = {
  improvement: "With" | "Without";
  newMeasures: "With" | "Without" | "";
  percentile: number;
  partC: number;
  partDMapd: number;
  partDPdp: number;
  overall: number;
};

export type TechNotesParseResult = {
  starsYear: number | null;
  cutPoints: OfficialCutPointRow[];
  meanThresholds: TechNotesRewardThresholdRow[];
  varianceThresholds: TechNotesRewardThresholdRow[];
};

/**
 * Measure heading; the title may wrap onto a second line (joined when that line
 * has no `Label:` style colon and is not the `Title Description` table header).
 */
const MEASURE_HEADING =
  /Measure:\s*([CD]\d{2})\s*[-–]\s*([^\n]+(?:\n(?!Title Description)(?![^\n]*:)[^\n]*[A-Za-z][^\n]*)?)/gi;
const STARS_YEAR_PATTERN = /(\d{4})\s+Part C\s*&\s*D\s+Star Ratings/i;
/** Table-of-contents entries use dot leaders to the page number. */
const TOC_DOT_LEADERS = /\.{4,}/;
/** Page footer lines ("(Last Updated 09/01/2026) Page 85", "DRAFT"). */
const PAGE_FOOTER_LINE = /^.*(?:\(Last Updated[^)]*\)|\bPage\s+[ivx\d]+\s*$|^\s*DRAFT\b).*$/gim;
const FIRST_BOUND_PHRASE = /(?:Less|Greater)\s+than/i;

function extractNumbers(block: string): number[] {
  // A minus sign may be split from its digits by a line break ("Less than -\n0.18").
  return [...block.matchAll(/(-\s*)?(\d+(?:\.\d+)?)\s*%?/g)].map(
    (match) => Number(match[2]) * (match[1] ? -1 : 1)
  );
}

/**
 * Text of the cut-point bounds only: footers removed, the MA-PD row when the
 * table has MA-PD/PDP rows, and the `1 Star … 5 Stars` header dropped.
 */
function extractBoundsText(cutSection: string): string | null {
  let text = cutSection
    .replace(/^(?:Base Group )?Cut Points:/i, "")
    .replace(PAGE_FOOTER_LINE, "");
  const mapdIndex = text.search(/\bMA-PD\b/);
  if (mapdIndex >= 0) {
    text = text.slice(mapdIndex + "MA-PD".length);
    const pdpIndex = text.search(/\bPDP\b/);
    if (pdpIndex >= 0) text = text.slice(0, pdpIndex);
  }
  const firstBound = text.search(FIRST_BOUND_PHRASE);
  return firstBound >= 0 ? text.slice(firstBound).trim() : null;
}

function parseCutPointBlock(
  starsYear: number,
  measureCode: string,
  measureName: string,
  block: string
): OfficialCutPointRow | null {
  const cutMatch = block.match(
    /(?:Base Group )?Cut Points:[\s\S]*?(?=\nMeasure:|\nDomain:|\nThese technical notes|\nAttachment |\n$)/i
  );
  if (!cutMatch) return null;
  const bounds = extractBoundsText(cutMatch[0]);
  if (!bounds) return null;

  const trendLower = /General Trend:\s*Lower is better/i.test(block);
  const trendHigher = /General Trend:\s*Higher is better/i.test(block);
  const inverted =
    trendLower || (!trendHigher && /^Greater\s+than(?!\s+or\s+equal)/i.test(bounds));

  const numbers = extractNumbers(bounds);
  if (numbers.length < 4) return null;

  const uniqueBounds = numbers.filter((value, index, all) => all.indexOf(value) === index);
  if (uniqueBounds.length < 4) return null;

  const weightMatch = block.match(/Weighting Value:\s*(\d+(?:\.\d+)?)/i);
  const categoryMatch = block.match(/Weighting Category:\s*([^\n]+)/i);

  let twoStar: number;
  let threeStar: number;
  let fourStar: number;
  let fiveStar: number;
  if (inverted) {
    // Lower-is-better: thresholds are upper bounds of 2★–5★ (5★ is the smallest).
    const sorted = [...uniqueBounds].sort((a, b) => b - a);
    twoStar = sorted[0];
    threeStar = sorted[1];
    fourStar = sorted[2];
    fiveStar = sorted[3];
  } else {
    // Higher-is-better: thresholds are lower bounds of 2★–5★.
    const sorted = [...uniqueBounds].sort((a, b) => a - b);
    twoStar = sorted[0];
    threeStar = sorted[1];
    fourStar = sorted[2];
    fiveStar = sorted[3];
  }

  return {
    year: starsYear,
    measureCode: measureCode.toUpperCase(),
    measureName: measureName.replace(/\s+/g, " ").trim(),
    inverted,
    weightCategory: categoryMatch?.[1]?.trim() ?? null,
    weight: weightMatch ? Number(weightMatch[1]) : null,
    twoStar,
    threeStar,
    fourStar,
    fiveStar,
  };
}

function parseThresholdTable(
  text: string,
  tableTitle: string
): TechNotesRewardThresholdRow[] {
  // Skip the table-of-contents entry (dot leaders) and use the table itself.
  const heading = [...text.matchAll(new RegExp(`Table \\d+:\\s*${tableTitle}[^\\n]*`, "gi"))].find(
    (match) => !TOC_DOT_LEADERS.test(match[0])
  );
  if (!heading || heading.index === undefined) return [];
  const rest = text.slice(heading.index);
  const nextTable = rest.slice(10).search(/Table \d+:/i);
  const slice = nextTable >= 0 ? rest.slice(0, nextTable + 10) : rest.slice(0, 1800);
  const rows: TechNotesRewardThresholdRow[] = [];
  // PDF extraction may wrap the ordinal suffix onto its own line ("65\nth").
  const linePattern =
    /(With|Without)\s+(With|Without)\s+(\d+)\s*(?:st|nd|rd|th)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/g;
  for (const match of slice.matchAll(linePattern)) {
    rows.push({
      improvement: match[1] as "With" | "Without",
      newMeasures: match[2] as "With" | "Without",
      percentile: Number(match[3]),
      partC: Number(match[4]),
      partDMapd: Number(match[5]),
      partDPdp: Number(match[6]),
      overall: Number(match[7]),
    });
  }
  return rows;
}

export function parseTechNotesText(text: string, starsYearHint?: number): TechNotesParseResult {
  const yearMatch = STARS_YEAR_PATTERN.exec(text);
  const starsYear = starsYearHint ?? (yearMatch ? Number(yearMatch[1]) : null);
  const cutPoints: OfficialCutPointRow[] = [];
  const headings = [...text.matchAll(MEASURE_HEADING)].filter(
    (heading) => !TOC_DOT_LEADERS.test(heading[2])
  );

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? text.length;
    const block = text.slice(start, end);
    const parsed = parseCutPointBlock(
      starsYear ?? 0,
      heading[1],
      heading[2],
      block
    );
    if (parsed) cutPoints.push(parsed);
  }

  return {
    starsYear,
    cutPoints,
    meanThresholds: parseThresholdTable(text, "Performance Summary Thresholds"),
    varianceThresholds: parseThresholdTable(text, "Variance Thresholds"),
  };
}

export function formatThresholdCsvRows(
  starsYear: number,
  rows: TechNotesRewardThresholdRow[]
): string[] {
  return rows.map(
    (row) =>
      [
        starsYear,
        row.improvement,
        row.newMeasures,
        row.percentile,
        row.partC.toFixed(6),
        row.partDMapd.toFixed(6),
        row.partDPdp.toFixed(6),
        row.overall.toFixed(6),
      ].join(",")
  );
}

export function bandScoreWithOfficialCut(
  score: number,
  cut: OfficialCutPointRow
): 1 | 2 | 3 | 4 | 5 {
  if (cut.inverted) {
    if (score <= cut.fiveStar) return 5;
    if (score <= cut.fourStar) return 4;
    if (score <= cut.threeStar) return 3;
    if (score <= cut.twoStar) return 2;
    return 1;
  }
  if (score >= cut.fiveStar) return 5;
  if (score >= cut.fourStar) return 4;
  if (score >= cut.threeStar) return 3;
  if (score >= cut.twoStar) return 2;
  return 1;
}

export type OfficialStarValidationRow = {
  measureCode: string;
  predictedStar: number | null;
  officialStar: number | null;
  match: boolean | null;
};

export function validateOfficialStarsAgainstCuts(
  scores: Array<{ measureCode: string; score: number | null }>,
  officialStars: Array<{ measureCode: string; star: number | null }>,
  cuts: OfficialCutPointRow[]
): { rows: OfficialStarValidationRow[]; mismatchCount: number } {
  const cutByCode = new Map(cuts.map((cut) => [cut.measureCode.toUpperCase(), cut]));
  const officialByCode = new Map(
    officialStars.map((row) => [row.measureCode.toUpperCase(), row.star])
  );
  const rows: OfficialStarValidationRow[] = [];
  for (const score of scores) {
    const code = score.measureCode.toUpperCase();
    const cut = cutByCode.get(code);
    const officialStar = officialByCode.get(code) ?? null;
    const predictedStar =
      score.score === null || !cut ? null : bandScoreWithOfficialCut(score.score, cut);
    rows.push({
      measureCode: code,
      predictedStar,
      officialStar,
      match:
        predictedStar === null || officialStar === null ? null : predictedStar === officialStar,
    });
  }
  return {
    rows,
    mismatchCount: rows.filter((row) => row.match === false).length,
  };
}

export function upsertThresholdCsv(existing: string, year: number, newRows: string[]): string {
  const lines = existing.replace(/\s+$/, "").split(/\r?\n/);
  const header = lines[0];
  const kept = lines.slice(1).filter((line) => !line.startsWith(`${year},`));
  return `${[header, ...kept, ...newRows].join("\n")}\n`;
}
