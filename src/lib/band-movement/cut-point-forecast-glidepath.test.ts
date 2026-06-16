import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGlidepathProjections,
  classifyMeasureType,
  inferYearEndMonth,
  projectSeriesToYearEnd,
} from "@/lib/cutpoint-forecast/glidepath";
import type { ImportedMonthlyMeasureRow } from "@/lib/cutpoint-forecast/types";

function makeRow(
  year: number,
  month: number,
  rate: number | null,
  overrides?: Partial<ImportedMonthlyMeasureRow>
): ImportedMonthlyMeasureRow {
  return {
    sourceRowNumber: year * 100 + month,
    hlCode: "HL01",
    contractId: "H9999",
    measureName: "Breast Cancer Screening",
    measureDisplayName: "Breast Cancer Screening",
    measureNormalized: "breast cancer screening",
    measureCode: "C01",
    metricCategory: "Part C",
    year,
    month,
    normalizedMonth: month,
    rate,
    numeratorAll: null,
    denominatorAll: null,
    ...overrides,
  };
}

test("inferYearEndMonth preserves closeout month 13 when present", () => {
  const rows = [makeRow(2025, 12, 80), makeRow(2025, 13, 82), makeRow(2026, 1, 70)];
  assert.equal(inferYearEndMonth(rows, 2026), 13);
});

test("projectSeriesToYearEnd blends trend and seasonality, clamped to ±2 for HEDIS", () => {
  const rows = [
    makeRow(2025, 3, 72),
    makeRow(2025, 12, 84),
    makeRow(2026, 1, 70),
    makeRow(2026, 2, 72),
    makeRow(2026, 3, 74),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "hedis");
  assert.equal(projection?.lastObservedMonth, 3);
  assert.equal(projection?.projectedScore, 86);
  assert.equal(["medium", "high"].includes(projection?.confidenceLabel ?? ""), true);
});

test("HEDIS measure uses observed month-12 value directly as the final rate (no guardrail)", () => {
  const rows = [
    makeRow(2025, 11, 70),
    makeRow(2025, 12, 72),
    makeRow(2026, 6, 80),
    makeRow(2026, 12, 83),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "hedis");
  assert.equal(projection?.lastObservedMonth, 12);
  // 83 is the actual observed final; it is NOT clamped to ±2 of prior-year final (72).
  assert.equal(projection?.projectedScore, 83);
  assert.equal(projection?.confidenceLabel, "high");
  assert.ok(projection?.notes.some((n) => n.includes("Final rate observed at month 12")));
});

test("hybrid HEDIS measure uses observed closeout month 13 value directly", () => {
  const rows = [
    makeRow(2025, 12, 60),
    makeRow(2025, 13, 65),
    makeRow(2026, 12, 70),
    makeRow(2026, 13, 78),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "hedis");
  assert.equal(projection?.lastObservedMonth, 13);
  assert.equal(projection?.projectedScore, 78);
  assert.ok(projection?.notes.some((n) => n.includes("Final hybrid rate observed at month 13")));
});

test("hybrid HEDIS measure not yet at closeout projects month 12 plus prior-year hybrid bump", () => {
  const rows = [
    makeRow(2025, 12, 60),
    makeRow(2025, 13, 66), // prior-year hybrid bump of +6 at closeout
    makeRow(2026, 11, 61),
    makeRow(2026, 12, 62),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "hedis");
  // Target month is 13 (hybrid history present) but current year only reaches 12,
  // so it models forward rather than using month 12 as final.
  assert.equal(projection?.lastObservedMonth, 12);
  assert.ok((projection?.projectedScore ?? 0) > 62);
});

test("classifyMeasureType identifies CAHPS, HOS, pharmacy, and HEDIS", () => {
  assert.equal(classifyMeasureType("annual flu vaccine", "C03", "Part C"), "cahps");
  assert.equal(classifyMeasureType("getting needed care", "C22", "Part C"), "cahps");
  assert.equal(classifyMeasureType("improving or maintaining physical health", "C04", "Part C"), "hos");
  assert.equal(classifyMeasureType("monitoring physical activity", "C06", "Part C"), "hos");
  assert.equal(classifyMeasureType("some unknown measure", "C04", "Part C"), "hos");
  assert.equal(classifyMeasureType("medication adherence for diabetes medications", "D08", "Part D"), "pharmacy");
  assert.equal(classifyMeasureType("breast cancer screening", "C01", "Part C"), "hedis");
});

test("CAHPS measure projects prior-year final score", () => {
  const cahpsOverrides = {
    measureName: "Getting Needed Care",
    measureDisplayName: "Getting Needed Care",
    measureNormalized: "getting needed care",
    measureCode: "C22",
  } as const;

  const rows = [
    makeRow(2025, 3, 80, cahpsOverrides),
    makeRow(2025, 12, 85, cahpsOverrides),
    makeRow(2026, 1, 70, cahpsOverrides),
    makeRow(2026, 2, 72, cahpsOverrides),
    makeRow(2026, 3, 74, cahpsOverrides),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "cahps");
  assert.equal(projection?.projectedScore, 85);
  assert.ok(projection?.notes.some((n) => n.includes("CAHPS") && n.includes("prior-year final")));
});

test("HOS measure projects prior-year final score", () => {
  const hosOverrides = {
    measureName: "Improving or Maintaining Physical Health",
    measureDisplayName: "Improving or Maintaining Physical Health",
    measureNormalized: "improving or maintaining physical health",
    measureCode: "C04",
  } as const;

  const rows = [
    makeRow(2025, 6, 50, hosOverrides),
    makeRow(2025, 12, 55, hosOverrides),
    makeRow(2026, 1, 48, hosOverrides),
    makeRow(2026, 2, 50, hosOverrides),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "hos");
  assert.equal(projection?.projectedScore, 55);
  assert.ok(projection?.notes.some((n) => n.includes("HOS") && n.includes("prior-year final")));
});

