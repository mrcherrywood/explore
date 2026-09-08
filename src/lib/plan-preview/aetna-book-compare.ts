import * as XLSX from "xlsx";

import { getMeasureYearScoreSamples } from "@/lib/band-movement/analysis";
import { isAetnaForecastParent } from "@/lib/cutpoint-forecast/exclusions";
import { isInvertedMeasure } from "@/lib/percentile-analysis/measure-matching";
import { loadContractMetadata } from "@/lib/reward-factor/backtest";

export const AETNA_BOOK_GROUP = {
  aetna: "Aetna",
  rest: "Rest of book",
} as const;

export type AetnaBookGroup = (typeof AETNA_BOOK_GROUP)[keyof typeof AETNA_BOOK_GROUP];

export type AetnaBookScoreInput = {
  contractId: string;
  measureNormalized: string;
  measureDisplayName: string;
  measureCode: string | null;
  metricCategory: "Part C" | "Part D" | "Other";
  score: number;
};

export type AetnaBookDetailRow = {
  measureDisplayName: string;
  measureNormalized: string;
  measureCode: string | null;
  part: "Part C" | "Part D" | "Other";
  lowerIsBetter: boolean;
  group: AetnaBookGroup;
  contractId: string;
  contractName: string | null;
  parentOrganization: string | null;
  currentScore: number;
  priorScore: number | null;
  scoreDelta: number | null;
};

export type AetnaBookMeasureRow = {
  measureDisplayName: string;
  measureNormalized: string;
  measureCode: string | null;
  part: "Part C" | "Part D" | "Other";
  lowerIsBetter: boolean;
  aetnaContracts: number;
  restContracts: number;
  aetnaMean: number | null;
  restMean: number | null;
  delta: number | null;
  aetnaVsBook: "Better" | "Worse" | "Same" | null;
  aetnaMedian: number | null;
  restMedian: number | null;
  aetnaPriorMean: number | null;
  restPriorMean: number | null;
  aetnaYoyDelta: number | null;
  restYoyDelta: number | null;
};

export type AetnaBookCompareBundle = {
  starsYear: number;
  priorYear: number;
  generatedAt: string;
  aetnaContractCount: number;
  restContractCount: number;
  measures: AetnaBookMeasureRow[];
  detailRows: AetnaBookDetailRow[];
  bookNote?: string;
};

