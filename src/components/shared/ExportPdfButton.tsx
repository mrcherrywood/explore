"use client";

import { useRef, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import type { jsPDFOptions } from "jspdf";
import { exportElementToPdf } from "@/lib/export/pdf";
import { cn } from "@/lib/utils";

export type ExportPdfButtonProps = {
  targetRef: React.RefObject<HTMLElement | null>;
  fileName?: string;
  orientation?: jsPDFOptions["orientation"];
  format?: jsPDFOptions["format"];
  className?: string;
  disabled?: boolean;
  label?: string;
  onBeforeExport?: () => void | Promise<void>;
  onAfterExport?: (error?: unknown) => void;
};

const DEFAULT_LABEL = "Export PDF";

export function ExportPdfButton({
  targetRef,
  fileName,
  orientation,
  format,
  className,
  disabled,
  label,
  onBeforeExport,
  onAfterExport,
}: ExportPdfButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const selfRef = useRef<HTMLButtonElement | null>(null);

  const handleExport = async () => {
    if (!targetRef?.current) {
      console.warn("PDF export requested without a target element");
      onAfterExport?.(new Error("Missing export target"));
      return;
    }

    if (isExporting) return;

    try {
      setIsExporting(true);
      await onBeforeExport?.();

      const originalVisibility = selfRef.current?.style.visibility;
      if (selfRef.current) {
        selfRef.current.style.visibility = "hidden";
      }

      // Add class to hide borders during PDF export
      targetRef.current.classList.add("pdf-export-mode");

      await exportElementToPdf(targetRef.current, {
        fileName,
        orientation,
        format,
      });

      // Remove the class after export
      targetRef.current.classList.remove("pdf-export-mode");

      if (selfRef.current) {
        selfRef.current.style.visibility = originalVisibility ?? "";
      }

      onAfterExport?.();
    } catch (error) {
      console.error("Failed to export PDF", error);
      // Clean up class on error
      if (targetRef.current) {
        targetRef.current.classList.remove("pdf-export-mode");
      }
      if (selfRef.current) {
        selfRef.current.style.visibility = "";
      }
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
        "flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      title={label ?? DEFAULT_LABEL}
    >
      {isExporting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <FileDown className="h-3.5 w-3.5" />
      )}
      {label ?? DEFAULT_LABEL}
    </button>
  );
}
