import {
  getAvailableMeasureYears,
  getAvailableOptions,
  getMeasureByNormalizedName,
} from "@/lib/band-movement/analysis";
import { resolveMeasure } from "@/lib/cutpoint-forecast/workbook";
import { normalizeMeasureName } from "@/lib/percentile-analysis/measure-matching";

/**
 * Translate a plan preview measure's file code to its equivalent code in a
 * baseline year. CMS renumbers measure codes between years (e.g. Stars 2027
 * C30 is Timely Appeals while Stars 2026 C30 is Health Plan QI), so any
 * cross-year lookup keyed by code must go through the normalized measure
 * name. Part C/D twins sharing a name (Complaints, Members Choosing to
 * Leave, Call Center) sometimes resolve to the other part's variant, so the
 * translated code must keep the file code's C/D prefix; falls back to the
 * file code for measures new to the stars year.
 */
export function toBaselineMeasureCode(
  measureNormalized: string,
  fileCode: string,
  baselineYear: number
): string {
  const upper = fileCode.toUpperCase();
  const candidates = [measureNormalized];
  if (measureNormalized.endsWith(" partc")) {
    candidates.push(measureNormalized.replace(/ partc$/, " partd"));
  } else if (measureNormalized.endsWith(" partd")) {
    candidates.push(measureNormalized.replace(/ partd$/, " partc"));
  }
  for (const candidate of candidates) {
    const code = getMeasureByNormalizedName(candidate)?.codesByYear[baselineYear]?.toUpperCase();
    if (code && code[0] === upper[0]) return code;
  }
  return upper;
}

/**
 * CMS PP1 files sometimes put the wrong Part C/D label on a shared-name twin
 * (e.g. D01 Call Center titled "(Part C)"). The file's measure code prefix is
 * authoritative — rewrite the normalized suffix so Part C and Part D rows
 * don't collapse into one prediction bucket.
 */
export function alignNormalizedPartToCode(
  measureNormalized: string,
  measureCode: string
): string {
  const upper = measureCode.toUpperCase();
  if (upper.startsWith("D") && measureNormalized.endsWith(" partc")) {
    return `${measureNormalized.slice(0, -" partc".length)} partd`;
  }
  if (upper.startsWith("C") && measureNormalized.endsWith(" partd")) {
    return `${measureNormalized.slice(0, -" partd".length)} partc`;
  }
  return measureNormalized;
}

const STOP_TOKENS = new Set([
  "care",
  "for",
  "older",
  "adults",
  "the",
  "and",
  "of",
  "in",
  "with",
  "plan",
  "partc",
  "partd",
  "patients",
  "persons",
  "use",
  "multiple",
]);

/** Conflicting token pairs that mean the universe match is a different measure. */
const CONFLICT_PAIRS: [string, string][] = [
  ["functional", "pain"],
  ["opioid", "statin"],
  ["opiod", "statin"],
  ["benzo", "statin"],
  ["cob", "statin"],
  ["poly", "statin"],
];

function distinctiveTokens(normalized: string): string[] {
  return normalized.split(" ").filter((token) => token.length > 2 && !STOP_TOKENS.has(token));
}

/**
 * True when the resolved universe measure is the same measure the PP1 file
 * named — not a same-code replacement from a prior year (e.g. C09 Pain in
 * 2026 vs Functional Status Assessment in 2027, or D12 SUPD vs COB).
 */
export function isCompatibleUniverseMatch(fileMeasureName: string, resolvedNormalized: string): boolean {
  const fileTokens = distinctiveTokens(normalizeMeasureName(fileMeasureName));
  const resolvedTokens = distinctiveTokens(resolvedNormalized);
  if (fileTokens.length === 0) return true;

  for (const [left, right] of CONFLICT_PAIRS) {
    const fileHasLeft = fileTokens.some((token) => token.includes(left));
    const fileHasRight = fileTokens.some((token) => token.includes(right));
    const resolvedHasLeft = resolvedTokens.some((token) => token.includes(left));
    const resolvedHasRight = resolvedTokens.some((token) => token.includes(right));
    if ((fileHasLeft && resolvedHasRight) || (fileHasRight && resolvedHasLeft)) {
      return false;
    }
  }

  return fileTokens.some((token) =>
    resolvedTokens.some((candidate) => candidate.includes(token) || token.includes(candidate))
  );
}

/**
 * Resolve a PP1 measure. The file's measure name is gospel for identity —
 * universe / prior-year code fallbacks must not rename Functional Status to
 * Pain Assessment, COB to SUPD, etc. Part C/D suffix still follows the file code.
 */
export function resolveMeasureForPlanPreview(measureCode: string, measureName: string) {
  const resolved = resolveMeasure(measureName);
  const codeFallback = (() => {
    if (resolved.measureCode !== null) return null;
    const latestYear = getAvailableMeasureYears().at(-1);
    if (!latestYear) return null;
    return (
      getAvailableOptions().measures.find(
        (measure) => measure.codesByYear[latestYear]?.toUpperCase() === measureCode
      ) ?? null
    );
  })();

  const candidate = resolved.measureCode !== null
    ? resolved
    : codeFallback
      ? {
          ...resolved,
          displayName: codeFallback.displayName,
          normalizedName: codeFallback.normalizedName,
          measureCode: codeFallback.codesByYear[getAvailableMeasureYears().at(-1)!] ?? measureCode,
        }
      : resolved;

  const trustUniverse =
    candidate.measureCode !== null &&
    isCompatibleUniverseMatch(measureName, candidate.normalizedName);

  const displayName = trustUniverse ? candidate.displayName : measureName.trim();
  const normalizedName = alignNormalizedPartToCode(
    trustUniverse ? candidate.normalizedName : normalizeMeasureName(measureName),
    measureCode
  );

  return {
    displayName,
    normalizedName,
    measureCode: trustUniverse ? candidate.measureCode : measureCode,
    metricCategory: measureCode.startsWith("D")
      ? ("Part D" as const)
      : measureCode.startsWith("C")
        ? ("Part C" as const)
        : candidate.metricCategory,
  };
}
