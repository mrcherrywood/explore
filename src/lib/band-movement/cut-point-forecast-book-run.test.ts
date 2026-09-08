import assert from "node:assert/strict";
import test from "node:test";

import {
  pickDefaultForecastYear,
  pickForecastBookRun,
} from "@/lib/cutpoint-forecast/book-run";

function run(
  id: string,
  status: "draft" | "approved",
  createdAt: string,
  projectionCount: number
) {
  return { id, status, createdAt, projectionCount };
}

test("pickForecastBookRun returns null when there is no existing run", () => {
  assert.equal(pickForecastBookRun([]), null);
});

test("pickForecastBookRun prefers the largest approved run over a later add-on", () => {
  const original = run("book", "approved", "2026-08-01T00:00:00.000Z", 2618);
  const aetna = run("aetna", "approved", "2026-09-08T12:00:00.000Z", 1045);

  assert.equal(pickForecastBookRun([aetna, original])?.id, "book");
});

test("pickForecastBookRun prefers an approved run over an older, larger draft", () => {
  const oldDraft = run("old", "draft", "2026-06-01T00:00:00.000Z", 4290);
  const approved = run("book", "approved", "2026-08-01T00:00:00.000Z", 2618);

  assert.equal(pickForecastBookRun([oldDraft, approved])?.id, "book");
});

test("pickForecastBookRun uses the oldest run when none are approved", () => {
  const original = run("book", "draft", "2026-08-01T00:00:00.000Z", 2618);
  const aetna = run("aetna", "draft", "2026-09-08T12:00:00.000Z", 1045);

  assert.equal(pickForecastBookRun([aetna, original])?.id, "book");
});

test("pickForecastBookRun breaks approved ties by the earlier run", () => {
  const older = run("older", "approved", "2026-07-01T00:00:00.000Z", 1000);
  const newer = run("newer", "approved", "2026-08-01T00:00:00.000Z", 1000);

  assert.equal(pickForecastBookRun([newer, older])?.id, "older");
});

test("pickDefaultForecastYear prefers the latest approved Stars year over a newer draft year", () => {
  assert.equal(
    pickDefaultForecastYear([
      { forecastYear: 2028, status: "draft" },
      { forecastYear: 2027, status: "approved" },
    ]),
    2027
  );
  assert.equal(
    pickDefaultForecastYear([{ forecastYear: 2028, status: "draft" }]),
    2028
  );
  assert.equal(pickDefaultForecastYear([]), null);
});
