"use client";

import type { PropsWithChildren } from "react";
import { useRef } from "react";
import { ExportPdfButton } from "@/components/shared/ExportPdfButton";
import { cn } from "@/lib/utils";

export type ExportPdfContainerProps = PropsWithChildren<{
  fileName?: string;
  className?: string;
  contentClassName?: string;
  buttonLabel?: string;
}>;

export function ExportPdfContainer({
  fileName,
  className,
  contentClassName,
  buttonLabel,
  children,
}: ExportPdfContainerProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div ref={ref} className={cn("flex flex-col gap-6", className)}>
      <div className="flex justify-end">
        <ExportPdfButton
          targetRef={ref}
          fileName={fileName}
          label={buttonLabel}
        />
      </div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
