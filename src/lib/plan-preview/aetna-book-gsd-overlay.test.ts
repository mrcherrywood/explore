import assert from "node:assert/strict";
import test from "node:test";

import type { ImportedMonthlyMeasureRow } from "@/lib/cutpoint-forecast/types";

import type { AetnaBookScoreInput } from "./aetna-book-compare";
import {
  gsdYearEndFromImportedRows,
  mergeMissingBookScores,
} from "./aetna-book-gsd-overlay";

function monthly(
  overrides: Partial<ImportedMonthlyMeasureRow> &
    Pick<ImportedMonthlyMeasureRow, "contractId" | "month" | "normalizedMonth">,
): ImportedMonthlyMeasureRow {
  return {
    sourceRowNumber: 1,
    hlCode: "HL15",
    measureName: "Diabetes Care – Blood Sugar Controlled",
    measureDisplayName: "Diabetes Care – Blood Sugar Controlled",
    measureNormalized: "diabetes care blood sugar controlled partc",
    measureCode: "C12",
    metricCategory: "Part C",
    year: 2027,
    rate: 66,
    numeratorAll: null,
    denominatorAll: null,
    projectedFinal: null,
    ...overrides,
  };
}

test("gsdYearEndFromImportedRows uses month 12, not month 13", () => {
  const rows = gsdYearEndFromImportedRows(
    [
      monthly({ contractId: "H1001", month: 12, normalizedMonth: 12, rate: 66.4 }),
      monthly({ contractId: "H1001", month: 13, normalizedMonth: 13, rate: 12.2 }),
      monthly({
        contractId: "H1002",
        month: 1,
        normalizedMonth: 1,
        rate: 5,
        projectedFinal: 71.1,
      }),
      monthly({
        contractId: "H2001",
        month: 12,
        normalizedMonth: 12,
        rate: 80,
        measureNormalized: "breast cancer screening partc",
        measureDisplayName: "Breast Cancer Screening",
        measureCode: "C01",
      }),
    ],
    2027,
  );

  assert.deepEqual(
    rows.map((row) => [row.contractId, row.score]),
    [
      ["H1001", 66.4],
      ["H1002", 71.1],
    ],
  );
});

test("mergeMissingBookScores fills GSD only for contracts already in the book", () => {
  const existing: AetnaBookScoreInput[] = [
    {
      contractId: "H1001",
      measureNormalized: "breast cancer screening partc",
      measureDisplayName: "Breast Cancer Screening",
      measureCode: "C01",
      metricCategory: "Part C",
      score: 74,
    },
    {
      contractId: "H2001",
      measureNormalized: "diabetes care blood sugar controlled partc",
      measureDisplayName: "Diabetes Care – Blood Sugar Controlled",
      measureCode: "C12",
      metricCategory: "Part C",
      score: 88,
    },
  ];
  const overlay: AetnaBookScoreInput[] = [
    {
      contractId: "H1001",
      measureNormalized: "diabetes care blood sugar controlled partc",
      measureDisplayName: "Diabetes Care – Blood Sugar Controlled",
      measureCode: "C12",
      metricCategory: "Part C",
      score: 66,
    },
    {
      contractId: "H2001",
      measureNormalized: "diabetes care blood sugar controlled partc",
      measureDisplayName: "Diabetes Care – Blood Sugar Controlled",
      measureCode: "C12",
      metricCategory: "Part C",
      score: 10,
    },
    {
      contractId: "H9999",
      measureNormalized: "diabetes care blood sugar controlled partc",
      measureDisplayName: "Diabetes Care – Blood Sugar Controlled",
      measureCode: "C12",
      metricCategory: "Part C",
      score: 50,
    },
  ];

  const merged = mergeMissingBookScores(existing, overlay);
  assert.equal(merged.added, 1);
  const gsd = merged.rows.filter(
    (row) => row.measureNormalized === "diabetes care blood sugar controlled partc",
  );
  assert.deepEqual(
    gsd.map((row) => [row.contractId, row.score]),
    [
      ["H2001", 88],
      ["H1001", 66],
    ],
  );
});
