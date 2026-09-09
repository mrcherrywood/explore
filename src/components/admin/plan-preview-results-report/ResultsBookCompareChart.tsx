"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

import type { ResultsBookCompareRow } from "@/lib/plan-preview/results-book-compare";

import { REPORT_CHART_WIDTH } from "../plan-preview-report/report-charts";
import { REPORT_COLORS } from "../plan-preview-report/report-shared";

const PANEL_GAP = 12;
const PANEL_WIDTH = (REPORT_CHART_WIDTH - PANEL_GAP) / 2;
const NAME_AXIS_WIDTH = 158;
const NAME_MAX_CHARS = 32;
const X_AXIS_HEIGHT = 22;
const MAX_ROW_HEIGHT = 20;
const MIN_ROW_HEIGHT = 12;
/** Bars must share the page with the scorecard and notes. */
const MAX_BARS_HEIGHT = 440;
const LABEL_OFFSET = 4;

/** Signed points label: one decimal, two when the value would print as 0.0. */
export function formatAdvantage(value: number): string {
  const oneDecimal = Math.abs(value).toFixed(1);
  const text = oneDecimal === "0.0" ? Math.abs(value).toFixed(2) : oneDecimal;
  return `${value < 0 ? "−" : ""}${text}`;
}

function axisTick(value: number): string {
  return Number.isInteger(value)
    ? `${value < 0 ? "−" : ""}${Math.abs(value)}`
    : formatAdvantage(value);
}

const PART_SUFFIX = /\s\((Part [CD])\)$/;

/** Truncated name that keeps a shared measure's `(Part C)` / `(Part D)` suffix. */
function chartName(name: string): string {
  if (name.length <= NAME_MAX_CHARS) return name;
  const suffix = name.match(PART_SUFFIX)?.[0] ?? "";
  const base = suffix ? name.slice(0, -suffix.length) : name;
  const limit = NAME_MAX_CHARS - suffix.length;
  const truncated =
    base.length > limit ? `${base.slice(0, limit - 1).trimEnd()}…` : base;
  return `${truncated}${suffix}`;
}

type TickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  textAnchor?: "start" | "middle" | "end";
};

/** Single-line category tick; Recharts' default Text wraps long names. */
function NameTick({ x = 0, y = 0, payload, textAnchor = "end" }: TickProps) {
  return (
    <text
      x={x}
      y={y}
      dy={3}
      textAnchor={textAnchor}
      fontSize={8.5}
      fontWeight={600}
      fill={REPORT_COLORS.ink}
    >
      {payload?.value ?? ""}
    </text>
  );
}

type BarLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
};

/**
 * Value label at the bar tip. Recharts reports negative bars with a negative
 * width from the baseline, so resolve the tip from min/max rather than the
 * built-in left/right positions.
 */
function barTipLabel(side: "leads" | "trails") {
  return function BarTipLabel({ x, y, width, height, value }: BarLabelProps) {
    if (typeof value !== "number") return null;
    const left = Math.min(Number(x), Number(x) + Number(width));
    const right = Math.max(Number(x), Number(x) + Number(width));
    const isLeads = side === "leads";
    return (
      <text
        x={isLeads ? right + LABEL_OFFSET : left - LABEL_OFFSET}
        y={Number(y) + Number(height) / 2}
        dy={3}
        textAnchor={isLeads ? "start" : "end"}
        fontSize={8.5}
        fontWeight={700}
        fill={REPORT_COLORS.ink}
      >
        {formatAdvantage(value)}
      </text>
    );
  };
}

function rowHeightFor(rowCount: number): number {
  if (rowCount === 0) return MAX_ROW_HEIGHT;
  return Math.max(
    MIN_ROW_HEIGHT,
    Math.min(MAX_ROW_HEIGHT, Math.floor(MAX_BARS_HEIGHT / rowCount)),
  );
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

function AdvantagePanel({
  rows,
  side,
  domainMax,
  rowHeight,
}: {
  rows: ResultsBookCompareRow[];
  side: "leads" | "trails";
  domainMax: number;
  rowHeight: number;
}) {
  const height = rows.length * rowHeight + X_AXIS_HEIGHT + 8;
  const data = rows.map((row) => ({
    name: chartName(row.measureDisplayName),
    advantage: row.advantage,
  }));
  const isLeads = side === "leads";

  return (
    <BarChart
      width={PANEL_WIDTH}
      height={height}
      data={data}
      layout="vertical"
      margin={{
        top: 4,
        right: isLeads ? 34 : 0,
        left: isLeads ? 0 : 34,
        bottom: 0,
      }}
      barCategoryGap={Math.max(2, Math.round(rowHeight * 0.3))}
    >
      <XAxis
        type="number"
        domain={isLeads ? [0, domainMax] : [-domainMax, 0]}
        height={X_AXIS_HEIGHT}
        tick={{ fontSize: 8.5, fill: REPORT_COLORS.muted }}
        tickFormatter={(value: number) => axisTick(value)}
        axisLine={{ stroke: REPORT_COLORS.grid }}
        tickLine={false}
      />
      <YAxis
        type="category"
        dataKey="name"
        orientation={isLeads ? "left" : "right"}
        width={NAME_AXIS_WIDTH}
        interval={0}
        tick={<NameTick />}
        axisLine={false}
        tickLine={false}
      />
      <Bar
        dataKey="advantage"
        fill={isLeads ? REPORT_COLORS.positive : REPORT_COLORS.negative}
        radius={isLeads ? [0, 3, 3, 0] : [3, 0, 0, 3]}
        isAnimationActive={false}
      >
        <LabelList dataKey="advantage" content={barTipLabel(side)} />
      </Bar>
    </BarChart>
  );
}

function PanelHeading({ text }: { text: string }) {
  return (
    <p
      className="fep-label"
      style={{ fontSize: 8.5, margin: "0 0 6px", textAlign: "center" }}
    >
      {text}
    </p>
  );
}

/**
 * Two mirrored horizontal bar panels: measures where the contract leads the
 * book (left, positive) and where it trails (right, negative), in points.
 */
export function ResultsBookCompareChart({
  contractId,
  leads,
  trails,
}: {
  contractId: string;
  leads: ResultsBookCompareRow[];
  trails: ResultsBookCompareRow[];
}) {
  const rowHeight = rowHeightFor(Math.max(leads.length, trails.length));
  const domainMax = niceMax(
    Math.max(
      ...leads.map((row) => Math.abs(row.advantage)),
      ...trails.map((row) => Math.abs(row.advantage)),
      0,
    ),
  );
  const measureWord = (count: number) => (count === 1 ? "measure" : "measures");

  return (
    <div style={{ display: "flex", gap: PANEL_GAP, alignItems: "flex-start" }}>
      <div style={{ width: PANEL_WIDTH }}>
        <PanelHeading text={`${contractId} leads · ${leads.length} ${measureWord(leads.length)}`} />
        {leads.length === 0 ? (
          <p className="fep-report-section-note">No measures ahead of the book.</p>
        ) : (
          <AdvantagePanel rows={leads} side="leads" domainMax={domainMax} rowHeight={rowHeight} />
        )}
      </div>
      <div style={{ width: PANEL_WIDTH }}>
        <PanelHeading text={`${contractId} trails · ${trails.length} ${measureWord(trails.length)}`} />
        {trails.length === 0 ? (
          <p className="fep-report-section-note">No measures behind the book.</p>
        ) : (
          <AdvantagePanel rows={trails} side="trails" domainMax={domainMax} rowHeight={rowHeight} />
        )}
      </div>
    </div>
  );
}
