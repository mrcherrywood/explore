"use client";

import { BarChart3, FileText, Calendar, Sparkle, Trophy, Users, Globe2, AlertTriangle, Scale, Shield, ActivitySquare } from "lucide-react";
import { NavIcon } from "./NavIcon";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/auth";
import { usePathname } from "next/navigation";

export function DataPageNav() {
  const pathname = usePathname();
  const showAiAssistant = false;
  
  return (
    <aside className="sticky top-0 hidden h-screen w-20 flex-col justify-between border-r border-border bg-background xl:flex">
      <div className="flex flex-col items-center gap-3 pt-6">
        <NavIcon icon={FileText} label="Summary" href="/" active={pathname === "/"} />
        <NavIcon icon={Calendar} label="Year/Year" href="/yoy" active={pathname === "/yoy"} />
        <NavIcon icon={Users} label="Peer" href="/peer" active={pathname === "/peer"} />
        <NavIcon icon={Trophy} label="Leaders" href="/leaderboard" active={pathname === "/leaderboard"} />
        <NavIcon icon={ActivitySquare} label="Consistency" href="/consistency" active={pathname === "/consistency"} />
        <NavIcon icon={Globe2} label="Maps" href="/maps/contracts" active={pathname.startsWith("/maps")} />
        <NavIcon icon={AlertTriangle} label="Ops Impact" href="/analysis/operations-impact" active={pathname.startsWith("/analysis")} />
        <NavIcon icon={Scale} label="UHC vs Mkt" href="/uhc-comparison" active={pathname === "/uhc-comparison"} />
        {showAiAssistant ? <NavIcon icon={Sparkle} label="AI Chat" href="/chat" active={pathname === "/chat"} /> : null}
        <NavIcon icon={BarChart3} label="Data" href="/data" active={pathname === "/data"} />
      </div>
      <div className="flex flex-col items-center gap-4 pb-6">
        <NavIcon icon={Shield} label="Admin" href="/admin/users" active={pathname.startsWith("/admin")} />
        <ThemeToggle />
        <UserMenu />
      </div>
    </aside>
  );
}
