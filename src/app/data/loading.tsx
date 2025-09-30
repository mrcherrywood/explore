import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#050505]">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#080808] px-10 py-8 text-slate-800 dark:text-slate-200">
        <Loader2 className="h-10 w-10 animate-spin text-sky-500 dark:text-sky-400" />
        <div className="text-sm uppercase tracking-[0.35em] text-slate-600 dark:text-slate-500">Loading data explorer…</div>
        <p className="max-w-xs text-center text-xs text-slate-500 dark:text-slate-400">
          Fetching table data and filter options. This may take a few seconds when switching between views.
        </p>
      </div>
    </div>
  );
}
