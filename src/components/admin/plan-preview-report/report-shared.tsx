"use client";

import { useId, type ReactNode, type Ref } from "react";

export const REPORT_COLORS = {
  accent: "#1a3673",
  accentDeep: "#12264f",
  accentSoft: "#7f9dd1",
  band: "#dbe5f4",
  negative: "#c26a4c",
  positive: "#2f9e7e",
  muted: "#8a958d",
  grid: "#ece5d7",
  ink: "#20302c",
};

export function formatStars(
  value: number | null | undefined,
  digits = 1,
): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function formatScore(
  value: number | null | undefined,
  digits = 3,
): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function formatSigned(
  value: number | null | undefined,
  digits = 3,
): string {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

/** Recharts LabelList formatter that renders numeric labels with fixed digits. */
export function chartValueFormatter(
  digits: number,
  suffix = "",
  fallback = "",
) {
  return (label: ReactNode): ReactNode =>
    typeof label === "number" ? `${label.toFixed(digits)}${suffix}` : fallback;
}

/** Classic 5-point star path in a 24×24 viewBox. */
const STAR_PATH =
  "M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.5L12 17.2 6.1 20.6l1.2-6.5-4.8-4.6 6.6-.9L12 2.5z";

function ReportStar({
  fill,
  size,
}: {
  fill: "full" | "half" | "empty";
  size: number;
}) {
  const filled = REPORT_COLORS.accent;
  const empty = "#d8d2c4";
  // useId can include colons; strip them so SVG url(#…) refs survive PDF rasterization.
  const gradientId = `pp-half-${useId().replace(/:/g, "")}`;

  if (fill === "half") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="50%" stopColor={filled} />
            <stop offset="50%" stopColor={empty} />
          </linearGradient>
        </defs>
        <path d={STAR_PATH} fill={`url(#${gradientId})`} />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={STAR_PATH} fill={fill === "full" ? filled : empty} />
    </svg>
  );
}

/** Full / half / empty star row that rasterizes cleanly for PDF export. */
export function StarGlyphs({
  value,
  size = 15,
}: {
  value: number | null;
  size?: number;
}) {
  if (value === null) return null;
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  const empty = Math.max(0, 5 - full - (half ? 1 : 0));

  return (
    <span
      aria-label={`${value} stars`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        lineHeight: 1,
      }}
    >
      {Array.from({ length: full }, (_, i) => (
        <ReportStar key={`full-${i}`} fill="full" size={size} />
      ))}
      {half ? <ReportStar key="half" fill="half" size={size} /> : null}
      {Array.from({ length: empty }, (_, i) => (
        <ReportStar key={`empty-${i}`} fill="empty" size={size} />
      ))}
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
    <div
      className="fep-report-panel"
      style={{ padding: "10px 12px", flex: 1, minWidth: 0 }}
    >
      <p className="fep-label" style={{ fontSize: 8.5 }}>
        {label}
      </p>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "var(--fep-ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
      {detail ? (
        <p
          style={{
            margin: "3px 0 0",
            fontSize: 9.5,
            color: "var(--fep-faint)",
            fontWeight: 600,
          }}
        >
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
  /** Illustrative marketing sample — labeled in footer. */
  sample?: boolean;
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
  sample,
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
          {subtitle ? <p className="fep-report-subtitle">{subtitle}</p> : null}
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

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </div>

      <footer className="fep-report-footer">
        <div className="fep-report-footer-meta">
          <span>
            {contractId} · Stars {starsYear} Plan Preview 1 projection
            {sample ? " · Illustrative sample" : ""} · Generated{" "}
            {generatedLabel}
          </span>
          <span>
            Page {pageNumber} of {totalPages}
          </span>
        </div>
        <p className="fep-report-footer-confidential">
          {sample
            ? "Illustrative sample for demonstration · Press Ganey Proprietary and Confidential"
            : "Press Ganey Proprietary and Confidential"}
        </p>
      </footer>
    </div>
  );
}

/** Shared eyebrow for live vs marketing-sample report pages. */
export function reportEyebrow(starsYear: number, sample?: boolean): string {
  const base = `Plan Preview 1 · Stars ${starsYear} Projection`;
  return sample ? `Sample · ${base}` : base;
}
