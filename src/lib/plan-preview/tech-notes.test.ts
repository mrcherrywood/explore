import assert from "node:assert/strict";
import test from "node:test";

import { matchCutPointToMeasureName } from "@/lib/percentile-analysis/measure-matching";

import { disambiguateTwinMeasureNames } from "./official-cut-points";
import {
  bandScoreWithOfficialCut,
  parseTechNotesText,
  upsertThresholdCsv,
  validateOfficialStarsAgainstCuts,
} from "./tech-notes";

// Mirrors pdf-parse output of the CMS Technical Notes: table-of-contents
// entries, star header on its own line, page footers inside blocks, wrapped
// titles, MA-PD/PDP rows, negative QI cuts, and split ordinal suffixes.
const FIXTURE = `
Medicare
2026 Part C & D
Star Ratings
Technical Notes

Table 8: Performance Summary Thresholds ........................................ 16
Table 9: Variance Thresholds ................................................... 17
Measure: C01 - Breast Cancer Screening ......................................... 31
Measure: C28 - Complaints about the Health Plan ................................ 78

Table 8: Performance Summary Thresholds
Improvement
New
Measures Percentile Part C Rating Part D Rating (MA-PD) Part D Rating (PDP) Overall Rating
With With 65
th
 3.695652 3.740741 3.385522 3.649351
With With 85
th
 4.000000 4.000000 3.913300 3.932432
Without Without 65th 3.736842 3.769231 3.318182 3.700000

Table 9: Variance Thresholds
Improvement
New
Measures Percentile Part C Rating Part D Rating (MA-PD) Part D Rating (PDP) Overall Rating
With With 30
th
 0.918435 0.754209 0.869005 0.914850
With With 70th 1.285170 1.268986 1.747939 1.263462

Cut Points: Table containing the cut points used in the measure.

Measure: C01 - Breast Cancer Screening
Title Description
General Trend: Higher is better
Weighting Category: Process Measure
Weighting Value: 1
Cut Points:
1 Star 2 Stars 3 Stars 4 Stars 5 Stars

Less than
58 %
Greater than or equal to
58 % to less than 71 %
Greater than or equal to
71 % to less than 76 %
Greater than or equal to
76 % to less than 84 %
Greater than or
equal to 84 %

DRAFT DRAFT
DRAFT-  (Last Updated 09/01/2026)   DRAFT - Page 32

Measure: C20 - Follow-up after Emergency Department Visit for People with Multiple High-Risk Chronic
Conditions
Title Description
General Trend: Higher is better
Weighting Category: Process Measure
Weighting Value: 1
Cut Points:
1 Star 2 Stars 3 Stars 4 Stars 5 Stars

Less than
55%
Greater than or equal to
55% to less than 64%
Greater than or equal to
64% to less than 72%
Greater than or equal to
72% to less than 83%
Greater than or
equal to 83%
Measure: C28 - Complaints about the Health Plan
General Trend: Lower is better
Weighting Value: 2
Cut Points:  1 Star  2 Stars  3 Stars  4 Stars  5 Stars
Greater
than 1.34
Greater than 0.71 to less
than or equal to 1.34
Greater than 0.32 to less
than or equal to 0.71
Greater than 0.11 to less
than or equal to 0.32
Less than or
equal to 0.11
Measure: C29 - Health Plan Quality Improvement
General Trend: Higher is better
Weighting Category: Improvement Measure
Weighting Value: 5
Cut Points:
1 Star 2 Stars 3 Stars 4 Stars 5 Stars

Less than -
0.184029
Greater than or equal
to -0.184029 to less
than 0
Greater than or equal
to 0 to less than
0.161052
Greater than or equal to
0.161052 to less than
0.336992
Greater than or
equal to
0.336992
Measure: D01 -  Call Center – Foreign Language Interpreter and TTY Availability
General Trend: Higher is better
Weighting Category: Measures Capturing Access
Weighting Value: 2
Cut Points:
Type 1 Star 2 Stars 3 Stars 4 Stars 5 Stars

MA-PD
Less than
50%
Greater than or equal to
50% to less than 84%
Greater than or equal
to 84% to less than
97%
Greater than or equal
to 97% to less than
100% 100%
PDP
Less than
80%
Greater than or equal to
80% to less than 95%
Greater than or equal
to 95% to less than
98%
Greater than or equal
to 98% to less than
100% 100%
`;

