"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { href: "/admin/forecast", label: "Forecast", match: "/admin/forecast" },
  {
    href: "/admin/plan-preview",
    label: "Plan Preview 1",
    match: "/admin/plan-preview",
  },
  { href: "/admin/users", label: "Users", match: "/admin/users" },
] as const;

export function AdminSubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="flex flex-wrap items-center gap-2"
    >
      {ADMIN_LINKS.map((link) => {
        const active = pathname.startsWith(link.match);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn("fep-pill", active && "font-semibold")}
            style={
              active
                ? {
                    background: "var(--fep-accent)",
                    color: "#fff",
                  }
                : undefined
            }
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
