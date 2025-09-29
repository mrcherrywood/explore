"use client";

import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { useState } from "react";

type ClearFiltersButtonProps = {
  tableName: string;
};

export function ClearFiltersButton({ tableName }: ClearFiltersButtonProps) {
  const router = useRouter();
  const [isClearing, setIsClearing] = useState(false);

  const handleClear = () => {
    setIsClearing(true);
    router.push(`?table=${tableName}`);
  };

  return (
    <button
      onClick={handleClear}
      disabled={isClearing}
      className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:border-red-400/60 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isClearing ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <X className="h-3 w-3" />
      )}
      Clear
    </button>
  );
}
