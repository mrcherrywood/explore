import { NextResponse } from "next/server";
import {
  getOfficialForScenario,
  getOfficialThresholdYears,
} from "@/lib/reward-factor/official-threshold-data";

type ThresholdKey = "mean65th" | "mean85th" | "variance30th" | "variance70th";

type ThresholdRow = {
  year: number;
  percentile: number;
  metric: "mean" | "variance";
  withQI: number;
  withoutQI: number;
  diff: number;
};

type YoYDelta = {
  fromYear: number;
  toYear: number;
  withQIDelta: number;
  withoutQIDelta: number;
  sameDirection: boolean;
};

type ThresholdSummary = {
  key: ThresholdKey;
  label: string;
  rows: ThresholdRow[];
  yoyDeltas: YoYDelta[];
  avgOffset: number;
  directionalAlignment: string;
};

export async function GET() {
  try {
    const years = getOfficialThresholdYears();
    const ratingType = "overall_mapd" as const;

    const thresholdDefs: { key: ThresholdKey; label: string; metric: "mean" | "variance"; percentile: number }[] = [
      { key: "mean65th", label: "Mean 65th Percentile", metric: "mean", percentile: 65 },
      { key: "mean85th", label: "Mean 85th Percentile", metric: "mean", percentile: 85 },
      { key: "variance30th", label: "Variance 30th Percentile", metric: "variance", percentile: 30 },
      { key: "variance70th", label: "Variance 70th Percentile", metric: "variance", percentile: 70 },
    ];

    const summaries: ThresholdSummary[] = thresholdDefs.map(({ key, label, metric, percentile }) => {
      const rows: ThresholdRow[] = [];

      for (const year of years) {
        const withQIThresholds = getOfficialForScenario(year, ratingType, true);
        const withoutQIThresholds = getOfficialForScenario(year, ratingType, false);
        if (!withQIThresholds || !withoutQIThresholds) continue;

        const withQI = withQIThresholds[key];
        const withoutQI = withoutQIThresholds[key];
        rows.push({ year, percentile, metric, withQI, withoutQI, diff: withoutQI - withQI });
      }

      const yoyDeltas: YoYDelta[] = [];
      for (let i = 1; i < rows.length; i++) {
        const withQIDelta = rows[i].withQI - rows[i - 1].withQI;
        const withoutQIDelta = rows[i].withoutQI - rows[i - 1].withoutQI;
        const sameDirection =
          (withQIDelta > 0 && withoutQIDelta > 0) ||
          (withQIDelta < 0 && withoutQIDelta < 0) ||
          (withQIDelta === 0 && withoutQIDelta === 0);
        yoyDeltas.push({
          fromYear: rows[i - 1].year,
          toYear: rows[i].year,
          withQIDelta,
          withoutQIDelta,
          sameDirection,
        });
      }

      const avgOffset = rows.length > 0
        ? rows.reduce((sum, r) => sum + r.diff, 0) / rows.length
        : 0;

      const aligned = yoyDeltas.filter((d) => d.sameDirection).length;
      const directionalAlignment = yoyDeltas.length > 0
        ? `${aligned}/${yoyDeltas.length}`
        : "N/A";

      return { key, label, rows, yoyDeltas, avgOffset, directionalAlignment };
    });

    return NextResponse.json({ years, summaries });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "Failed to compute QI correlation", details: message }, { status: 500 });
  }
}
