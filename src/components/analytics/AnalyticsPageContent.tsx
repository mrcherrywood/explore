"use client";

import { useMemo, useRef } from "react";
import { ExportPdfButton } from "@/components/shared/ExportPdfButton";
import { ComparisonBuilder } from "./ComparisonBuilder";
import { ComparisonResults } from "./ComparisonResults";

type AnalyticsPageContentProps = {
  selectedContracts: string[];
  selectedMeasures: string[];
  selectedYears: string[];
};

function buildFileName(contracts: string[], measures: string[], years: string[]) {
  const parts: string[] = ["analytics"];
  if (contracts.length > 0) {
    parts.push(contracts.slice(0, 3).join("-"));
  }
  if (measures.length > 0) {
    parts.push(measures.slice(0, 3).join("-"));
  }
  if (years.length > 0) {
    parts.push(years.join("-"));
  }
  return parts
    .map((part) => part.replace(/[^a-z0-9_\-]+/gi, "-").toLowerCase())
    .filter((part) => part.length > 0)
    .join("_");
}

export function AnalyticsPageContent({
  selectedContracts,
  selectedMeasures,
  selectedYears,
}: AnalyticsPageContentProps) {
  const exportContainerRef = useRef<HTMLDivElement | null>(null);
  const hasSelections = selectedContracts.length > 0 && selectedMeasures.length > 0 && selectedYears.length > 0;

  const fileName = useMemo(
    () => buildFileName(selectedContracts, selectedMeasures, selectedYears),
    [selectedContracts, selectedMeasures, selectedYears]
  );

  return (
    <div ref={exportContainerRef} className="flex flex-col gap-6">
      <div className="flex justify-end">
        <ExportPdfButton targetRef={exportContainerRef} fileName={fileName || undefined} />
      </div>
      <ComparisonBuilder
        selectedContracts={selectedContracts}
        selectedMeasures={selectedMeasures}
        selectedYears={selectedYears}
      />

      {hasSelections && (
        <ComparisonResults
          contracts={selectedContracts}
          measures={selectedMeasures}
          years={selectedYears}
        />
      )}
    </div>
  );
}
