import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type {
  ForecastImportBatchRecord,
  ForecastMeasureApprovalRecord,
  ForecastMonthlyHistoryPoint,
  ForecastProjectionDetailRecord,
  ForecastProjectionRecord,
  ForecastProjectionRunRecord,
  GlidepathProjection,
  ImportedMonthlyMeasureRow,
} from "./types";

type ServiceClient = SupabaseClient<Database>;
type BatchRow = Database["public"]["Tables"]["forecast_import_batches"]["Row"];
type MonthlyRow = Database["public"]["Tables"]["forecast_monthly_measure_history"]["Insert"];
type MonthlyHistoryDbRow = Database["public"]["Tables"]["forecast_monthly_measure_history"]["Row"];
type MeasureApprovalRow = Database["public"]["Tables"]["forecast_measure_approvals"]["Row"];
type RunRow = Database["public"]["Tables"]["forecast_projection_runs"]["Row"];
type ProjectionRow = Database["public"]["Tables"]["forecast_year_end_projections"]["Row"];

const INSERT_BATCH_SIZE = 500;
const MODEL_VERSION = "glidepath-v1";

/** Repeating-digit dummy/test contract IDs (H0000, H1111, … H9999). */
const DUMMY_CONTRACT_IDS = Array.from({ length: 10 }, (_, digit) => `H${String(digit).repeat(4)}`);

function isMissingMeasureApprovalsTableError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  return (
    (code === "PGRST205" || code === "42P01" || message.includes("forecast_measure_approvals")) &&
    (message.includes("schema cache") ||
      message.includes("Could not find the table") ||
      message.includes("does not exist"))
  );
}

function missingMeasureApprovalsTableMessage(): string {
  return "Measure approvals are not available yet. Run `npm run migrate -- migrations/015_create_forecast_measure_approvals.sql`, then refresh the Supabase schema cache.";
}

export function resolveFinalProjectionScore(
  modelScore: number,
  manualScore: number | null
): number {
  return manualScore ?? modelScore;
}

