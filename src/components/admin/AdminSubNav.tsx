"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  { href: "/admin/forecast", label: "Forecast", match: "/admin/forecast" },
  { href: "/admin/plan-preview", label: "Plan Preview 1", match: "/admin/plan-preview" },
  { href: "/admin/users", label: "Users", match: "/admin/users" },
] as const;

type AdminSubNavProps = {
  /** Use FEP theme classes on the Plan Preview screens. */
  variant?: "default" | "fep";
};

export function AdminSubNav({ variant = "default" }: AdminSubNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className={cn(
        "flex flex-wrap items-center gap-1",
        variant === "default" && "rounded-lg border border-border bg-muted/40 p-1",
        variant === "fep" && "gap-2"
      )}
    >
      {ADMIN_LINKS.map((link) => {
        const active = pathname.startsWith(link.match);
        if (variant === "fep") {
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "fep-pill",
                active && "font-semibold"
              )}
              style={
                active
                  ? {
                      background: "var(--fep-navy)",
                      color: "#fff",
                      borderColor: "var(--fep-navy)",
                    }
                  : undefined
              }
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        }

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
