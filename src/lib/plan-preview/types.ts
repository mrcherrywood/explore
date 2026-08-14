export type PlanPreviewFileType =
  | "measure_data"
  | "cai"
  | "cahps"
  | "hedis"
  | "snp_cm"
  | "cahps_adjusted";

export type PlanPreviewDecimalSource = "cahps" | "hedis" | "snp_cm";

export type PlanPreviewMeasureStatus =
  | "scored"
  | "not_required"
  | "not_applicable"
  | "insufficient_data"
  | "cms_data_issue"
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

export type ParsedPlanPreviewDecimalScore = {
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
  decimalScore: number;
  decimalSource: PlanPreviewDecimalSource;
  /**
   * Final CAHPS measure star from the plan's PP1 CAHPS `Star Rating` column.
   * Only set for cahps domain rows; null when blank/invalid.
   */
  planStar?: number | null;
  /**
   * Pre-adjustment base-group star from the plan's PP1 CAHPS `Base Group`
   * column. Differs from planStar when case-mix / significance moves the
   * measure off its base-group assignment.
   */
  baseGroupStar?: number | null;
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

export type PlanPreviewDecimalParseResult = {
  fileType: PlanPreviewDecimalSource;
  sheetName: string;
  detectedStarsYear: number | null;
  rows: ParsedPlanPreviewDecimalScore[];
  summary: {
    rowCount: number;
    contractCount: number;
    measureCount: number;
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

export type ParsedPlanPreviewCahpsAdjustedStar = {
  sourceRowNumber: number;
  contractId: string;
  organizationMarketingName: string | null;
  parentOrganization: string | null;
  variable: string | null;
  variableName: string;
  measureCode: string;
  measureDisplayName: string;
  measureNormalized: string;
  adjustedBaseStar: number;
  unadjustedBaseStar: number | null;
  adjustedFinalStar: number | null;
  caseMixAdjustment: number | null;
  planReliability: string | null;
  planSignificance: string | null;
};

export type PlanPreviewCahpsAdjustedParseResult = {
  fileType: "cahps_adjusted";
  sheetName: string;
  detectedStarsYear: number | null;
  rows: ParsedPlanPreviewCahpsAdjustedStar[];
  summary: {
    rowCount: number;
    contractCount: number;
    measureCount: number;
  };
};

export type PlanPreviewParseResult =
  | PlanPreviewMeasureParseResult
  | PlanPreviewCaiParseResult
  | PlanPreviewDecimalParseResult
  | PlanPreviewCahpsAdjustedParseResult;

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
  parentOrganization: string | null;
  importedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlanPreviewAccrualSummary = {
  starsYear: number;
  contractCount: number;
  measureCount: number;
  scoredValueCount: number;
  decimalValueCount: number;
  caiContractCount: number;
  batchCount: number;
  lastUploadAt: string | null;
};

export type PlanPreviewExportRow = {
  contractId: string;
  organizationMarketingName: string | null;
  contractName: string | null;
  parentOrganization: string | null;
  measureCode: string;
  measureDisplayName: string;
  rawValue: string;
  score: number | null;
  status: PlanPreviewMeasureStatus;
  decimalScore: number | null;
  decimalSource: string | null;
};
