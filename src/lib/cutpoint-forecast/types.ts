export type ForecastImportSummary = {
  rowCount: number;
  contractCount: number;
  measureCount: number;
  years: number[];
  months: number[];
  latestObservedYear: number | null;
  latestObservedMonth: number | null;
};

export type ImportedMonthlyMeasureRow = {
  sourceRowNumber: number;
  hlCode: string | null;
  contractId: string;
  measureName: string;
  measureDisplayName: string;
  measureNormalized: string;
  measureCode: string | null;
  metricCategory: "Part C" | "Part D" | "Other";
  year: number;
  month: number;
  normalizedMonth: number;
  rate: number | null;
  numeratorAll: number | null;
  denominatorAll: number | null;
};

export type ForecastWorkbookParseResult = {
  rows: ImportedMonthlyMeasureRow[];
  summary: ForecastImportSummary;
  sheetName: string;
};

export type GlidepathConfidenceLabel = "low" | "medium" | "high";
export type GlidepathMeasureType = "hedis" | "pharmacy" | "cahps" | "hos";

export type GlidepathProjection = {
  contractId: string;
  measureName: string;
  measureDisplayName: string;
  measureNormalized: string;
  measureCode: string | null;
  hlCode: string | null;
  metricCategory: "Part C" | "Part D" | "Other";
  measureType: GlidepathMeasureType;
  projectedScore: number;
  modelScore: number;
  confidence: number;
  confidenceLabel: GlidepathConfidenceLabel;
  trendSlope: number | null;
  seasonalityDelta: number | null;
  lastObservedYear: number | null;
  lastObservedMonth: number | null;
  lastObservedScore: number | null;
  supportingPoints: number;
  notes: string[];
};

export type ForecastRunStatus = "draft" | "approved";
export type ForecastDatasetType = "non_cahps" | "cahps";
export type ForecastPopulationMode = "full_market" | "client_only";

export type ForecastImportBatchRecord = {
  id: string;
  fileName: string;
  forecastYear: number;
  rowCount: number;
  contractCount: number;
  measureCount: number;
  sourceSheet: string | null;
  latestObservedYear: number | null;
  latestObservedMonth: number | null;
  importedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ForecastProjectionRunRecord = {
  id: string;
  sourceBatchId: string | null;
  forecastYear: number;
  status: ForecastRunStatus;
  datasetType: ForecastDatasetType;
  asOfYear: number | null;
  asOfMonth: number | null;
  modelVersion: string | null;
  projectionCount: number;
  notes: string | null;
  importedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ForecastMeasureApprovalRecord = {
  id: string;
  runId: string;
  measureNormalized: string;
  measureDisplayName: string;
  approvedBy: string | null;
  approvedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ForecastProjectionRecord = {
  id: string;
  runId: string;
  forecastYear: number;
  contractId: string;
  measureName: string;
  measureDisplayName: string;
  measureNormalized: string;
  measureCode: string | null;
  hlCode: string | null;
  metricCategory: "Part C" | "Part D" | "Other";
  modelScore: number;
  manualScore: number | null;
  finalScore: number;
  confidence: number;
  confidenceLabel: GlidepathConfidenceLabel;
  trendSlope: number | null;
  seasonalityDelta: number | null;
  lastObservedYear: number | null;
  lastObservedMonth: number | null;
  lastObservedScore: number | null;
  supportingPoints: number;
  notes: string[];
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ForecastMonthlyHistoryPoint = {
  contractId: string;
  measureDisplayName: string;
  measureNormalized: string;
  hlCode: string | null;
  measureCode: string | null;
  metricCategory: "Part C" | "Part D" | "Other";
  year: number;
  month: number;
  normalizedMonth: number;
  rate: number | null;
  numeratorAll: number | null;
  denominatorAll: number | null;
};

export type ForecastProjectionDetailRecord = {
  runId: string;
  sourceBatchId: string | null;
  projection: ForecastProjectionRecord;
  history: ForecastMonthlyHistoryPoint[];
};
