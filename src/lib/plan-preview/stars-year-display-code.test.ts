import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMeasureName } from "@/lib/percentile-analysis/measure-matching";

import { starsYearDisplayCode } from "./clover-removal-report-data";
import { loadOfficialMeasureCodesByName } from "./official-cut-points";

test("Stars 2027 Tech Notes code Concurrent Use of Opioids and Benzodiazepines as D12", () => {
  const codes = loadOfficialMeasureCodesByName(2027);
  const cobName = normalizeMeasureName("Concurrent Use of Opioids and Benzodiazepines (COB)");
  assert.equal(codes.get(cobName), "D12");
  assert.equal(
    codes.get(normalizeMeasureName("Statin Use in Persons with Diabetes (SUPD)")),
    "D11",
  );
  assert.equal(starsYearDisplayCode(`D:${cobName}`, new Map(), codes), "D12");
  assert.equal(starsYearDisplayCode("D12", new Map([["D12", "D11"]]), codes), "D11");
});
