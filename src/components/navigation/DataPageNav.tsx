"use client";

import { useState } from "react";
import { BarChart3, FileText, Calendar, Sparkle, Trophy, Users, Globe2, AlertTriangle, Scale, Shield, ActivitySquare, TrendingDown, HeartPulse, PanelLeftOpen, PanelLeftClose, Percent, ArrowUpDown } from "lucide-react";
import { NavIcon } from "./NavIcon";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/auth";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
      <div className={cn("flex flex-col gap-3 pt-6", expanded ? "items-stretch px-3" : "items-center")}>
        <NavIcon icon={FileText} label="Summary" href="/" active={pathname === "/"} expanded={expanded} />
        <NavIcon icon={Calendar} label="Year/Year" href="/yoy" active={pathname === "/yoy"} expanded={expanded} />
        <NavIcon icon={Users} label="Peer" href="/peer" active={pathname === "/peer"} expanded={expanded} />
        <NavIcon icon={Trophy} label="Leaders" href="/leaderboard" active={pathname === "/leaderboard"} expanded={expanded} />
        <NavIcon icon={ActivitySquare} label="Consistency" href="/consistency" active={pathname === "/consistency"} expanded={expanded} />
        <NavIcon icon={Globe2} label="Maps" href="/maps/contracts" active={pathname.startsWith("/maps")} expanded={expanded} />
        <NavIcon icon={AlertTriangle} label="Ops Impact" href="/analysis/operations-impact" active={pathname.startsWith("/analysis/operations-impact")} expanded={expanded} />
        <NavIcon icon={Percent} label="Percentiles" href="/analysis/percentile-analysis" active={pathname.startsWith("/analysis/percentile-analysis")} expanded={expanded} />
        <NavIcon icon={TrendingDown} label="QI Trends" href="/analysis/quality-improvement" active={pathname.startsWith("/analysis/quality-improvement")} expanded={expanded} />
        <NavIcon icon={ArrowUpDown} label="Band Movement" href="/analysis/band-movement" active={pathname.startsWith("/analysis/band-movement")} expanded={expanded} />
        <NavIcon icon={HeartPulse} label="Conditions" href="/condition-groups" active={pathname === "/condition-groups"} expanded={expanded} />
        <NavIcon icon={Scale} label="UHC vs Mkt" href="/uhc-comparison" active={pathname === "/uhc-comparison"} expanded={expanded} />
        {showAiAssistant ? <NavIcon icon={Sparkle} label="AI Chat" href="/chat" active={pathname === "/chat"} expanded={expanded} /> : null}
        <NavIcon icon={BarChart3} label="Data" href="/data" active={pathname === "/data"} expanded={expanded} />
      </div>
      <div className={cn("flex flex-col gap-4 pb-6", expanded ? "items-stretch px-3" : "items-center")}>
        <NavIcon icon={Shield} label="Admin" href="/admin/users" active={pathname.startsWith("/admin")} expanded={expanded} />
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
