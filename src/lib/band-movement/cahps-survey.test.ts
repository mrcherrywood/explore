import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateCahpsSurvey,
  cahpsReportingYearToForecastYear,
  isCahpsSurveyHeaderRow,
  type CahpsSurveyRawRow,
} from "@/lib/cutpoint-forecast/cahps-survey";

function row(overrides: Partial<CahpsSurveyRawRow>): CahpsSurveyRawRow {
  return {
    variableName: "GNC",
    contractId: "H1234",
    surveyWeek: 12,
    mode: "Paper",
    cumCount: 100,
    sms: 84,
    reportingYear: 2026,
    ...overrides,
  };
}

test("isCahpsSurveyHeaderRow detects the survey header", () => {
  assert.equal(
    isCahpsSurveyHeaderRow([
      "VariableName",
      "Label",
      "SurveyWeek",
      "ContractNumber",
      "SurveyModeLabel",
      "period_count",
      "cum_count",
      "cumulative_mean",
      "SMS",
      "ReportingYear",
    ]),
    true
  );
  assert.equal(isCahpsSurveyHeaderRow(["hl code", "contract", "measure", "year", "month"]), false);
});

test("aggregateCahpsSurvey combines modes respondent-weighted using the latest week per mode", () => {
  const rows: CahpsSurveyRawRow[] = [
    row({ mode: "Paper", surveyWeek: 10, cumCount: 50, sms: 80 }),
    row({ mode: "Paper", surveyWeek: 12, cumCount: 100, sms: 84 }), // latest Paper wins
    row({ mode: "Internet", surveyWeek: 11, cumCount: 20, sms: 90 }),
  ];

  const result = aggregateCahpsSurvey(rows);
  assert.equal(result.length, 1);
  const gnc = result[0];
  assert.equal(gnc.measureNormalized, "getting needed care");
  // (84*100 + 90*20) / 120 = 85
  assert.equal(gnc.rate, 85);
  assert.equal(gnc.respondentCount, 120);
  assert.equal(gnc.latestSurveyWeek, 12);
  assert.equal(gnc.modeCount, 2);
});

test("aggregateCahpsSurvey maps single-question rating/flu measures and ignores unmapped questions", () => {
  const rows: CahpsSurveyRawRow[] = [
    row({ variableName: "MA_38", mode: "Paper", cumCount: 30, sms: 70 }),
    row({ variableName: "MA_52", mode: "Phone", cumCount: 10, sms: 65 }),
    row({ variableName: "MA_10", mode: "Paper", cumCount: 99, sms: 50 }), // unmapped question → ignored
  ];

  const result = aggregateCahpsSurvey(rows);
  const normalized = result.map((r) => r.measureNormalized).sort();
  assert.deepEqual(normalized, ["annual flu vaccine", "rating of health plan"]);
});

test("aggregateCahpsSurvey skips null SMS and zero-count rows", () => {
  const rows: CahpsSurveyRawRow[] = [
    row({ mode: "Phone", surveyWeek: 17, cumCount: 0, sms: null }),
    row({ mode: "Phone", surveyWeek: 18, cumCount: null, sms: 70 }),
    row({ mode: "Paper", surveyWeek: 15, cumCount: 40, sms: 88 }),
  ];

  const result = aggregateCahpsSurvey(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].rate, 88);
  assert.equal(result[0].respondentCount, 40);
  assert.equal(result[0].modeCount, 1);
});

test("cahpsReportingYearToForecastYear adds one to the reporting year to get the stars year", () => {
  // reporting 2026 = stars 2027
  assert.equal(cahpsReportingYearToForecastYear(2026), 2027);
  assert.equal(cahpsReportingYearToForecastYear(2027), 2028);
});

test("aggregateCahpsSurvey confidence rises as the latest survey week approaches week 22", () => {
  const early = aggregateCahpsSurvey([row({ surveyWeek: 10, cumCount: 30, sms: 80 })])[0];
  const late = aggregateCahpsSurvey([row({ surveyWeek: 22, cumCount: 30, sms: 80 })])[0];
  assert.equal(early.confidence < late.confidence, true);
  assert.equal(late.confidenceLabel, "high");
});
