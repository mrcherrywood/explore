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

export function NavIcon({ icon: Icon, label, href, active = false, expanded = false }: NavIconProps) {
  const className = cn(
    "relative flex items-center rounded-xl border border-border bg-background text-muted-foreground transition focus:outline-none focus:ring-2 focus:ring-primary/40",
    expanded ? "h-10 w-full gap-3 px-3" : "h-10 w-10 justify-center",
    active ? "text-foreground" : "hover:text-foreground"
  );

  const indicator = active ? (
    <span className="absolute inset-y-2 left-1 w-[3px] rounded-full bg-primary/70" aria-hidden />
  ) : null;

  const content = (
    <>
      {indicator}
      <Icon className="h-5 w-5 shrink-0" />
      {expanded && (
        <span className="truncate text-sm font-medium">{label}</span>
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
