/**
 * Whether a raw score delta is an improvement for the measure.
 * Inverse measures (complaints, readmissions, etc.) treat lower scores as better.
 */
export function isScoreDeltaImprovement(
  delta: number,
  inverted: boolean,
): boolean {
  return inverted ? delta < 0 : delta > 0;
}
