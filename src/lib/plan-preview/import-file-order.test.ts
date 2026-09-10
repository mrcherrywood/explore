import assert from "node:assert/strict";
import test from "node:test";

import { sortPlanPreviewImportFiles } from "./import-file-order";

test("folder imports apply summaries before improve so QI scores can overlay", () => {
  const sorted = sortPlanPreviewImportFiles([
    { name: "SR_2027_improve_d.xlsx" },
    { name: "SR_2027_improve_c.xlsx" },
    { name: "SR_2027_summary_rating.xlsx" },
    { name: "SR_2027_measure_star.xlsx" },
    { name: "SR_2027_measure_data.xlsx" },
  ]);
  assert.deepEqual(
    sorted.map((file) => file.name),
    [
      "SR_2027_measure_data.xlsx",
      "SR_2027_measure_star.xlsx",
      "SR_2027_summary_rating.xlsx",
      "SR_2027_improve_c.xlsx",
      "SR_2027_improve_d.xlsx",
    ],
  );
});