test("pharmacy measure clamps projection to ±1 from prior-year final when available", () => {
  const pharmacyOverrides = {
    measureName: "Medication Adherence for Diabetes Medications",
    measureDisplayName: "Medication Adherence for Diabetes Medications",
    measureNormalized: "medication adherence for diabetes medications",
    measureCode: "D08",
    metricCategory: "Part D" as const,
  };

  const rows = [
    makeRow(2025, 3, 85, pharmacyOverrides),
    makeRow(2025, 12, 90, pharmacyOverrides),
    makeRow(2026, 1, 80, pharmacyOverrides),
    makeRow(2026, 2, 82, pharmacyOverrides),
    makeRow(2026, 3, 84, pharmacyOverrides),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "pharmacy");
  assert.equal(projection?.projectedScore, 89);
});

test("HEDIS measure guardrail anchors to prior-year final score", () => {
  const rows = [
    makeRow(2025, 1, 70),
    makeRow(2025, 2, 72),
    makeRow(2025, 3, 74),
    makeRow(2025, 12, 90),
    makeRow(2026, 1, 70),
    makeRow(2026, 2, 74),
    makeRow(2026, 3, 78),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "hedis");
  assert.equal(projection?.projectedScore, 92);
  assert.ok(
    projection?.notes.some(
      (n) => n.includes("HEDIS") && n.includes("±2") && n.includes("prior-year final score")
    )
  );
});

test("HEDIS measure finishing two points ahead of last year's pace projects about two points ahead of last year's final", () => {
  const rows = [
    makeRow(2025, 1, 70),
    makeRow(2025, 2, 72),
    makeRow(2025, 3, 74),
    makeRow(2025, 12, 80),
    makeRow(2026, 1, 72),
    makeRow(2026, 2, 74),
    makeRow(2026, 3, 76),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "hedis");
  assert.equal(projection?.lastObservedMonth, 3);
  assert.equal(projection?.projectedScore, 82);
});

test("flat early-year trend does not erase a positive gap versus last year's pace", () => {
  const rows = [
    makeRow(2025, 1, 46),
    makeRow(2025, 2, 48),
    makeRow(2025, 3, 50),
    makeRow(2025, 12, 60),
    makeRow(2026, 1, 52),
    makeRow(2026, 2, 52),
    makeRow(2026, 3, 52),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "hedis");
  assert.equal(projection?.lastObservedMonth, 3);
  assert.equal(projection?.projectedScore, 62);
  assert.ok(
    projection?.notes.some((note) => note.includes("prior-year close adjusted by the current-vs-prior gap"))
  );
});

test("CAHPS measure falls back to last observed when no prior year data", () => {
  const cahpsOverrides = {
    measureName: "Rating of Health Plan",
    measureDisplayName: "Rating of Health Plan",
    measureNormalized: "rating of health plan",
    measureCode: "C25",
  } as const;

  const rows = [
    makeRow(2026, 1, 70, cahpsOverrides),
    makeRow(2026, 2, 73, cahpsOverrides),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "cahps");
  assert.equal(projection?.projectedScore, 73);
  assert.ok(projection?.notes.some((n) => n.includes("CAHPS") && n.includes("no prior-year")));
});

test("no current-year data carries forward prior-year final score for HEDIS", () => {
  const rows = [
    makeRow(2025, 1, 70),
    makeRow(2025, 6, 75),
    makeRow(2025, 12, 82),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "hedis");
  assert.equal(projection?.projectedScore, 82);
  assert.equal(projection?.supportingPoints, 0);
  assert.ok(projection?.notes.some((n) => n.includes("No current-year data")));
});

test("no current-year data carries forward prior-year final score for pharmacy", () => {
  const pharmacyOverrides = {
    measureName: "Medication Adherence for Diabetes Medications",
    measureDisplayName: "Medication Adherence for Diabetes Medications",
    measureNormalized: "medication adherence for diabetes medications",
    measureCode: "D08",
    metricCategory: "Part D" as const,
  };

  const rows = [
    makeRow(2025, 1, 85, pharmacyOverrides),
    makeRow(2025, 12, 90, pharmacyOverrides),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "pharmacy");
  assert.equal(projection?.projectedScore, 90);
  assert.equal(projection?.supportingPoints, 0);
});

test("no current-year data carries forward prior-year final score for CAHPS", () => {
  const cahpsOverrides = {
    measureName: "Getting Needed Care",
    measureDisplayName: "Getting Needed Care",
    measureNormalized: "getting needed care",
    measureCode: "C22",
  } as const;

  const rows = [
    makeRow(2025, 6, 78, cahpsOverrides),
    makeRow(2025, 12, 83, cahpsOverrides),
  ];

  const projection = projectSeriesToYearEnd(rows, 2026);

  assert.ok(projection);
  assert.equal(projection?.measureType, "cahps");
  assert.equal(projection?.projectedScore, 83);
  assert.equal(projection?.supportingPoints, 0);
});

test("buildGlidepathProjections groups rows by contract and measure", () => {
  const rows = [
    makeRow(2026, 1, 70),
    makeRow(2026, 2, 72),
    {
      ...makeRow(2026, 1, 65),
      contractId: "H8888",
      measureDisplayName: "Care Coordination",
      measureName: "Care Coordination",
      measureNormalized: "care coordination",
      measureCode: "C20",
    },
  ];

  const projections = buildGlidepathProjections(rows, 2026);

  assert.equal(projections.length, 2);
  assert.deepEqual(
    projections.map((projection) => projection.contractId),
    ["H8888", "H9999"]
  );
});
