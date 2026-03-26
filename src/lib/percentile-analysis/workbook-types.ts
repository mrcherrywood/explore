export type WorkbookId = "contract" | "cutpoint";
export type PercentileMethod = "percentrank_inc" | "percentileofscore";

export type WorkbookDefinition = {
  id: WorkbookId;
  label: string;
  fileName: string;
  description: string;
  sheets: string[];
};

export type WorkbookMergeRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export type WorkbookSheetPayload = {
  workbookId: WorkbookId;
  workbookLabel: string;
  sheetName: string;
  rowCount: number;
  columnCount: number;
  rows: Array<Array<string | number | null>>;
  fills: Array<Array<string | null>>;
  merges: WorkbookMergeRange[];
};

export type WorkbookViewerResponse = {
  methods: Array<{
    id: PercentileMethod;
    label: string;
    description: string;
  }>;
  activeMethod: PercentileMethod;
  workbooks: WorkbookDefinition[];
  activeWorkbookId: WorkbookId;
  activeSheetName: string;
  sheet: WorkbookSheetPayload;
};
