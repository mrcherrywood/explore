"use client";

import type { ReactNode, Ref } from "react";

export const REPORT_COLORS = {
  accent: "#1a3673",
  accentDeep: "#12264f",
  accentSoft: "#7f9dd1",
  band: "#dbe5f4",
  negative: "#c26a4c",
  muted: "#8a958d",
  grid: "#ece5d7",
  ink: "#20302c",
};

export function formatStars(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function formatScore(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function formatSigned(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/** Recharts LabelList formatter that renders numeric labels with fixed digits. */
export function chartValueFormatter(digits: number, suffix = "", fallback = "") {
  return (label: ReactNode): ReactNode =>
    typeof label === "number" ? `${label.toFixed(digits)}${suffix}` : fallback;
}

/** Filled/empty star glyph row, e.g. ★★★★☆ for 4. */
export function StarGlyphs({ value, size = 15 }: { value: number | null; size?: number }) {
  if (value === null) return null;
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span
      aria-label={`${value} stars`}
      style={{ fontSize: size, letterSpacing: 2, color: REPORT_COLORS.accent, lineHeight: 1 }}
    >
      {"★".repeat(full)}
      {half ? "⯨" : ""}
      <span style={{ color: "#d8d2c4" }}>{"★".repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}</span>
    </span>
  );
}

export function ReportStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="fep-report-panel" style={{ padding: "12px 14px", flex: 1, minWidth: 0 }}>
      <p className="fep-label" style={{ fontSize: 8.5 }}>
        {label}
      </p>
      <p
        style={{
          margin: "5px 0 0",
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "var(--fep-ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
      {detail ? (
        <p style={{ margin: "3px 0 0", fontSize: 9.5, color: "var(--fep-faint)", fontWeight: 600 }}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export function ReportSection({
  title,
  note,
  children,
  style,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section style={{ marginTop: 20, ...style }}>
      <h2 className="fep-report-h2">{title}</h2>
      {note ? <p className="fep-report-section-note">{note}</p> : null}
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

export type ReportPageFrameProps = {
  pageRef?: Ref<HTMLDivElement>;
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  pageNumber: number;
  totalPages: number;
  contractId: string;
  starsYear: number;
  generatedAt: string;
  children: ReactNode;
};

export function ReportPageFrame({
  pageRef,
  eyebrow,
  title,
  subtitle,
  pageNumber,
  totalPages,
  contractId,
  starsYear,
  generatedAt,
  children,
}: ReportPageFrameProps) {
  const generatedLabel = new Date(generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <div ref={pageRef} className="fep-report-page" data-report-page>
      <header className="fep-report-header">
        <div className="fep-report-header-copy">
          <p className="fep-report-eyebrow">{eyebrow}</p>
          <h1 className="fep-report-title">{title}</h1>
          {subtitle ? (
            <p className="fep-report-subtitle">{subtitle}</p>
          ) : null}
        </div>
        {/* Raster asset preferred for reliable PDF capture with dom-to-image. */}
        <img
          className="fep-report-logo"
          src="/brand/press-ganey-logo.png"
          alt="Press Ganey"
          width={156}
          height={24}
        />
      </header>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>

      <footer className="fep-report-footer">
        <span>
          {contractId} · Stars {starsYear} Plan Preview 1 projection · Generated {generatedLabel}
        </span>
        <span>
          Page {pageNumber} of {totalPages}
        </span>
      </footer>
    </div>
  );
}
