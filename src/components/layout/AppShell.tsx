import type { ReactNode } from "react";

import { DataPageNav } from "@/components/navigation/DataPageNav";
import { cn } from "@/lib/utils";

type AppShellProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  mainClassName?: string;
};

export function AppShell({
  title,
  subtitle,
  actions,
  children,
  mainClassName,
}: AppShellProps) {
  return (
    <div className="flex min-h-dvh">
      <DataPageNav />
      <main className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-5 px-[30px] pb-4 pt-[22px]">
          <div className="min-w-0">
            <h1 className="fep-title text-balance">{title}</h1>
            {subtitle ? (
              <p className="fep-subtitle text-pretty">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="pt-2">{actions}</div> : null}
        </div>
        <div
          className={cn(
            "flex flex-1 flex-col gap-5 px-[30px] pb-8",
            mainClassName,
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