export type ContractNameParent = {
  contractName: string | null;
  parentOrganization: string | null;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? round2(sorted[mid]!)
    : round2((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function partRank(part: AetnaBookMeasureRow["part"]): number {
  if (part === "Part C") return 0;
  if (part === "Part D") return 1;
  return 2;
}

function compareMeasures(
  left: Pick<AetnaBookMeasureRow, "part" | "measureDisplayName" | "measureCode">,
  right: Pick<AetnaBookMeasureRow, "part" | "measureDisplayName" | "measureCode">,
): number {
  const part = partRank(left.part) - partRank(right.part);
  if (part !== 0) return part;
  return (
    left.measureDisplayName.localeCompare(right.measureDisplayName) ||
    (left.measureCode ?? "").localeCompare(right.measureCode ?? "", undefined, {
      numeric: true,
    })
  );
}

function aetnaVsBook(
  delta: number | null,
  lowerIsBetter: boolean,
): AetnaBookMeasureRow["aetnaVsBook"] {
  if (delta === null) return null;
  if (delta === 0) return "Same";
  const aetnaHigher = delta > 0;
  const better = lowerIsBetter ? !aetnaHigher : aetnaHigher;
  return better ? "Better" : "Worse";
}

function groupStats(rows: AetnaBookDetailRow[]) {
  return {
    n: rows.length,
    mean: mean(rows.map((row) => row.currentScore)),
    median: median(rows.map((row) => row.currentScore)),
    priorMean: mean(
      rows
        .map((row) => row.priorScore)
        .filter((score): score is number => score !== null),
    ),
    yoyDelta: mean(
      rows
        .map((row) => row.scoreDelta)
        .filter((delta): delta is number => delta !== null),
    ),
  };
}

export function resolveAetnaBookGroup(
  parentOrganization: string | null,
): AetnaBookGroup {
  return isAetnaForecastParent(parentOrganization ?? "")
    ? AETNA_BOOK_GROUP.aetna
    : AETNA_BOOK_GROUP.rest;
}

export function buildAetnaBookCompare(input: {
  starsYear: number;
  priorYear: number;
  projections: AetnaBookScoreInput[];
  metadata: Map<string, ContractNameParent>;
  priorByMeasure?: Map<string, Map<string, number>>;
  generatedAt?: string;
  bookNote?: string;
}): AetnaBookCompareBundle {
  const priorByMeasure = input.priorByMeasure ?? new Map();
  const detailRows: AetnaBookDetailRow[] = [];

  for (const projection of input.projections) {
    const contractId = projection.contractId.trim().toUpperCase();
    if (!Number.isFinite(projection.score)) continue;
    const meta = input.metadata.get(contractId);
    const parentOrganization = meta?.parentOrganization ?? null;
    const priorScore =
      priorByMeasure.get(projection.measureNormalized)?.get(contractId) ?? null;
    const currentScore = round2(projection.score);
    detailRows.push({
      measureDisplayName: projection.measureDisplayName,
      measureNormalized: projection.measureNormalized,
      measureCode: projection.measureCode,
      part: projection.metricCategory,
      lowerIsBetter: isInvertedMeasure(projection.measureDisplayName),
      group: resolveAetnaBookGroup(parentOrganization),
      contractId,
      contractName: meta?.contractName ?? null,
      parentOrganization,
      currentScore,
      priorScore: priorScore === null ? null : round2(priorScore),
      scoreDelta:
        priorScore === null ? null : round2(currentScore - priorScore),
    });
  }

  detailRows.sort(
    (left, right) =>
      compareMeasures(left, right) ||
      left.group.localeCompare(right.group) ||
      left.contractId.localeCompare(right.contractId),
  );

  const byMeasure = new Map<string, AetnaBookDetailRow[]>();
  for (const row of detailRows) {
    const list = byMeasure.get(row.measureNormalized) ?? [];
    list.push(row);
    byMeasure.set(row.measureNormalized, list);
  }

  const measures: AetnaBookMeasureRow[] = [...byMeasure.values()].map((rows) => {
    const first = rows[0]!;
    const aetna = rows.filter((row) => row.group === AETNA_BOOK_GROUP.aetna);
    const rest = rows.filter((row) => row.group === AETNA_BOOK_GROUP.rest);
    const aetnaStats = groupStats(aetna);
    const restStats = groupStats(rest);
    const delta =
      aetnaStats.mean === null || restStats.mean === null
        ? null
        : round2(aetnaStats.mean - restStats.mean);
    return {
      measureDisplayName: first.measureDisplayName,
      measureNormalized: first.measureNormalized,
      measureCode: first.measureCode,
      part: first.part,
      lowerIsBetter: first.lowerIsBetter,
      aetnaContracts: aetnaStats.n,
      restContracts: restStats.n,
      aetnaMean: aetnaStats.mean,
      restMean: restStats.mean,
      delta,
      aetnaVsBook: aetnaVsBook(delta, first.lowerIsBetter),
      aetnaMedian: aetnaStats.median,
      restMedian: restStats.median,
      aetnaPriorMean: aetnaStats.priorMean,
      restPriorMean: restStats.priorMean,
      aetnaYoyDelta: aetnaStats.yoyDelta,
      restYoyDelta: restStats.yoyDelta,
    };
  });
  measures.sort(compareMeasures);

  const aetnaIds = new Set(
    detailRows
      .filter((row) => row.group === AETNA_BOOK_GROUP.aetna)
      .map((row) => row.contractId),
  );
  const restIds = new Set(
    detailRows
      .filter((row) => row.group === AETNA_BOOK_GROUP.rest)
      .map((row) => row.contractId),
  );

  return {
    starsYear: input.starsYear,
    priorYear: input.priorYear,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    aetnaContractCount: aetnaIds.size,
    restContractCount: restIds.size,
    measures,
    detailRows,
    bookNote: input.bookNote,
  };
}

export function priorScoresByMeasure(
  measureNormalized: string[],
  priorYear: number,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const measure of new Set(measureNormalized)) {
    out.set(
      measure,
      new Map(
        getMeasureYearScoreSamples(measure, priorYear).map((sample) => [
          sample.contractId.trim().toUpperCase(),
          sample.score,
        ]),
      ),
    );
  }
  return out;
}

export function loadAetnaBookMetadata(priorYear: number): Map<string, ContractNameParent> {
  return loadContractMetadata(priorYear);
}

function cell(value: number | string | boolean | null): string | number {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

const MEASURE_HEADERS = [
  "Measure",
  "Measure Code",
  "Part",
  "Lower is Better",
  "Aetna contracts",
  "Rest of book contracts",
  "Aetna mean",
  "Rest of book mean",
  "Delta (Aetna minus rest)",
  "Aetna vs book",
  "Aetna median",
  "Rest of book median",
  `Aetna mean prior year`,
  `Rest of book mean prior year`,
  "Aetna YoY delta",
  "Rest of book YoY delta",
] as const;

const DETAIL_HEADERS = [
  "Measure",
  "Measure Code",
  "Part",
  "Lower is Better",
  "Group",
  "Contract",
  "Contract Name",
  "Parent Organization",
  "Current score",
  "Prior year score",
  "YoY delta",
] as const;

function measureSheetRows(bundle: AetnaBookCompareBundle): (string | number)[][] {
  return [
    [...MEASURE_HEADERS],
    ...bundle.measures.map((row) => [
      row.measureDisplayName,
      row.measureCode ?? "",
      row.part,
      cell(row.lowerIsBetter),
      row.aetnaContracts,
      row.restContracts,
      cell(row.aetnaMean),
      cell(row.restMean),
      cell(row.delta),
      row.aetnaVsBook ?? "",
      cell(row.aetnaMedian),
      cell(row.restMedian),
      cell(row.aetnaPriorMean),
      cell(row.restPriorMean),
      cell(row.aetnaYoyDelta),
      cell(row.restYoyDelta),
    ]),
  ];
}

function detailSheetRows(bundle: AetnaBookCompareBundle): (string | number)[][] {
  return [
    [...DETAIL_HEADERS],
    ...bundle.detailRows.map((row) => [
      row.measureDisplayName,
      row.measureCode ?? "",
      row.part,
      cell(row.lowerIsBetter),
      row.group,
      row.contractId,
      row.contractName ?? "",
      row.parentOrganization ?? "",
      row.currentScore,
      cell(row.priorScore),
      cell(row.scoreDelta),
    ]),
  ];
}

function notesSheetRows(bundle: AetnaBookCompareBundle): string[][] {
  return [
    ["Stars year", String(bundle.starsYear)],
    ["Prior year", String(bundle.priorYear)],
    ["Generated", bundle.generatedAt],
    ["Aetna contracts", String(bundle.aetnaContractCount)],
    ["Rest of book contracts", String(bundle.restContractCount)],
    ["Measures", String(bundle.measures.length)],
    [],
    [
      "Book",
      bundle.bookNote ??
        "Approved forecast year-end scores (H+R). Aetna GSD (Diabetes Care – Blood Sugar Controlled) is excluded as untrusted.",
    ],
    [
      "Aetna",
      "Contracts whose published parent organization is CVS Health. Allina Health and Aetna JV is rest of book.",
    ],
    [
      "Rest of book",
      "Every other contract in the same approved forecast book.",
    ],
    [
      "Prior year",
      `Published Stars ${bundle.priorYear} scores for the same contract and measure.`,
    ],
    [
      "Aetna vs book",
      "Better/Worse uses Lower is Better. Complaints and Members Choosing to Leave treat a lower score as better.",
    ],
    ["Delta", "Aetna mean minus rest-of-book mean on the current year-end score."],
  ];
}

function sheetFromRows(rows: (string | number)[][], widths: number[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = widths.map((width) => ({ wch: width }));
  return sheet;
}

export function buildAetnaBookCompareWorkbook(bundle: AetnaBookCompareBundle): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(measureSheetRows(bundle), [
      42, 14, 10, 16, 16, 22, 14, 20, 24, 16, 14, 20, 22, 28, 16, 22,
    ]),
    "By Measure",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(detailSheetRows(bundle), [
      42, 14, 10, 16, 14, 12, 36, 36, 14, 16, 12,
    ]),
    "By Contract",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(notesSheetRows(bundle), [22, 110]),
    "Notes",
  );
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}
