import type { ForecastPopulationMode } from "./types";

function pluralContracts(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Roster copy for Forecast methodology cards. Always names forecast,
 * Plan Preview fills, and (for Full Market) the leftover last-year market so
 * the clustered N is not mistaken for "forecast contracts only."
 */
export function formatForecastPopulationBreakdown(input: {
  populationMode: ForecastPopulationMode;
  forecastCount: number;
  pp1FillCount: number;
  rawSampleSize: number;
  outliersRemoved?: number;
  baselineYear: number | null;
}): string {
  const forecast = `${input.forecastCount} forecast`;
  const planPreview = `${input.pp1FillCount} Plan Preview`;
  if (input.populationMode === "client_only") {
    return `${forecast} + ${planPreview}`;
  }

  const marketCount = Math.max(
    0,
    input.rawSampleSize - input.forecastCount - input.pp1FillCount
  );
  const marketLabel =
    input.baselineYear !== null
      ? `Stars ${input.baselineYear} market`
      : "last-year market";
  const parts = `${forecast} + ${planPreview} + ${marketCount} ${marketLabel}`;
  if ((input.outliersRemoved ?? 0) > 0) {
    return `${parts} · ${pluralContracts(input.outliersRemoved ?? 0, "outlier")} removed`;
  }
  return parts;
}
