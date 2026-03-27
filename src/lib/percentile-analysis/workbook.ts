import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import * as XLSX from "xlsx";

import type {
  PercentileMethod,
  WorkbookDefinition,
  WorkbookId,
  WorkbookSheetPayload,
  WorkbookViewerResponse,
} from "@/lib/percentile-analysis/workbook-types";

const SCRIPT_DIRECTORY = path.join(process.cwd(), "scripts", "percentile-analysis");
const WORKBOOK_DIRECTORIES = [
  path.join(process.cwd(), "data"),
  path.join(process.cwd(), "scripts", "percentile-analysis", "data"),
] as const;
const GENERATED_WORKBOOK_DIRECTORY = path.join(SCRIPT_DIRECTORY, ".generated-workbooks");

const METHOD_OPTIONS: WorkbookViewerResponse["methods"] = [
  {
    id: "percentrank_inc",
    label: "Percentile Rank",
    description: "Matches Excel PERCENTRANK.INC and is the industry-standard approach.",
  },
  {
    id: "percentileofscore",
    label: "Percentile of Score",
    description: "SciPy-style method that counts values at or below the score.",
  },
] as const;

const WORKBOOK_CONFIG = {
  contract: {
    id: "contract",
    label: "Contract Percentile Performance",
    fileName: "Star_Ratings_Contract_Percentile_Performance_2022-2026.xlsx",
    description: "Workbook-style contract performance view by year.",
  },
  cutpoint: {
    id: "cutpoint",
    label: "Cut Point Percentile Equivalents",
    fileName: "Star_Ratings_CutPoint_Percentile_Equivalents_HR-Contracts_2022-2026.xlsx",
    description: "Workbook-style cut point percentile view with summary sheets.",
  },
} as const satisfies Record<
  WorkbookId,
  { id: WorkbookId; label: string; fileName: string; description: string }
>;

type CachedWorkbook = {
  definition: WorkbookDefinition;
  workbook: XLSX.WorkBook;
};

const workbookCache = new Map<string, CachedWorkbook>();

function normalizeCellValue(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function getDefaultSheetName(sheetNames: string[]) {
  if (sheetNames.includes("2026")) return "2026";
  return sheetNames[sheetNames.length - 1] ?? "";
}

async function resolveStaticWorkbookPath(fileName: string) {
  for (const directory of WORKBOOK_DIRECTORIES) {
    const candidate = path.join(directory, fileName);
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    `Workbook not found or not readable: ${fileName}. Checked: ${WORKBOOK_DIRECTORIES.join(", ")}`
  );
}

async function runPythonScript(scriptName: string, args: string[]) {
  const pythonCandidates = ["python3", "python"];
  let lastError = "Python executable was not found.";

  for (const executable of pythonCandidates) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, [scriptName, ...args], {
          cwd: SCRIPT_DIRECTORY,
          env: process.env,
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code === 0) {
            resolve();
            return;
          }
          reject(new Error(stderr || stdout || `Script exited with code ${code}`));
        });
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Python execution error.";
      if (message.includes("ENOENT")) {
        lastError = `Unable to locate ${executable}.`;
        continue;
      }
      throw new Error(message);
    }
  }

  throw new Error(lastError);
}

async function generateWorkbookPath(workbookId: WorkbookId, method: PercentileMethod) {
  try {
    await mkdir(GENERATED_WORKBOOK_DIRECTORY, { recursive: true });
  } catch {
    await access(GENERATED_WORKBOOK_DIRECTORY, constants.R_OK);
  }

  const fileName =
    workbookId === "contract"
      ? `contract-percentiles-${method}.xlsx`
      : `cutpoint-percentiles-${method}.xlsx`;
  const outputPath = path.join(GENERATED_WORKBOOK_DIRECTORY, fileName);

  try {
    await access(outputPath, constants.R_OK);
    return outputPath;
  } catch {
    // Fall through to generation.
  }

  if (workbookId === "contract") {
    await runPythonScript("contract_percentiles.py", [
      "--output",
      outputPath,
      "--format",
      "xlsx",
      "--method",
      method,
    ]);
  } else {
    await runPythonScript("cutpoint_percentiles.py", [
      "--output",
      outputPath,
      "--format",
      "xlsx",
      "--method",
      method,
    ]);
  }

  return outputPath;
}

