import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, symlink } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  ContractAnalysisSummary,
  ContractLeaderboardEntry,
  ContractYearSummary,
  CutpointAnalysisSummary,
  CutpointMeasureSummary,
  CutpointYearSummary,
  PercentileAnalysisApiResponse,
  PercentileInputStatus,
} from "@/lib/percentile-analysis/types";
import type { PercentileMethod } from "@/lib/percentile-analysis/workbook-types";

const WORKSPACE_ROOT = process.cwd();
const SCRIPT_DIRECTORY = path.join(WORKSPACE_ROOT, "scripts", "percentile-analysis");
const DATA_DIRECTORY = path.join(SCRIPT_DIRECTORY, "data");
const CONTRACT_SCRIPT = path.join(SCRIPT_DIRECTORY, "contract_percentiles.py");
const CUTPOINT_SCRIPT = path.join(SCRIPT_DIRECTORY, "cutpoint_percentiles.py");
const GENERATED_JSON_DIRECTORY = process.env.VERCEL
  ? path.join(os.tmpdir(), "percentile-analysis-generated-json")
  : path.join(SCRIPT_DIRECTORY, ".generated-json");

export const SUPPORTED_MEASURE_YEARS = [2024, 2025, 2026] as const;

export const YEAR_RECENCY_WEIGHTS: Record<number, number> = {
  2024: 1,
  2025: 2,
  2026: 3,
};

const EXPECTED_MEASURE_FILES = [
  "2022 Star Ratings Data Table - Measure Data (Oct 06 2021).csv",
  "2023 Star Ratings Data Table - Measure Data (Oct 04 2022).csv",
  "2024 Star Ratings Data Table - Measure Data (Oct 12 2023).csv",
  "2025 Star Ratings Data Table - Measure Data (Oct 11 2024).csv",
  "2026 Star Ratings Data Table - Measure Data (Oct 8 2025).csv",
] as const;

const CONTRACT_OUTPUT_CANDIDATES = [
  path.join(SCRIPT_DIRECTORY, "contract_percentiles.json"),
  path.join(SCRIPT_DIRECTORY, "output", "contract_percentiles.json"),
  path.join(DATA_DIRECTORY, "percentile-analysis", "contract_percentiles.json"),
] as const;

const CUTPOINT_OUTPUT_CANDIDATES = [
  path.join(SCRIPT_DIRECTORY, "cutpoint_percentiles.json"),
  path.join(SCRIPT_DIRECTORY, "output", "cutpoint_percentiles.json"),
  path.join(DATA_DIRECTORY, "percentile-analysis", "cutpoint_percentiles.json"),
] as const;

export type ContractOutput = {
  method?: string;
  years?: Record<
    string,
    Array<{
      contract_id: string;
      contract_name: string;
      org_name: string;
      measures: Record<
        string,
        {
          name?: string;
          score?: number | null;
          percentile?: number | null;
          inverted?: boolean;
        }
      >;
    }>
  >;
};

type CutpointOutput = {
  method?: string;
  results?: Record<
    string,
    Array<{
      measure: string;
      n: number;
      cp2_pct?: number | null;
      cp3_pct?: number | null;
      cp4_pct?: number | null;
      cp5_pct?: number | null;
    }>
  >;
  distributions?: Record<
    string,
    {
      median?: number | null;
      iqr?: number | null;
      range?: string | null;
      context?: string | null;
    }
  >;
};

async function pathExists(targetPath: string) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursively(rootDir: string): Promise<string[]> {
  if (!(await pathExists(rootDir))) return [];
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursively(fullPath);
      }
      return [fullPath];
    })
  );
  return results.flat();
}

async function resolveExistingOutput(candidates: readonly string[]) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function buildInputStatus(allDataFiles: string[]): Promise<PercentileInputStatus> {
  const basenameMap = new Map(allDataFiles.map((filePath) => [path.basename(filePath), filePath]));
  const discoveredMeasureFiles = EXPECTED_MEASURE_FILES.flatMap((filename) => {
    const resolved = basenameMap.get(filename);
    return resolved ? [resolved] : [];
  });
  const missingMeasureFiles = EXPECTED_MEASURE_FILES.filter((filename) => !basenameMap.has(filename));
  const cutPointFile =
    allDataFiles.find((filePath) => path.basename(filePath) === "Stars 2016-2028 Cut Points 12.2025 (1).xlsx") ??
    allDataFiles.find((filePath) => path.basename(filePath).startsWith("Stars 2016-2028 Cut Points") && filePath.endsWith(".xlsx")) ??
    null;

  const discoveredOutputFiles = [
    await resolveExistingOutput(CONTRACT_OUTPUT_CANDIDATES),
    await resolveExistingOutput(CUTPOINT_OUTPUT_CANDIDATES),
  ].filter((value): value is string => Boolean(value));

  return {
    scriptDirectory: SCRIPT_DIRECTORY,
    dataDirectory: DATA_DIRECTORY,
    scriptsFound: {
      contract: await pathExists(CONTRACT_SCRIPT),
      cutpoint: await pathExists(CUTPOINT_SCRIPT),
    },
    discoveredMeasureFiles,
    missingMeasureFiles,
    cutPointFile,
    discoveredOutputFiles,
  };
}