function mapBatchRow(row: BatchRow): ForecastImportBatchRecord {
  return {
    id: row.id,
    fileName: row.file_name,
    forecastYear: row.forecast_year,
    rowCount: row.row_count,
    contractCount: row.contract_count,
    measureCount: row.measure_count,
    sourceSheet: row.source_sheet,
    latestObservedYear: row.latest_observed_year,
    latestObservedMonth: row.latest_observed_month,
    importedBy: row.imported_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRunRow(row: RunRow): ForecastProjectionRunRecord {
  return {
    id: row.id,
    sourceBatchId: row.source_batch_id,
    forecastYear: row.forecast_year,
    status: row.status as ForecastProjectionRunRecord["status"],
    datasetType: row.dataset_type as ForecastProjectionRunRecord["datasetType"],
    asOfYear: row.as_of_year,
    asOfMonth: row.as_of_month,
    modelVersion: row.model_version,
    projectionCount: row.projection_count,
    notes: row.notes,
    importedBy: row.imported_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMeasureApprovalRow(row: MeasureApprovalRow): ForecastMeasureApprovalRecord {
  return {
    id: row.id,
    runId: row.run_id,
    measureNormalized: row.measure_normalized,
    measureDisplayName: row.measure_display_name,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectionRow(row: ProjectionRow): ForecastProjectionRecord {
  return {
    id: row.id,
    runId: row.run_id,
    forecastYear: row.forecast_year,
    contractId: row.contract_id,
    measureName: row.measure_name,
    measureDisplayName: row.measure_display_name,
    measureNormalized: row.measure_normalized,
    measureCode: row.measure_code,
    hlCode: row.hl_code,
    metricCategory: row.metric_category as ForecastProjectionRecord["metricCategory"],
    modelScore: row.model_score,
    manualScore: row.manual_score,
    finalScore: row.final_score,
    confidence: row.confidence,
    confidenceLabel: row.confidence_label as ForecastProjectionRecord["confidenceLabel"],
    trendSlope: row.trend_slope,
    seasonalityDelta: row.seasonality_delta,
    lastObservedYear: row.last_observed_year,
    lastObservedMonth: row.last_observed_month,
    lastObservedScore: row.last_observed_score,
    supportingPoints: row.supporting_points,
    notes: row.notes ?? [],
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMonthlyHistoryRow(row: MonthlyHistoryDbRow): ForecastMonthlyHistoryPoint {
  return {
    contractId: row.contract_id,
    measureDisplayName: row.measure_display_name,
    measureNormalized: row.measure_normalized,
    hlCode: row.hl_code,
    measureCode: row.measure_code,
    metricCategory: row.metric_category as ForecastMonthlyHistoryPoint["metricCategory"],
    year: row.data_year,
    month: row.data_month,
    normalizedMonth: row.normalized_month,
    rate: row.rate,
    numeratorAll: row.numerator_all,
    denominatorAll: row.denominator_all,
  };
}

async function insertInBatches<T extends Record<string, unknown>>(
  serviceClient: ServiceClient,
  table: keyof Database["public"]["Tables"],
  rows: T[]
) {
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
    if (batch.length === 0) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (serviceClient as any).from(table).insert(batch);
    if (error) throw new Error(error.message);
  }
}

export async function createForecastImportBatch(
  serviceClient: ServiceClient,
  input: {
    fileName: string;
    forecastYear: number;
    rowCount: number;
    contractCount: number;
    measureCount: number;
    sourceSheet: string | null;
    latestObservedYear: number | null;
    latestObservedMonth: number | null;
    importedBy: string | null;
  }
): Promise<ForecastImportBatchRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (serviceClient as any)
    .from("forecast_import_batches")
    .insert({
      file_name: input.fileName,
      forecast_year: input.forecastYear,
      row_count: input.rowCount,
      contract_count: input.contractCount,
      measure_count: input.measureCount,
      source_sheet: input.sourceSheet,
      latest_observed_year: input.latestObservedYear,
      latest_observed_month: input.latestObservedMonth,
      imported_by: input.importedBy,
    })
    .select()
    .single() as { data: BatchRow | null; error: Error | null };

  if (error || !data) throw new Error(error?.message ?? "Failed to create forecast import batch");
  return mapBatchRow(data);
}

export async function insertForecastMonthlyHistory(
  serviceClient: ServiceClient,
  batchId: string,
  rows: ImportedMonthlyMeasureRow[]
) {
  const inserts: MonthlyRow[] = rows.map((row) => ({
    batch_id: batchId,
    source_row_number: row.sourceRowNumber,
    hl_code: row.hlCode,
    contract_id: row.contractId,
    measure_name: row.measureName,
    measure_display_name: row.measureDisplayName,
    measure_normalized: row.measureNormalized,
    measure_code: row.measureCode,
    metric_category: row.metricCategory,
    data_year: row.year,
    data_month: row.month,
    normalized_month: row.normalizedMonth,
    rate: row.rate,
    numerator_all: row.numeratorAll,
    denominator_all: row.denominatorAll,
  }));

  await insertInBatches(serviceClient, "forecast_monthly_measure_history", inserts);
}

export async function createForecastProjectionRun(
  serviceClient: ServiceClient,
  input: {
    sourceBatchId: string | null;
    forecastYear: number;
    datasetType?: ForecastProjectionRunRecord["datasetType"];
    asOfYear: number | null;
    asOfMonth: number | null;
    projectionCount: number;
    notes?: string | null;
    importedBy: string | null;
    modelVersion?: string;
  }
): Promise<ForecastProjectionRunRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (serviceClient as any)
    .from("forecast_projection_runs")
    .insert({
      source_batch_id: input.sourceBatchId,
      forecast_year: input.forecastYear,
      dataset_type: input.datasetType ?? "non_cahps",
      as_of_year: input.asOfYear,
      as_of_month: input.asOfMonth,
      projection_count: input.projectionCount,
      notes: input.notes ?? null,
      imported_by: input.importedBy,
      model_version: input.modelVersion ?? MODEL_VERSION,
    })
    .select()
    .single() as { data: RunRow | null; error: Error | null };

  if (error || !data) throw new Error(error?.message ?? "Failed to create forecast projection run");
  return mapRunRow(data);
}

export async function insertForecastProjections(
  serviceClient: ServiceClient,
  input: {
    runId: string;
    forecastYear: number;
    projections: GlidepathProjection[];
    updatedBy: string | null;
  }
) {
  const inserts = input.projections.map((projection) => ({
    run_id: input.runId,
    forecast_year: input.forecastYear,
    contract_id: projection.contractId,
    measure_name: projection.measureName,
    measure_display_name: projection.measureDisplayName,
    measure_normalized: projection.measureNormalized,
    measure_code: projection.measureCode,
    hl_code: projection.hlCode,
    metric_category: projection.metricCategory,
    model_score: projection.modelScore,
    manual_score: null,
    final_score: resolveFinalProjectionScore(projection.modelScore, null),
    confidence: projection.confidence,
    confidence_label: projection.confidenceLabel,
    trend_slope: projection.trendSlope,
    seasonality_delta: projection.seasonalityDelta,
    last_observed_year: projection.lastObservedYear,
    last_observed_month: projection.lastObservedMonth,
    last_observed_score: projection.lastObservedScore,
    supporting_points: projection.supportingPoints,
    notes: projection.notes,
    updated_by: input.updatedBy,
  }));

  await insertInBatches(serviceClient, "forecast_year_end_projections", inserts);
}

export async function getAllMonthlyHistoryForBatch(
  serviceClient: ServiceClient,
  batchId: string
): Promise<ImportedMonthlyMeasureRow[]> {
  const rows: MonthlyHistoryDbRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await serviceClient
      .from("forecast_monthly_measure_history")
      .select("*")
      .eq("batch_id", batchId)
      .order("data_year", { ascending: true })
      .order("normalized_month", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows.map((row) => ({
    sourceRowNumber: row.source_row_number,
    hlCode: row.hl_code,
    contractId: row.contract_id,
    measureName: row.measure_name,
    measureDisplayName: row.measure_display_name,
    measureNormalized: row.measure_normalized,
    measureCode: row.measure_code,
    metricCategory: row.metric_category as ImportedMonthlyMeasureRow["metricCategory"],
    year: row.data_year,
    month: row.data_month,
    normalizedMonth: row.normalized_month,
    rate: row.rate,
    numeratorAll: row.numerator_all,
    denominatorAll: row.denominator_all,
  }));
}

export async function deleteForecastProjectionsForRun(
  serviceClient: ServiceClient,
  runId: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient as any)
    .from("forecast_year_end_projections")
    .delete()
    .eq("run_id", runId);
  if (error) throw new Error(error.message);
}

export async function updateForecastRunProjectionCount(
  serviceClient: ServiceClient,
  runId: string,
  projectionCount: number
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient as any)
    .from("forecast_projection_runs")
    .update({ projection_count: projectionCount })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

export async function listForecastMeasureApprovals(
  serviceClient: ServiceClient,
  runId: string
): Promise<ForecastMeasureApprovalRecord[]> {
  const { data, error } = await serviceClient
    .from("forecast_measure_approvals")
    .select("*")
    .eq("run_id", runId)
    .order("measure_display_name", { ascending: true });

  if (error) {
    if (isMissingMeasureApprovalsTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(mapMeasureApprovalRow);
}

export async function listForecastMeasureApprovalsForRuns(
  serviceClient: ServiceClient,
  input: {
    runIds: string[];
    measureNormalized?: string;
  }
): Promise<ForecastMeasureApprovalRecord[]> {
  const runIds = [...new Set(input.runIds)].filter(Boolean);
  if (runIds.length === 0) return [];

  let query = serviceClient
    .from("forecast_measure_approvals")
    .select("*")
    .in("run_id", runIds)
    .order("approved_at", { ascending: false });

  if (input.measureNormalized) {
    query = query.eq("measure_normalized", input.measureNormalized);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingMeasureApprovalsTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(mapMeasureApprovalRow);
}

export async function approveForecastMeasure(
  serviceClient: ServiceClient,
  input: {
    runId: string;
    measureNormalized: string;
    measureDisplayName: string;
    approvedBy: string;
  }
): Promise<ForecastMeasureApprovalRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (serviceClient as any)
    .from("forecast_measure_approvals")
    .upsert(
      {
        run_id: input.runId,
        measure_normalized: input.measureNormalized,
        measure_display_name: input.measureDisplayName,
        approved_by: input.approvedBy,
        approved_at: new Date().toISOString(),
      },
      { onConflict: "run_id,measure_normalized" }
    )
    .select()
    .single() as { data: MeasureApprovalRow | null; error: Error | null };

  if (error || !data) {
    if (isMissingMeasureApprovalsTableError(error)) {
      throw new Error(missingMeasureApprovalsTableMessage());
    }
    throw new Error(error?.message ?? "Failed to approve forecast measure");
  }
  return mapMeasureApprovalRow(data);
}

export async function deleteForecastMeasureApprovalsForRun(
  serviceClient: ServiceClient,
  runId: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient as any)
    .from("forecast_measure_approvals")
    .delete()
    .eq("run_id", runId);

  if (error) {
    if (isMissingMeasureApprovalsTableError(error)) return;
    throw new Error(error.message);
  }
}

export async function deleteForecastMeasureApprovalsForMeasures(
  serviceClient: ServiceClient,
  input: {
    runId: string;
    measureNormalized: string[];
  }
) {
  if (input.measureNormalized.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient as any)
    .from("forecast_measure_approvals")
    .delete()
    .eq("run_id", input.runId)
    .in("measure_normalized", [...new Set(input.measureNormalized)]);

  if (error) {
    if (isMissingMeasureApprovalsTableError(error)) return;
    throw new Error(error.message);
  }
}

export async function listForecastProjectionRuns(
  serviceClient: ServiceClient,
  forecastYear?: number
): Promise<ForecastProjectionRunRecord[]> {
  let query = serviceClient
    .from("forecast_projection_runs")
    .select("*")
    .order("created_at", { ascending: false });

  if (forecastYear !== undefined) {
    query = query.eq("forecast_year", forecastYear);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRunRow);
}

export async function getForecastRun(
  serviceClient: ServiceClient,
  runId: string
): Promise<ForecastProjectionRunRecord | null> {
  const { data, error } = await serviceClient
    .from("forecast_projection_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapRunRow(data) : null;
}

export async function getLatestForecastRunForYear(
  serviceClient: ServiceClient,
  forecastYear: number,
  status?: ForecastProjectionRunRecord["status"],
  datasetType?: ForecastProjectionRunRecord["datasetType"]
): Promise<ForecastProjectionRunRecord | null> {
  let query = serviceClient
    .from("forecast_projection_runs")
    .select("*")
    .eq("forecast_year", forecastYear)
    .order("created_at", { ascending: false })
    .limit(1);

  if (status) {
    query = query.eq("status", status);
  }
  if (datasetType) {
    query = query.eq("dataset_type", datasetType);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRunRow(data) : null;
}

export async function getForecastProjectionsForRun(
  serviceClient: ServiceClient,
  runId: string,
  options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    contractIds?: string[];
    measureNormalized?: string;
  }
): Promise<{ rows: ForecastProjectionRecord[]; totalCount: number }> {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, Math.min(500, options?.pageSize ?? 100));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = options?.search?.trim() ?? "";
  const contractIds = options?.contractIds?.filter((value) => value.trim().length > 0) ?? [];
  const measureNormalized = options?.measureNormalized?.trim() ?? "";

  let query = serviceClient
    .from("forecast_year_end_projections")
    .select("*", { count: "exact" })
    .eq("run_id", runId)
    // Drop PBP segment/suffix contract IDs (e.g. H0838-P) and repeating-digit
    // dummy/test IDs (H0000, H1111, … H9999) — these are not forecastable
    // contracts. Belt-and-suspenders for runs imported before contract
    // eligibility filtering was added at import time.
    .not("contract_id", "ilike", "%-%")
    .not("contract_id", "in", `(${DUMMY_CONTRACT_IDS.join(",")})`)
    // Drop carry-forward rows (no observations in this run's stars year) that
    // would otherwise echo an earlier stars year's final score.
    .gt("supporting_points", 0);

  if (contractIds.length > 0) {
    query = query.in("contract_id", contractIds);
  }

  if (measureNormalized) {
    query = query.eq("measure_normalized", measureNormalized);
  }

  if (search) {
    const escaped = search.replace(/[%_]/g, "\\$&").replace(/,/g, " ");
    query = query.or(
      `contract_id.ilike.%${escaped}%,measure_display_name.ilike.%${escaped}%`
    );
  }

  const { data, error, count } = await query
    .order("contract_id", { ascending: true })
    .order("measure_display_name", { ascending: true })
    .range(from, to);

  if (error) throw new Error(error.message);
  return {
    rows: (data ?? []).map(mapProjectionRow),
    totalCount: count ?? 0,
  };
}

export async function getPriorYearFinalScoresForProjections(
  serviceClient: ServiceClient,
  input: {
    sourceBatchId: string | null;
    forecastYear: number;
    projections: ForecastProjectionRecord[];
  }
): Promise<Map<string, { score: number; year: number; month: number }>> {
  if (!input.sourceBatchId || input.projections.length === 0) return new Map();

  const priorYear = input.forecastYear - 1;
  const contractIds = [...new Set(input.projections.map((row) => row.contractId))];
  const measures = [...new Set(input.projections.map((row) => row.measureNormalized))];
  const rows: MonthlyHistoryDbRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await serviceClient
      .from("forecast_monthly_measure_history")
      .select("*")
      .eq("batch_id", input.sourceBatchId)
      .eq("data_year", priorYear)
      .in("contract_id", contractIds)
      .in("measure_normalized", measures)
      .not("rate", "is", null)
      .order("normalized_month", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const scores = new Map<string, { score: number; year: number; month: number }>();
  for (const row of rows) {
    if (row.rate === null) continue;
    const key = `${row.contract_id}::${row.measure_normalized}`;
    const existing = scores.get(key);
    if (!existing || row.normalized_month >= existing.month) {
      scores.set(key, {
        score: row.rate,
        year: row.data_year,
        month: row.normalized_month,
      });
    }
  }

  return scores;
}

export async function getAllForecastProjectionsForRun(
  serviceClient: ServiceClient,
  runId: string,
  options?: {
    search?: string;
    contractIds?: string[];
    measureNormalized?: string;
  }
): Promise<ForecastProjectionRecord[]> {
  const pageSize = 500;
  let page = 1;
  const rows: ForecastProjectionRecord[] = [];

  while (true) {
    const result = await getForecastProjectionsForRun(serviceClient, runId, {
      page,
      pageSize,
      search: options?.search,
      contractIds: options?.contractIds,
      measureNormalized: options?.measureNormalized,
    });
    rows.push(...result.rows);
    if (rows.length >= result.totalCount || result.rows.length < pageSize) break;
    page += 1;
  }

  return rows;
}

export async function getForecastProjectionDetail(
  serviceClient: ServiceClient,
  input: {
    runId: string;
    contractId: string;
    measureNormalized: string;
  }
): Promise<ForecastProjectionDetailRecord | null> {
  const run = await getForecastRun(serviceClient, input.runId);
  if (!run) return null;

  const { data: projectionData, error: projectionError } = await serviceClient
    .from("forecast_year_end_projections")
    .select("*")
    .eq("run_id", input.runId)
    .eq("contract_id", input.contractId)
    .eq("measure_normalized", input.measureNormalized)
    .maybeSingle();

  if (projectionError) throw new Error(projectionError.message);
  if (!projectionData) return null;

  const history = run.sourceBatchId
    ? await serviceClient
        .from("forecast_monthly_measure_history")
        .select("*")
        .eq("batch_id", run.sourceBatchId)
        .eq("contract_id", input.contractId)
        .eq("measure_normalized", input.measureNormalized)
        .order("data_year", { ascending: true })
        .order("normalized_month", { ascending: true })
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          return (data ?? []).map(mapMonthlyHistoryRow);
        })
    : [];

  return {
    runId: input.runId,
    sourceBatchId: run.sourceBatchId,
    projection: mapProjectionRow(projectionData),
    history,
  };
}

export async function updateForecastProjectionOverrides(
  serviceClient: ServiceClient,
  input: {
    updates: Array<{ id: string; manualScore: number | null }>;
    updatedBy: string | null;
  }
): Promise<string[]> {
  const updatedMeasures = new Set<string>();

  for (const update of input.updates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: existingError } = await (serviceClient as any)
      .from("forecast_year_end_projections")
      .select("model_score, measure_normalized")
      .eq("id", update.id)
      .single() as { data: { model_score: number; measure_normalized: string } | null; error: Error | null };

    if (existingError || !existing) {
      throw new Error(existingError?.message ?? `Projection ${update.id} not found`);
    }

    const finalScore = resolveFinalProjectionScore(
      existing.model_score,
      update.manualScore
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (serviceClient as any)
      .from("forecast_year_end_projections")
      .update({
        manual_score: update.manualScore,
        final_score: finalScore,
        updated_by: input.updatedBy,
      })
      .eq("id", update.id);

    if (error) throw new Error(error.message);
    updatedMeasures.add(existing.measure_normalized);
  }

  return [...updatedMeasures];
}

export async function approveForecastRun(
  serviceClient: ServiceClient,
  runId: string,
  userId: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (serviceClient as any)
    .from("forecast_projection_runs")
    .update({
      status: "approved",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) throw new Error(error.message);
}
