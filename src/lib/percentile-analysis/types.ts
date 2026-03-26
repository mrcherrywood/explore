export type AnalysisStatus = "ready" | "missing_inputs" | "error";

export type AnalysisSource = "generated" | "existing-json";

export type ContractLeaderboardEntry = {
  contractId: string;
  contractName: string;
  orgName: string;
  avgPercentile: number | null;
  measureCount: number;
};

export type ContractYearSummary = {
  year: number;
  contractCount: number;
  measureCount: number;
  topContracts: ContractLeaderboardEntry[];
  bottomContracts: ContractLeaderboardEntry[];
};

export type ContractAnalysisSummary = {
  status: AnalysisStatus;
  source?: AnalysisSource;
  method?: string;
  years?: ContractYearSummary[];
  outputPath?: string | null;
  error?: string;
};

export type CutpointMeasureSummary = {
  measure: string;
  sampleSize: number;
  actualPercentiles: {
    twoStar: number | null;
    threeStar: number | null;
    fourStar: number | null;
    fiveStar: number | null;
  };
  distribution: {
    median: number | null;
    iqr: number | null;
    range: string;
    context: string;
  };
};

export type CutpointYearSummary = {
  year: number;
  measureCount: number;
  measures: CutpointMeasureSummary[];
};

export type CutpointAnalysisSummary = {
  status: AnalysisStatus;
  source?: AnalysisSource;
  method?: string;
  years?: CutpointYearSummary[];
  outputPath?: string | null;
  error?: string;
};

export type PercentileInputStatus = {
  scriptDirectory: string;
  dataDirectory: string;
  scriptsFound: {
    contract: boolean;
    cutpoint: boolean;
  };
  discoveredMeasureFiles: string[];
  missingMeasureFiles: string[];
  cutPointFile: string | null;
  discoveredOutputFiles: string[];
};

export type PercentileAnalysisApiResponse = {
  inputStatus: PercentileInputStatus;
  contractAnalysis: ContractAnalysisSummary;
  cutpointAnalysis: CutpointAnalysisSummary;
};