async function stageMeasureFiles(inputStatus: PercentileInputStatus) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "percentile-analysis-"));
  await Promise.all(
    inputStatus.discoveredMeasureFiles.map((sourcePath) =>
      symlink(sourcePath, path.join(tempDir, path.basename(sourcePath)))
    )
  );
  return tempDir;
}

async function runPythonScript(scriptPath: string, args: string[]) {
  const pythonCandidates = ["python3", "python"];
  let lastError = "Python executable was not found.";

  for (const executable of pythonCandidates) {
    try {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(executable, [scriptPath, ...args], {
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
            resolve({ stdout, stderr });
            return;
          }
          reject(new Error(stderr || stdout || `Script exited with code ${code}`));
        });
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown script failure";
      if (message.includes("ENOENT")) {
        lastError = `Unable to locate ${executable}.`;
        continue;
      }
      throw new Error(message);
    }
  }

  throw new Error(lastError);
}

function averagePercentile(measures: Record<string, { percentile?: number | null }>) {
  const percentiles = Object.values(measures)
    .map((measure) => measure.percentile)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (percentiles.length === 0) return null;
  return Number((percentiles.reduce((sum, value) => sum + value, 0) / percentiles.length).toFixed(1));
}

function rankContracts(contracts: NonNullable<ContractOutput["years"]>[string]) {
  return contracts
    .map<ContractLeaderboardEntry>((contract) => ({
      contractId: contract.contract_id,
      contractName: contract.contract_name,
      orgName: contract.org_name,
      avgPercentile: averagePercentile(contract.measures),
      measureCount: Object.keys(contract.measures ?? {}).length,
    }))
    .filter((contract) => contract.measureCount > 0)
    .sort((a, b) => {
      const aValue = a.avgPercentile ?? -1;
      const bValue = b.avgPercentile ?? -1;
      if (bValue !== aValue) return bValue - aValue;
      return a.contractId.localeCompare(b.contractId);
    });
}

function summarizeContractOutput(output: ContractOutput, outputPath: string | null, source: "generated" | "existing-json"): ContractAnalysisSummary {
  const years = Object.entries(output.years ?? {})
    .map<ContractYearSummary>(([yearKey, contracts]) => {
      const ranked = rankContracts(contracts);
      const topContracts = ranked.slice(0, 10);
      const bottomContracts = ranked.slice(-10).reverse();
      const measureCount = contracts.reduce((max, contract) => Math.max(max, Object.keys(contract.measures ?? {}).length), 0);
      return {
        year: Number(yearKey),
        contractCount: contracts.length,
        measureCount,
        topContracts,
        bottomContracts,
      };
    })
    .sort((a, b) => b.year - a.year);

  return {
    status: years.length > 0 ? "ready" : "error",
    source,
    method: output.method ?? "percentrank_inc",
    years,
    outputPath,
    error: years.length > 0 ? undefined : "Contract analysis output did not contain any yearly data.",
  };
}

function summarizeCutpointOutput(output: CutpointOutput, outputPath: string | null, source: "generated" | "existing-json"): CutpointAnalysisSummary {
  const years = Object.entries(output.results ?? {})
    .map<CutpointYearSummary>(([yearKey, measures]) => ({
      year: Number(yearKey),
      measureCount: measures.length,
      measures: measures
        .map<CutpointMeasureSummary>((measure) => {
          const distribution = output.distributions?.[`${yearKey}|${measure.measure}`];
          return {
            measure: measure.measure,
            sampleSize: measure.n,
            actualPercentiles: {
              twoStar: measure.cp2_pct ?? null,
              threeStar: measure.cp3_pct ?? null,
              fourStar: measure.cp4_pct ?? null,
              fiveStar: measure.cp5_pct ?? null,
            },
            distribution: {
              median: distribution?.median ?? null,
              iqr: distribution?.iqr ?? null,
              range: distribution?.range ?? "—",
              context: distribution?.context ?? "",
            },
          };
        })
        .sort((a, b) => a.measure.localeCompare(b.measure)),
    }))
    .sort((a, b) => b.year - a.year);

  return {
    status: years.length > 0 ? "ready" : "error",
    source,
    method: output.method ?? "percentrank_inc",
    years,
    outputPath,
    error: years.length > 0 ? undefined : "Cut point analysis output did not contain any yearly data.",
  };
}

