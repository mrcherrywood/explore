"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export type SearchableOption = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  value: string;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  minWidthClass?: string;
  onChange: (value: string) => void;
};

export function SearchableSelect({
  label,
  value,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyLabel = "No matches found",
  minWidthClass = "min-w-[300px]",
  onChange,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const normalized = query.toLowerCase();
    return options.filter(
      (option) =>
        option.value.toLowerCase().includes(normalized) ||
        option.label.toLowerCase().includes(normalized)
    );
  }, [options, query]);

  const selectedLabel = useMemo(
    () => options.find((option) => option.value === value)?.label ?? null,
    [options, value]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="flex items-center gap-2" ref={containerRef}>
      <label className="text-sm text-muted-foreground">{label}:</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className={`rounded-full border border-border bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted/80 transition flex items-center gap-2 ${minWidthClass}`}
        >
          <span className="truncate flex-1 text-left">{selectedLabel || placeholder}</span>
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        </button>
        {isOpen && (
          <div className="absolute z-50 mt-1 w-full min-w-[400px] rounded-xl border border-border bg-card shadow-lg">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-lg border border-border bg-muted pl-9 pr-9 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted-foreground/10 rounded"
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      setQuery("");
                    }}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-muted/40 transition ${
                      value === option.value ? "bg-primary/5 text-primary" : "text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">{emptyLabel}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
