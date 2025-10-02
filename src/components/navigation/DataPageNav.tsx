"use client";

import { BarChart3, FileText, Calendar, Sparkle, Trophy, Users } from "lucide-react";
import { NavIcon } from "./NavIcon";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePathname } from "next/navigation";

export function DataPageNav() {
  const pathname = usePathname();
  
  return (
    <aside className="sticky top-0 hidden h-screen w-20 flex-col justify-between border-r border-border bg-background xl:flex">
      <div className="flex flex-col items-center gap-6 pt-10">
        <NavIcon icon={FileText} label="Summary" href="/" active={pathname === "/"} />
        <NavIcon icon={Calendar} label="Year/Year" href="/yoy" active={pathname === "/yoy"} />
        <NavIcon icon={Users} label="Peer" href="/peer" active={pathname === "/peer"} />
        <NavIcon icon={Trophy} label="Leaders" href="/leaderboard" active={pathname === "/leaderboard"} />
        <NavIcon icon={Sparkle} label="AI Chat" href="/chat" active={pathname === "/chat"} />
        <NavIcon icon={BarChart3} label="Data" href="/data" active={pathname === "/data"} />
      </div>
      <div className="flex flex-col items-center gap-6 pb-6">
        <ThemeToggle />
      </div>
    </aside>
  );
}