async function readJsonFile<T>(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function generateContractPercentileOutput(method: PercentileMethod) {
  const outputPath = path.join(GENERATED_JSON_DIRECTORY, `contract-percentiles-${method}.json`);
  if (!(await pathExists(outputPath))) {
    await runPythonScript(CONTRACT_SCRIPT, [
      "--data-dir",
      DATA_DIRECTORY,
      "--output",
      outputPath,
      "--format",
      "json",
      "--method",
      method,
    ]);
  }

  return outputPath;
}

export async function getContractPercentilesOutput(method: PercentileMethod): Promise<ContractOutput> {
  await access(SCRIPT_DIRECTORY, constants.R_OK);
  await access(DATA_DIRECTORY, constants.R_OK);
  await access(CONTRACT_SCRIPT, constants.R_OK);
  await mkdir(GENERATED_JSON_DIRECTORY, { recursive: true });
  const outputPath = await generateContractPercentileOutput(method);
  return readJsonFile<ContractOutput>(outputPath);
}

async function loadExistingAnalyses(): Promise<{
  contractAnalysis: ContractAnalysisSummary | null;
  cutpointAnalysis: CutpointAnalysisSummary | null;
}> {
  const [contractPath, cutpointPath] = await Promise.all([
    resolveExistingOutput(CONTRACT_OUTPUT_CANDIDATES),
    resolveExistingOutput(CUTPOINT_OUTPUT_CANDIDATES),
  ]);

  const [contractAnalysis, cutpointAnalysis] = await Promise.all([
    contractPath
      ? readJsonFile<ContractOutput>(contractPath).then((payload) => summarizeContractOutput(payload, contractPath, "existing-json"))
      : Promise.resolve(null),
    cutpointPath
      ? readJsonFile<CutpointOutput>(cutpointPath).then((payload) => summarizeCutpointOutput(payload, cutpointPath, "existing-json"))
      : Promise.resolve(null),
  ]);

  return { contractAnalysis, cutpointAnalysis };
}

async function generateAnalyses(inputStatus: PercentileInputStatus): Promise<{
  contractAnalysis: ContractAnalysisSummary;
  cutpointAnalysis: CutpointAnalysisSummary;
}> {
  if (inputStatus.missingMeasureFiles.length > 0) {
    return {
      contractAnalysis: {
        status: "missing_inputs",
        error: `Missing measure data files: ${inputStatus.missingMeasureFiles.join(", ")}`,
      },
      cutpointAnalysis: {
        status: inputStatus.cutPointFile ? "missing_inputs" : "missing_inputs",
        error: inputStatus.cutPointFile
          ? `Missing measure data files: ${inputStatus.missingMeasureFiles.join(", ")}`
          : "Missing measure data files and cut points workbook.",
      },
    };
  }

  if (!inputStatus.cutPointFile) {
    return {
      contractAnalysis: {
        status: "error",
        error: "Measure files are present, but no cut points workbook was found for the cut point analysis.",
      },
      cutpointAnalysis: {
        status: "missing_inputs",
        error: "Missing cut points workbook.",
      },
    };
  }

  const stagedDataDir = await stageMeasureFiles(inputStatus);
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "percentile-analysis-output-"));
  const contractOutputPath = path.join(outputDir, "contract_percentiles.json");
  const cutpointOutputPath = path.join(outputDir, "cutpoint_percentiles.json");

  const [contractRun, cutpointRun] = await Promise.allSettled([
    runPythonScript(CONTRACT_SCRIPT, ["--data-dir", stagedDataDir, "--output", contractOutputPath, "--format", "json"]),
    runPythonScript(CUTPOINT_SCRIPT, [
      "--data-dir",
      stagedDataDir,
      "--cut-points",
      inputStatus.cutPointFile,
      "--output",
      cutpointOutputPath,
      "--format",
      "json",
    ]),
  ]);

  const contractAnalysis =
    contractRun.status === "fulfilled"
      ? summarizeContractOutput(await readJsonFile<ContractOutput>(contractOutputPath), contractOutputPath, "generated")
      : {
          status: "error" as const,
          error: contractRun.reason instanceof Error ? contractRun.reason.message : "Contract analysis generation failed.",
        };

  const cutpointAnalysis =
    cutpointRun.status === "fulfilled"
      ? summarizeCutpointOutput(await readJsonFile<CutpointOutput>(cutpointOutputPath), cutpointOutputPath, "generated")
      : {
          status: "error" as const,
          error: cutpointRun.reason instanceof Error ? cutpointRun.reason.message : "Cut point analysis generation failed.",
        };

  return { contractAnalysis, cutpointAnalysis };
}

export async function getPercentileAnalysisData(): Promise<PercentileAnalysisApiResponse> {
  const allDataFiles = await listFilesRecursively(DATA_DIRECTORY);
  const inputStatus = await buildInputStatus(allDataFiles);
  const existing = await loadExistingAnalyses();

  if (existing.contractAnalysis || existing.cutpointAnalysis) {
    return {
      inputStatus,
      contractAnalysis:
        existing.contractAnalysis ??
        ({
          status: "missing_inputs",
          error: "No existing contract percentile JSON output was found.",
        } satisfies ContractAnalysisSummary),
      cutpointAnalysis:
        existing.cutpointAnalysis ??
        ({
          status: "missing_inputs",
          error: "No existing cut point percentile JSON output was found.",
        } satisfies CutpointAnalysisSummary),
    };
  }

  const generated = await generateAnalyses(inputStatus);
  return {
    inputStatus,
    contractAnalysis: generated.contractAnalysis,
    cutpointAnalysis: generated.cutpointAnalysis,
  };
}
