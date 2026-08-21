import type { CsvData } from "@/lib/export/csv";

import { formatScore } from "./stats";
import type {
  ComparisonSlice,
  MeasureDistribution,
  ScoreSlice,
} from "./types";

const STAR_LABELS = [5, 4, 3, 2, 1] as const;

function partLabel(normalizedName: string): "C" | "D" {
  return normalizedName.endsWith(" partd") ? "D" : "C";
}

function pct(value: number): string {
  return value.toFixed(1);
}

export function bookVsCmsStarShareCsv(
  rows: Array<{ measure: MeasureDistribution; slice: ComparisonSlice }>
): CsvData {
  const starHeaders = STAR_LABELS.flatMap((star) => [
    `${star}_star_book_pct`,
    `${star}_star_cms_pct`,
    `${star}_star_delta_pp`,
  ]);

  return {
    headers: [
      "measure",
      "part",
      ...starHeaders,
      "mean_book",
      "mean_cms",
      "mean_delta",
      "n_book",
      "n_cms",
    ],
    rows: rows.map(({ measure, slice }) => {
      const starCells = STAR_LABELS.flatMap((star) => {
        const index = star - 1;
        const book = slice.book.pct[index];
        const cms = slice.cms.pct[index];
        return [pct(book), pct(cms), (book - cms).toFixed(1)];
      });
      return [
        measure.name,
        partLabel(measure.normalizedName),
        ...starCells,
        slice.book.mean.toFixed(2),
        slice.cms.mean.toFixed(2),
        slice.meanDelta.toFixed(2),
        String(slice.book.n),
        String(slice.cms.n),
      ];
    }),
  };
}

export function bookVsCmsScoreCsv(
  rows: Array<{ measure: MeasureDistribution; score: ScoreSlice }>
): CsvData {
  return {
    headers: [
      "measure",
      "part",
      "inverted",
      "score_book",
      "score_cms",
      "score_delta",
      "n_book",
      "n_cms",
    ],
    rows: rows.map(({ measure, score }) => [
      measure.name,
      partLabel(measure.normalizedName),
      measure.inverted ? "yes" : "no",
      score.book.n === 0 ? "" : formatScore(score.book.mean),
      score.cms.n === 0 ? "" : formatScore(score.cms.mean),
      score.book.n === 0 || score.cms.n === 0 ? "" : score.meanDelta.toFixed(2),
      String(score.book.n),
      String(score.cms.n),
    ]),
  };
}
