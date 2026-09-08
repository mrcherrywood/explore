/**
 * Import official cut points and reward-factor thresholds from a CMS
 * Technical Notes PDF (or a pre-extracted .txt).
 *
 *   npm run import:tech-notes -- path/to/Tech_Notes.pdf --starsYear 2027
 *   npm run import:tech-notes -- path/to/Tech_Notes.txt --starsYear 2027
 *
 * Writes data/official_cut_points_<year>.csv and upserts that year into
 * data/mean_thresholds.csv and data/variance_thresholds.csv.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  formatOfficialCutPointsCsv,
  officialCutPointsPath,
} from "@/lib/plan-preview/official-cut-points";
import {
  formatThresholdCsvRows,
  parseTechNotesText,
  upsertThresholdCsv,
} from "@/lib/plan-preview/tech-notes";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

async function extractText(filePath: string): Promise<string> {
  if (/\.txt$/i.test(filePath)) {
    return readFileSync(filePath, "utf-8");
  }
  const buffer = readFileSync(filePath);
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return parsed.text;
  } catch (error) {
    throw new Error(
      `Could not parse PDF (${error instanceof Error ? error.message : "unknown error"}). Convert it to text and re-run with a .txt file, or add the pdf-parse package.`
    );
  }
}

async function main() {
  const filePath = process.argv[2];
  const starsYearValue = Number(argValue("--starsYear"));
  if (!filePath || !existsSync(filePath)) {
    throw new Error("Usage: npm run import:tech-notes -- <pdf-or-txt> --starsYear 2027");
  }
  if (!Number.isFinite(starsYearValue) || starsYearValue < 2020) {
    throw new Error("A valid --starsYear is required.");
  }
  const starsYear = Math.round(starsYearValue);

  const text = await extractText(filePath);
  const parsed = parseTechNotesText(text, starsYear);
  if (parsed.cutPoints.length === 0) {
    throw new Error("No measure cut-point tables were found in the Technical Notes text.");
  }

  const cutPath = officialCutPointsPath(starsYear);
  writeFileSync(cutPath, formatOfficialCutPointsCsv(parsed.cutPoints), "utf-8");

  const dataDir = path.join(process.cwd(), "data");
  const meanPath = path.join(dataDir, "mean_thresholds.csv");
  const variancePath = path.join(dataDir, "variance_thresholds.csv");
  if (parsed.meanThresholds.length > 0 && existsSync(meanPath)) {
    writeFileSync(
      meanPath,
      upsertThresholdCsv(
        readFileSync(meanPath, "utf-8"),
        starsYear,
        formatThresholdCsvRows(starsYear, parsed.meanThresholds)
      ),
      "utf-8"
    );
  }
  if (parsed.varianceThresholds.length > 0 && existsSync(variancePath)) {
    writeFileSync(
      variancePath,
      upsertThresholdCsv(
        readFileSync(variancePath, "utf-8"),
        starsYear,
        formatThresholdCsvRows(starsYear, parsed.varianceThresholds)
      ),
      "utf-8"
    );
  }

  console.log(
    `Imported Stars ${starsYear}: ${parsed.cutPoints.length} cut-point measures, ${parsed.meanThresholds.length} mean-threshold rows, ${parsed.varianceThresholds.length} variance-threshold rows.`
  );
  console.log(`Wrote ${path.relative(process.cwd(), cutPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
