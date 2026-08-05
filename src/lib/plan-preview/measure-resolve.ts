import {
  getAvailableMeasureYears,
  getAvailableOptions,
} from "@/lib/band-movement/analysis";
import { resolveMeasure } from "@/lib/cutpoint-forecast/workbook";

/**
 * Plan preview files sometimes use shorthand measure names (e.g. "Taking
 * Diabetes Medications" for "Medication Adherence for Diabetes Medications").
 * When name matching fails, fall back to the file's own measure code matched
 * against the latest published year's codes.
 */
export function resolveMeasureForPlanPreview(measureCode: string, measureName: string) {
  const resolved = resolveMeasure(measureName);
  if (resolved.measureCode !== null) return resolved;

  const latestYear = getAvailableMeasureYears().at(-1);
  if (latestYear) {
    const byCode = getAvailableOptions().measures.find(
      (measure) => measure.codesByYear[latestYear]?.toUpperCase() === measureCode
    );
    if (byCode) {
      return {
        ...resolved,
        displayName: byCode.displayName,
        normalizedName: byCode.normalizedName,
      };
    }
  }
  return resolved;
}