async function resolveWorkbookPath(workbookId: WorkbookId, method: PercentileMethod, fileName: string) {
  if (method === "percentrank_inc") {
    try {
      return await resolveStaticWorkbookPath(fileName);
    } catch {
      return generateWorkbookPath(workbookId, method);
    }
  }

  return generateWorkbookPath(workbookId, method);
}

async function loadWorkbook(workbookId: WorkbookId, method: PercentileMethod): Promise<CachedWorkbook> {
  const cacheKey = `${workbookId}:${method}`;
  const cached = workbookCache.get(cacheKey);
  if (cached) return cached;

  const config = WORKBOOK_CONFIG[workbookId];
  const filePath = await resolveWorkbookPath(workbookId, method, config.fileName);
  const fileBuffer = await readFile(filePath);
  const workbook = XLSX.read(fileBuffer, {
    type: "buffer",
    cellDates: true,
    cellStyles: true,
  });

  const definition: WorkbookDefinition = {
    id: config.id,
    label: config.label,
    fileName: config.fileName,
    description: config.description,
    sheets: workbook.SheetNames,
  };

  const entry = { definition, workbook };
  workbookCache.set(cacheKey, entry);
  return entry;
}

async function buildSheetPayload(workbookId: WorkbookId, method: PercentileMethod, sheetName?: string): Promise<WorkbookSheetPayload> {
  const { definition, workbook } = await loadWorkbook(workbookId, method);
  const resolvedSheetName =
    sheetName && definition.sheets.includes(sheetName) ? sheetName : getDefaultSheetName(definition.sheets);
  const worksheet = workbook.Sheets[resolvedSheetName];

  if (!worksheet || !worksheet["!ref"]) {
    return {
      workbookId,
      workbookLabel: definition.label,
      sheetName: resolvedSheetName,
      rowCount: 0,
      columnCount: 0,
      rows: [],
      fills: [],
      merges: [],
    };
  }

  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const rows: Array<Array<string | number | null>> = [];
  const fills: Array<Array<string | null>> = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: Array<string | number | null> = [];
    const fillRow: Array<string | null> = [];
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = worksheet[cellAddress];
      row.push(normalizeCellValue(cell?.v));
      fillRow.push(typeof cell?.s?.fgColor?.rgb === "string" ? cell.s.fgColor.rgb : null);
    }
    rows.push(row);
    fills.push(fillRow);
  }

  const merges = (worksheet["!merges"] ?? []).map((merge) => ({
    startRow: merge.s.r,
    endRow: merge.e.r,
    startCol: merge.s.c,
    endCol: merge.e.c,
  }));

  return {
    workbookId,
    workbookLabel: definition.label,
    sheetName: resolvedSheetName,
    rowCount: rows.length,
    columnCount: range.e.c - range.s.c + 1,
    rows,
    fills,
    merges,
  };
}

export async function getWorkbookViewerData(
  workbookId?: string | null,
  sheetName?: string | null,
  method?: string | null
): Promise<WorkbookViewerResponse> {
  const activeWorkbookId: WorkbookId = workbookId === "cutpoint" ? "cutpoint" : "contract";
  const activeMethod: PercentileMethod = method === "percentileofscore" ? "percentileofscore" : "percentrank_inc";
  const loadedWorkbooks = await Promise.all(
    (Object.keys(WORKBOOK_CONFIG) as WorkbookId[]).map((id) => loadWorkbook(id, activeMethod))
  );
  const workbooks = loadedWorkbooks.map((entry) => entry.definition);
  const sheet = await buildSheetPayload(activeWorkbookId, activeMethod, sheetName ?? undefined);

  return {
    methods: METHOD_OPTIONS,
    activeMethod,
    workbooks,
    activeWorkbookId,
    activeSheetName: sheet.sheetName,
    sheet,
  };
}
