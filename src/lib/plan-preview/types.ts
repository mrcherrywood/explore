export type PlanPreviewFileType = "measure_data" | "cai";

export type PlanPreviewMeasureStatus =
  | "scored"
  | "not_required"
  | "not_applicable"
  | "insufficient_data"
  | "other";

export type ParsedPlanPreviewMeasureScore = {
  sourceRowNumber: number;
  contractId: string;
  organizationMarketingName: string | null;
  contractName: string | null;
  parentOrganization: string | null;
  measureCode: string;
  measureName: string;
  measureDisplayName: string;
  measureNormalized: string;
  metricCategory: "Part C" | "Part D" | "Other";
  rawValue: string;
  score: number | null;
  status: PlanPreviewMeasureStatus;
};

export type ParsedPlanPreviewCaiRow = {
  sourceRowNumber: number;
  contractId: string;
  organizationMarketingName: string | null;
  contractName: string | null;
  parentOrganization: string | null;
  puertoRicoOnly: boolean | null;
  contractType: string | null;
  partDOffered: boolean | null;
  enrolled: number | null;
  numLisDe: number | null;
  numDisabled: number | null;
  pctLisDe: number | null;
  pctDisabled: number | null;
  partCLisDeGroup: string | null;
  partCDisabledQuintile: string | null;
  partCFac: string | null;
  partCCai: number | null;
  partDMapdLisDeGroup: string | null;
  partDMapdDisabledQuintile: string | null;
  partDMapdFac: string | null;
  partDMapdCai: number | null;
  partDPdpLisDeQuartile: string | null;
  partDPdpDisabledQuartile: string | null;
  partDPdpFac: string | null;
  partDPdpCai: number | null;
  overallLisDeGroup: string | null;
  overallDisabledQuintile: string | null;
  overallFac: string | null;
  overallCai: number | null;
};

export type PlanPreviewMeasureParseResult = {
  fileType: "measure_data";
  sheetName: string;
  detectedStarsYear: number | null;
  rows: ParsedPlanPreviewMeasureScore[];
  summary: {
    rowCount: number;
    contractCount: number;
    measureCount: number;
    scoredCount: number;
  };
};

export type PlanPreviewCaiParseResult = {
  fileType: "cai";
  sheetName: string;
  detectedStarsYear: number | null;
  rows: ParsedPlanPreviewCaiRow[];
  summary: {
    rowCount: number;
    contractCount: number;
  };
};

export type PlanPreviewParseResult =
  | PlanPreviewMeasureParseResult
  | PlanPreviewCaiParseResult;

export type PlanPreviewBatchRecord = {
  id: string;
  fileName: string;
  fileType: PlanPreviewFileType;
  starsYear: number;
  sourceSheet: string | null;
  detectedStarsYear: number | null;
  rowCount: number;
  contractCount: number;
  measureCount: number;
  importedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlanPreviewAccrualSummary = {
  starsYear: number;
  contractCount: number;
  measureCount: number;
  scoredValueCount: number;
  caiContractCount: number;
  batchCount: number;
  lastUploadAt: string | null;
};
