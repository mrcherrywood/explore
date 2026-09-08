"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import { REPORT_COLORS, chartValueFormatter } from "./report-shared";

/** Chart width that fills the report page content area. */
export const REPORT_CHART_WIDTH = 686;

export type CountBar = { label: string; count: number; fill: string };

/** Vertical count bars with the value printed above each bar. */
export function CountBarChart({
  data,
  height = 185,
}: {
  data: CountBar[];
  height?: number;
}) {
  return (
    <BarChart
      width={REPORT_CHART_WIDTH}
      height={height}
      data={data}
      margin={{ top: 16, right: 16, left: -14, bottom: 0 }}
    >
      <CartesianGrid stroke={REPORT_COLORS.grid} vertical={false} />
      <XAxis
        dataKey="label"
        tick={{ fontSize: 11, fontWeight: 700, fill: REPORT_COLORS.ink }}
        axisLine={{ stroke: REPORT_COLORS.grid }}
        tickLine={false}
      />
      <YAxis
        allowDecimals={false}
        tick={{ fontSize: 10, fill: REPORT_COLORS.muted }}
        axisLine={false}
        tickLine={false}
      />
      <Bar dataKey="count" radius={[5, 5, 0, 0]} isAnimationActive={false}>
        {data.map((entry) => (
          <Cell key={entry.label} fill={entry.fill} />
        ))}
        <LabelList
          dataKey="count"
          position="top"
          style={{ fontSize: 11, fontWeight: 800, fill: REPORT_COLORS.ink }}
        />
      </Bar>
    </BarChart>
  );
}

/** Count of measures at each whole-star rating (1★ … 5★). */
export function StarDistributionChart({ stars }: { stars: (number | null)[] }) {
  const data: CountBar[] = [1, 2, 3, 4, 5].map((star, index) => ({
    label: `${star}★`,
    count: stars.filter((value) => value === star).length,
    fill:
      index >= 3
        ? REPORT_COLORS.accent
        : index === 2
          ? REPORT_COLORS.accentSoft
          : REPORT_COLORS.negative,
  }));
  return <CountBarChart data={data} />;
}

export type DomainMeansSeries = {
  dataKey: string;
  name: string;
  fill: string;
  labelFill?: string;
  labelWeight?: number;
};

/** Truncate long CMS domain names for the horizontal-bar category axis. */
export function domainChartName(domain: string): string {
  return domain.length > 34 ? `${domain.slice(0, 33)}…` : domain;
}

/** Grouped horizontal bars of weighted mean stars (0–5) per domain. */
export function DomainMeansChart({
  data,
  series,
}: {
  data: Record<string, string | number | null>[];
  series: DomainMeansSeries[];
}) {
  const height = Math.max(200, 26 + data.length * (series.length * 15 + 13));
  return (
    <BarChart
      width={REPORT_CHART_WIDTH}
      height={height}
      data={data}
      layout="vertical"
      margin={{ top: 0, right: 48, left: 4, bottom: 0 }}
      barCategoryGap={8}
    >
      <CartesianGrid stroke={REPORT_COLORS.grid} horizontal={false} />
      <XAxis
        type="number"
        domain={[0, 5]}
        ticks={[1, 2, 3, 4, 5]}
        tick={{ fontSize: 10, fill: REPORT_COLORS.muted }}
        axisLine={{ stroke: REPORT_COLORS.grid }}
        tickLine={false}
      />
      <YAxis
        type="category"
        dataKey="name"
        width={96}
        tick={{ fontSize: 10, fontWeight: 600, fill: REPORT_COLORS.ink }}
        axisLine={false}
        tickLine={false}
      />
      <Legend
        verticalAlign="top"
        align="right"
        height={26}
        iconSize={9}
        wrapperStyle={{ fontSize: 9.5, fontWeight: 700 }}
        formatter={(value) => (
          <span style={{ color: REPORT_COLORS.ink, fontWeight: 700 }}>
            {value}
          </span>
        )}
      />
      {series.map((entry) => (
        <Bar
          key={entry.dataKey}
          dataKey={entry.dataKey}
          name={entry.name}
          fill={entry.fill}
          radius={[0, 4, 4, 0]}
          barSize={11}
          isAnimationActive={false}
        >
          <LabelList
            dataKey={entry.dataKey}
            position="right"
            formatter={chartValueFormatter(2)}
            style={{
              fontSize: 8.5,
              fontWeight: entry.labelWeight ?? 700,
              fill: entry.labelFill ?? REPORT_COLORS.ink,
            }}
          />
        </Bar>
      ))}
    </BarChart>
  );
}

export type RatingTrendPoint = {
  year: string;
  overall: number | null;
  partC: number | null;
  partD: number | null;
  /** Accent-filled bar (projected or official current-year point). */
  highlight: boolean;
};

/** Overall rating bars by star year with Part C / Part D summary lines. */
export function RatingTrendChart({ data }: { data: RatingTrendPoint[] }) {
  return (
    <ComposedChart
      width={REPORT_CHART_WIDTH}
      height={155}
      data={data}
      margin={{ top: 14, right: 14, left: -18, bottom: 0 }}
    >
      <CartesianGrid stroke={REPORT_COLORS.grid} vertical={false} />
      <XAxis
        dataKey="year"
        tick={{ fontSize: 10, fontWeight: 700, fill: REPORT_COLORS.ink }}
        axisLine={{ stroke: REPORT_COLORS.grid }}
        tickLine={false}
      />
      <YAxis
        domain={[0, 5]}
        ticks={[1, 2, 3, 4, 5]}
        tick={{ fontSize: 9.5, fill: REPORT_COLORS.muted }}
        axisLine={false}
        tickLine={false}
      />
      <Legend
        verticalAlign="top"
        align="right"
        height={20}
        iconSize={8}
        wrapperStyle={{ fontSize: 9.5, fontWeight: 700 }}
      />
      <Bar
        dataKey="overall"
        name="Overall"
        radius={[4, 4, 0, 0]}
        barSize={34}
        isAnimationActive={false}
      >
        {data.map((entry) => (
          <Cell
            key={entry.year}
            fill={entry.highlight ? REPORT_COLORS.accent : REPORT_COLORS.band}
          />
        ))}
        <LabelList
          dataKey="overall"
          position="top"
          formatter={chartValueFormatter(1)}
          style={{
            fontSize: 10,
            fontWeight: 800,
            fill: REPORT_COLORS.ink,
            paintOrder: "stroke",
            stroke: "#fdfbf6",
            strokeWidth: 3,
          }}
        />
      </Bar>
      <Line
        dataKey="partC"
        name="Part C summary"
        stroke={REPORT_COLORS.accentSoft}
        strokeWidth={2}
        strokeOpacity={0.35}
        dot={{ r: 2.5, fill: REPORT_COLORS.accentSoft, fillOpacity: 0.45 }}
        connectNulls
        isAnimationActive={false}
      />
      <Line
        dataKey="partD"
        name="Part D summary"
        stroke={REPORT_COLORS.negative}
        strokeWidth={2}
        strokeOpacity={0.35}
        dot={{ r: 2.5, fill: REPORT_COLORS.negative, fillOpacity: 0.45 }}
        connectNulls
        isAnimationActive={false}
      />
    </ComposedChart>
  );
}