test("parseTechNotesText extracts cut points and RF tables", () => {
  const parsed = parseTechNotesText(FIXTURE, 2026);
  assert.equal(parsed.starsYear, 2026);
  assert.equal(parsed.meanThresholds.length, 3);
  assert.equal(parsed.meanThresholds[0]?.percentile, 65);
  assert.equal(parsed.meanThresholds[0]?.overall, 3.649351);
  assert.equal(parsed.varianceThresholds.length, 2);
  assert.equal(parsed.varianceThresholds[0]?.percentile, 30);

  // Table-of-contents headings and the glossary "Cut Points:" entry are skipped.
  assert.deepEqual(
    parsed.cutPoints.map((row) => row.measureCode),
    ["C01", "C20", "C28", "C29", "D01"]
  );

  const breast = parsed.cutPoints.find((row) => row.measureCode === "C01");
  assert.ok(breast);
  assert.equal(breast.inverted, false);
  assert.equal(breast.twoStar, 58);
  assert.equal(breast.fiveStar, 84);
  assert.equal(breast.weight, 1);

  const followUp = parsed.cutPoints.find((row) => row.measureCode === "C20");
  assert.ok(followUp);
  assert.match(followUp.measureName, /High-Risk Chronic Conditions$/);
  assert.equal(followUp.twoStar, 55);
  assert.equal(followUp.fiveStar, 83);

  const complaints = parsed.cutPoints.find((row) => row.measureCode === "C28");
  assert.ok(complaints);
  assert.equal(complaints.inverted, true);
  assert.equal(complaints.fiveStar, 0.11);
  assert.equal(complaints.twoStar, 1.34);

  const qi = parsed.cutPoints.find((row) => row.measureCode === "C29");
  assert.ok(qi);
  assert.equal(qi.inverted, false);
  assert.equal(qi.twoStar, -0.184029);
  assert.equal(qi.threeStar, 0);
  assert.equal(qi.fiveStar, 0.336992);
  assert.equal(qi.weight, 5);

  // Part D tables carry MA-PD and PDP rows; only the MA-PD row is kept.
  const callCenter = parsed.cutPoints.find((row) => row.measureCode === "D01");
  assert.ok(callCenter);
  assert.equal(callCenter.twoStar, 50);
  assert.equal(callCenter.threeStar, 84);
  assert.equal(callCenter.fourStar, 97);
  assert.equal(callCenter.fiveStar, 100);
});

test("disambiguateTwinMeasureNames suffixes shared-name Part C/D rows for matching", () => {
  const base = {
    year: 2027,
    inverted: false,
    weightCategory: null,
    weight: 2,
  };
  const rows = disambiguateTwinMeasureNames([
    { ...base, measureCode: "C01", measureName: "Breast Cancer Screening", twoStar: 63, threeStar: 70, fourStar: 77, fiveStar: 83 },
    { ...base, measureCode: "C32", measureName: "Call Center – Foreign Language Interpreter and TTY Availability", twoStar: 56, threeStar: 79, fourStar: 97, fiveStar: 100 },
    { ...base, measureCode: "D01", measureName: "Call Center – Foreign Language Interpreter and TTY Availability", twoStar: 50, threeStar: 84, fourStar: 97, fiveStar: 100 },
  ]);
  assert.equal(rows[0]?.measureName, "Breast Cancer Screening");
  assert.match(rows[1]?.measureName ?? "", /\(Part C\)$/);
  assert.match(rows[2]?.measureName ?? "", /\(Part D\)$/);

  const cutPoints = rows.map((row) => ({
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
  const partD = matchCutPointToMeasureName(
    "D01: Call Center - Foreign Language Interpreter and TTY Availability",
    "D",
    cutPoints,
    "call center foreign language interpreter and tty availability partd"
  );
  assert.equal(partD?.thresholds.twoStar, 50);
  const partC = matchCutPointToMeasureName(
    "C32: Call Center - Foreign Language Interpreter and TTY Availability",
    "C",
    cutPoints,
    "call center foreign language interpreter and tty availability partc"
  );
  assert.equal(partC?.thresholds.twoStar, 56);
});

test("bandScoreWithOfficialCut matches CMS higher and inverted rules", () => {
  const higher = {
    year: 2026,
    measureCode: "C01",
    measureName: "Breast Cancer Screening",
    inverted: false,
    weightCategory: "Process Measure",
    weight: 1,
    twoStar: 58,
    threeStar: 71,
    fourStar: 76,
    fiveStar: 84,
  };
  assert.equal(bandScoreWithOfficialCut(57, higher), 1);
  assert.equal(bandScoreWithOfficialCut(76, higher), 4);
  assert.equal(bandScoreWithOfficialCut(84, higher), 5);

  const inverted = {
    ...higher,
    measureCode: "C28",
    inverted: true,
    twoStar: 1.34,
    threeStar: 0.71,
    fourStar: 0.32,
    fiveStar: 0.11,
  };
  assert.equal(bandScoreWithOfficialCut(0.11, inverted), 5);
  assert.equal(bandScoreWithOfficialCut(0.71, inverted), 3);
  assert.equal(bandScoreWithOfficialCut(1.35, inverted), 1);
});

test("validateOfficialStarsAgainstCuts counts mismatches", () => {
  const cuts = [
    {
      year: 2026,
      measureCode: "C01",
      measureName: "Breast Cancer Screening",
      inverted: false,
      weightCategory: null,
      weight: 1,
      twoStar: 58,
      threeStar: 71,
      fourStar: 76,
      fiveStar: 84,
    },
  ];
  const result = validateOfficialStarsAgainstCuts(
    [{ measureCode: "C01", score: 84 }],
    [{ measureCode: "C01", star: 4 }],
    cuts
  );
  assert.equal(result.mismatchCount, 1);
  assert.equal(result.rows[0]?.predictedStar, 5);
});

test("upsertThresholdCsv replaces an existing year", () => {
  const existing = "Year,Improvement,New Measures,Percentile,Part C Rating,Part D Rating (MA-PD),Part D Rating (PDP),Overall Rating\n2026,With,With,65,1,1,1,1\n";
  const next = upsertThresholdCsv(existing, 2026, [
    "2026,With,With,65,3.695652,3.740741,3.385522,3.649351",
  ]);
  assert.match(next, /3\.649351/);
  assert.equal(next.split("\n").filter((line) => line.startsWith("2026,")).length, 1);
});
