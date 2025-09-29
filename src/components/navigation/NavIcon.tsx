"use client";

import Link from "next/link";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

type NavIconProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  active?: boolean;
};

export function NavIcon({ icon: Icon, label, href, active = false }: NavIconProps) {
  const className = cn(
    "relative mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-[#050505] text-slate-500 transition focus:outline-none focus:ring-2 focus:ring-sky-400/40",
    active ? "text-slate-200" : "hover:text-slate-200"
  );

  const indicator = active ? (
    <span className="absolute inset-y-2 left-1 w-[3px] rounded-full bg-sky-500/70" aria-hidden />
  ) : null;

  if (href) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {indicator}

        <Icon className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} className={className}>
      {indicator}
      <Icon className="h-5 w-5" />
    </button>
  );
}
