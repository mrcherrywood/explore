"use client";

import Link from "next/link";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

type NavIconProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  active?: boolean;
  expanded?: boolean;
};

export function NavIcon({
  icon: Icon,
  label,
  href,
  active = false,
  expanded = false,
}: NavIconProps) {
  const className = cn(
    "relative flex items-center rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-[var(--fep-accent)]/30",
    expanded ? "h-10 w-full gap-3 px-3" : "size-10 justify-center",
    active
      ? "border-[color-mix(in_srgb,var(--fep-accent)_22%,transparent)] bg-[var(--fep-band-bg)] text-[var(--fep-accent)]"
      : "border-[var(--fep-border)] bg-[#fffdf8]/70 text-[var(--fep-muted)] hover:bg-[var(--fep-row-hover)] hover:text-[var(--fep-ink)]",
  );

  const indicator = active ? (
    <span
      className="absolute inset-y-2 left-1 w-[3px] rounded-full bg-[var(--fep-accent)]"
      aria-hidden
    />
  ) : null;

  const content = (
    <>
      {indicator}
      <Icon className="size-5 shrink-0" />
      {expanded && (
        <span className="truncate text-sm font-semibold">{label}</span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} className={className}>
      {content}
    </button>
  );
}
