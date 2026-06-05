"use client";

import { useState, type SVGProps } from "react";
import { BarChart3, FileText, Calendar, Sparkle, Trophy, Users, Globe2, AlertTriangle, Scale, Shield, ActivitySquare, TrendingDown, HeartPulse, PanelLeftOpen, PanelLeftClose, Percent, ArrowUpDown, Target } from "lucide-react";
import { NavIcon } from "./NavIcon";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/auth";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function CloverIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 11.5C9.5 7.8 6.2 7.6 4.8 9.1c-1.4 1.4-.9 4 1.1 5.1 1.8 1 4.2.2 6.1-2.7Z" />
      <path d="M12 11.5c2.5-3.7 5.8-3.9 7.2-2.4 1.4 1.4.9 4-1.1 5.1-1.8 1-4.2.2-6.1-2.7Z" />
      <path d="M12 11.5C8.4 9 8.2 5.8 9.6 4.3c1.4-1.4 4-.9 5.1 1.1 1 1.8.2 4.2-2.7 6.1Z" />
      <path d="M12 11.5c3.6 2.5 3.8 5.7 2.4 7.2-1.4 1.4-4 .9-5.1-1.1-1-1.8-.2-4.2 2.7-6.1Z" />
      <path d="M12 12c1.2 2.6 3.2 4.9 6 7" />
    </svg>
  );
}

export function DataPageNav() {
  const pathname = usePathname();
  const showAiAssistant = false;
  const [expanded, setExpanded] = useState(false);
  
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen flex-col justify-between border-r border-border bg-background transition-[width] duration-200 ease-in-out xl:flex",
        expanded ? "w-52" : "w-20"
      )}
    >
      <div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-6", expanded ? "items-stretch px-3" : "items-center")}>
        <NavIcon icon={FileText} label="Summary" href="/" active={pathname === "/"} expanded={expanded} />
        <NavIcon icon={Calendar} label="Year/Year" href="/yoy" active={pathname === "/yoy"} expanded={expanded} />
        <NavIcon icon={Users} label="Peer" href="/peer" active={pathname === "/peer"} expanded={expanded} />
        <NavIcon icon={Trophy} label="Leaders" href="/leaderboard" active={pathname === "/leaderboard"} expanded={expanded} />
        <NavIcon icon={ActivitySquare} label="Consistency" href="/consistency" active={pathname === "/consistency"} expanded={expanded} />
        <NavIcon icon={Globe2} label="Maps" href="/maps/contracts" active={pathname.startsWith("/maps")} expanded={expanded} />
        <NavIcon icon={AlertTriangle} label="Ops Impact" href="/analysis/operations-impact" active={pathname.startsWith("/analysis/operations-impact")} expanded={expanded} />
        <NavIcon icon={CloverIcon} label="Clover" href="/analysis/clover-impact" active={pathname.startsWith("/analysis/clover-impact")} expanded={expanded} />
        <NavIcon icon={Percent} label="Percentiles" href="/analysis/percentile-analysis" active={pathname.startsWith("/analysis/percentile-analysis")} expanded={expanded} />
        <NavIcon icon={TrendingDown} label="QI Trends" href="/analysis/quality-improvement" active={pathname.startsWith("/analysis/quality-improvement")} expanded={expanded} />
        <NavIcon icon={ArrowUpDown} label="Band Movement" href="/analysis/band-movement" active={pathname.startsWith("/analysis/band-movement")} expanded={expanded} />
        <NavIcon icon={Target} label="R-Factor" href="/analysis/reward-factor-projection" active={pathname.startsWith("/analysis/reward-factor-projection")} expanded={expanded} />
        <NavIcon icon={HeartPulse} label="Conditions" href="/condition-groups" active={pathname === "/condition-groups"} expanded={expanded} />
        <NavIcon icon={Scale} label="UHC vs Mkt" href="/uhc-comparison" active={pathname === "/uhc-comparison"} expanded={expanded} />
        {showAiAssistant ? <NavIcon icon={Sparkle} label="AI Chat" href="/chat" active={pathname === "/chat"} expanded={expanded} /> : null}
        <NavIcon icon={BarChart3} label="Data" href="/data" active={pathname === "/data"} expanded={expanded} />
      </div>
      <div className={cn("flex shrink-0 flex-col gap-4 pb-6", expanded ? "items-stretch px-3" : "items-center")}>
        <NavIcon icon={Shield} label="Admin" href="/admin" active={pathname.startsWith("/admin")} expanded={expanded} />
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex h-10 w-10 items-center justify-center self-center rounded-xl text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {expanded ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
        </button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </aside>
  );
}
