export type ChartSeries = { key: string; name?: string };

export type ChartDatum = Record<string, string | number | null> & { __color?: string };

export type ChartSpec = {
  title?: string;
  type: "line" | "bar" | "area" | "pie";
  xKey: string;
  xLabelKey?: string;
  xLabelMaxLines?: number;
  xLabelLineLength?: number;
  xLabelAngle?: number;
  xLabelPadding?: number;
  series: ChartSeries[];
  data: ChartDatum[];
  highlightKey?: string;
  highlightValue?: string | number;
  highlightLegendSelected?: string;
  highlightLegendPeers?: string;
  yAxisDomain?: [number, number];
  yAxisTicks?: number[];
  showLabels?: boolean;
  labelKey?: string;
};
