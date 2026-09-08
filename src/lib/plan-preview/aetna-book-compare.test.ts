import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import {
  buildAetnaBookCompare,
  buildAetnaBookCompareWorkbook,
  resolveAetnaBookGroup,
  type AetnaBookScoreInput,
} from "./aetna-book-compare";

function projection(
  overrides: Partial<AetnaBookScoreInput> &
    Pick<AetnaBookScoreInput, "contractId" | "score">,
): AetnaBookScoreInput {
  return {
    measureNormalized: "breast cancer screening partc",
    measureDisplayName: "Breast Cancer Screening",
    measureCode: "C01",
    metricCategory: "Part C",
    ...overrides,
  };
}

function metadata(
  rows: Array<[string, string, string]>,
): Map<string, { contractName: string | null; parentOrganization: string | null }> {
  return new Map(
    rows.map(([id, name, parent]) => [
      id,
      { contractName: name, parentOrganization: parent },
    ]),
  );
}

test("resolveAetnaBookGroup flags CVS Health only", () => {
  assert.equal(resolveAetnaBookGroup("CVS Health Corporation"), "Aetna");
  assert.equal(
    resolveAetnaBookGroup("Allina Health and Aetna Insurance Holding Company"),
    "Rest of book",
  );
  assert.equal(resolveAetnaBookGroup("Elevance Health, Inc."), "Rest of book");
});

test("buildAetnaBookCompare compares Aetna to the rest of the book", () => {
  const bundle = buildAetnaBookCompare({
    starsYear: 2027,
    priorYear: 2026,
    generatedAt: "2026-09-08T00:00:00.000Z",
    metadata: metadata([
      ["H1001", "Aetna One", "CVS Health Corporation"],
      ["H1002", "Aetna Two", "CVS Health Corporation"],
      ["H2001", "Book One", "Elevance Health, Inc."],
      ["H2002", "Book Two", "Humana Inc."],
    ]),
    priorByMeasure: new Map([
      [
        "breast cancer screening partc",
        new Map([
          ["H1001", 70],
          ["H1002", 72],
          ["H2001", 80],
          ["H2002", 82],
        ]),
      ],
    ]),
    projections: [
      projection({ contractId: "H1001", score: 74 }),
      projection({ contractId: "H1002", score: 76 }),
      projection({ contractId: "H2001", score: 84 }),
      projection({ contractId: "H2002", score: 88 }),
    ],
  });

  assert.equal(bundle.aetnaContractCount, 2);
  assert.equal(bundle.restContractCount, 2);
  assert.equal(bundle.measures.length, 1);
  const row = bundle.measures[0]!;
  assert.equal(row.aetnaMean, 75);
  assert.equal(row.restMean, 86);
  assert.equal(row.delta, -11);
  assert.equal(row.aetnaVsBook, "Worse");
  assert.equal(row.aetnaMedian, 75);
  assert.equal(row.aetnaPriorMean, 71);
  assert.equal(row.aetnaYoyDelta, 4);
  assert.equal(row.restYoyDelta, 5);
});

test("inverted measures treat a lower Aetna mean as Better", () => {
  const bundle = buildAetnaBookCompare({
    starsYear: 2027,
    priorYear: 2026,
    metadata: metadata([
      ["H1001", "Aetna", "CVS Health Corporation"],
      ["H2001", "Book", "Humana Inc."],
    ]),
    projections: [
      {
        contractId: "H1001",
        score: 0.2,
        measureNormalized: "complaints about the health plan partc",
        measureDisplayName: "Complaints about the Health Plan",
        measureCode: "C28",
        metricCategory: "Part C",
      },
      {
        contractId: "H2001",
        score: 0.5,
        measureNormalized: "complaints about the health plan partc",
        measureDisplayName: "Complaints about the Health Plan",
        measureCode: "C28",
        metricCategory: "Part C",
      },
    ],
  });

  const row = bundle.measures[0]!;
  assert.equal(row.lowerIsBetter, true);
  assert.equal(row.delta, -0.3);
  assert.equal(row.aetnaVsBook, "Better");
});

test("Part C measures list before Part D", () => {
  const bundle = buildAetnaBookCompare({
    starsYear: 2027,
    priorYear: 2026,
    metadata: metadata([["H1001", "Aetna", "CVS Health Corporation"]]),
    projections: [
      {
        contractId: "H1001",
        score: 90,
        measureNormalized: "medication adherence for diabetes partd",
        measureDisplayName: "Medication Adherence for Diabetes",
        measureCode: "D08",
        metricCategory: "Part D",
      },
      projection({ contractId: "H1001", score: 80 }),
    ],
  });

  assert.deepEqual(
    bundle.measures.map((row) => row.measureCode),
    ["C01", "D08"],
  );
});

test("workbook includes By Measure, By Contract, and Notes", () => {
  const bundle = buildAetnaBookCompare({
    starsYear: 2027,
    priorYear: 2026,
    generatedAt: "2026-09-08T00:00:00.000Z",
    metadata: metadata([["H1001", "Aetna", "CVS Health Corporation"]]),
    projections: [projection({ contractId: "H1001", score: 80 })],
  });
  const workbook = XLSX.read(buildAetnaBookCompareWorkbook(bundle), {
    type: "buffer",
  });
  assert.deepEqual(workbook.SheetNames, ["By Measure", "By Contract", "Notes"]);
  const measure = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets["By Measure"]!,
  );
  assert.equal(measure[0]?.Measure, "Breast Cancer Screening");
  assert.equal(measure[0]?.["Aetna mean"], 80);
});

test("workbook Notes use the overlay book note when provided", () => {
  const bundle = buildAetnaBookCompare({
    starsYear: 2027,
    priorYear: 2026,
    metadata: metadata([["H1001", "Aetna", "CVS Health Corporation"]]),
    projections: [projection({ contractId: "H1001", score: 80 })],
    bookNote: "Aetna GSD month-12 rates are overlaid from the Press Ganey extract.",
  });
  const workbook = XLSX.read(buildAetnaBookCompareWorkbook(bundle), {
    type: "buffer",
  });
  const notes = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Notes!, {
    header: 1,
  });
  assert.ok(
    notes.some((row) =>
      String(row[1] ?? "").includes("overlaid from the Press Ganey extract"),
    ),
  );
});
