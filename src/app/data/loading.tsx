import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="fep-card flex flex-col items-center gap-4 px-10 py-8">
        <Loader2 className="size-10 animate-spin text-[var(--fep-accent)]" />
        <div className="fep-label">Loading data explorer…</div>
        <p className="max-w-xs text-center text-xs text-muted-foreground text-pretty">
          Fetching table rows and filter options.
        </p>
      </div>
    </div>
  );
}
