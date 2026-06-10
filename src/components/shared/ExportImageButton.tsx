"use client";

import { useRef, useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { exportElementToPng } from "@/lib/export/dom-image";
import { cn } from "@/lib/utils";

export type ExportImageButtonProps = {
  targetRef: React.RefObject<HTMLElement | null>;
  fileName?: string;
  scale?: number;
  className?: string;
  disabled?: boolean;
  label?: string;
  onBeforeExport?: () => void | Promise<void>;
  onAfterExport?: (error?: unknown) => void;
};

const DEFAULT_LABEL = "Export PNG";

export function ExportImageButton({
  targetRef,
  fileName,
  scale,
  className,
  disabled,
  label,
  onBeforeExport,
  onAfterExport,
}: ExportImageButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const selfRef = useRef<HTMLButtonElement | null>(null);

  const handleExport = async () => {
    if (!targetRef?.current) {
      console.warn("Image export requested without a target element");
      onAfterExport?.(new Error("Missing export target"));
      return;
    }

    if (isExporting) return;

    try {
      setIsExporting(true);
      await onBeforeExport?.();

      // Let layout settle after any pre-export DOM changes.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      targetRef.current.classList.add("export-hide-borders", "export-capture-mode");
      void targetRef.current.offsetHeight;

      await exportElementToPng(targetRef.current, { fileName, scale });

      targetRef.current.classList.remove("export-hide-borders", "export-capture-mode");

      onAfterExport?.();
    } catch (error) {
      console.error("Failed to export image", error);
      targetRef.current?.classList.remove("export-hide-borders", "export-capture-mode");
      onAfterExport?.(error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      ref={selfRef}
      type="button"
      onClick={handleExport}
      disabled={disabled || isExporting}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      title={label ?? DEFAULT_LABEL}
    >
      {isExporting ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <ImageDown className="h-3 w-3" />
      )}
      {label ?? DEFAULT_LABEL}
    </button>
  );
}
