"use client";

import { BarChart3, CalendarRange, Compass, Layers, Settings, TrendingUp } from "lucide-react";
import { NavIcon } from "./NavIcon";
import { usePathname } from "next/navigation";

export function DataPageNav() {
  const pathname = usePathname();
  
  return (
    <aside className="hidden w-20 flex-col items-center gap-6 border-r border-white/5 bg-[#050505] pt-10 xl:flex">
      <NavIcon icon={Compass} label="Home" href="/" />
      <NavIcon icon={BarChart3} label="Data" href="/data" active={pathname === "/data"} />
      <NavIcon icon={TrendingUp} label="Analytics" href="/analytics" active={pathname === "/analytics"} />
      <NavIcon icon={Layers} label="Segments" />
      <NavIcon icon={CalendarRange} label="Timeline" />
      <NavIcon icon={Settings} label="Settings" />
    </aside>
  );
}
