import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type {
  ParsedPlanPreviewCaiRow,
  ParsedPlanPreviewMeasureScore,
  PlanPreviewAccrualSummary,
  PlanPreviewBatchRecord,
  PlanPreviewFileType,
} from "./types";

type ServiceClient = SupabaseClient<Database>;
type BatchRow = Database["public"]["Tables"]["plan_preview_upload_batches"]["Row"];
type MeasureScoreInsert = Database["public"]["Tables"]["plan_preview_measure_scores"]["Insert"];
type CaiInsert = Database["public"]["Tables"]["plan_preview_cai"]["Insert"];

const INSERT_BATCH_SIZE = 500;

function mapBatchRow(row: BatchRow): PlanPreviewBatchRecord {
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: row.file_type as PlanPreviewFileType,
    starsYear: row.stars_year,
    sourceSheet: row.source_sheet,
    detectedStarsYear: row.detected_stars_year,
    rowCount: row.row_count,
    contractCount: row.contract_count,
    measureCount: row.measure_count,
    importedBy: row.imported_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createPlanPreviewBatch(
  client: ServiceClient,
  input: {
    fileName: string;
    fileType: PlanPreviewFileType;
    starsYear: number;
    sourceSheet: string | null;
    detectedStarsYear: number | null;
    rowCount: number;
    contractCount: number;
    measureCount: number;
    importedBy: string | null;
  }
): Promise<PlanPreviewBatchRecord> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("plan_preview_upload_batches")
    .insert({
      file_name: input.fileName,
      file_type: input.fileType,
      stars_year: input.starsYear,
      source_sheet: input.sourceSheet,
      detected_stars_year: input.detectedStarsYear,
      row_count: input.rowCount,
      contract_count: input.contractCount,
      measure_count: input.measureCount,
      imported_by: input.importedBy,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapBatchRow(data);
}

export async function upsertPlanPreviewMeasureScores(
  client: ServiceClient,
  input: { batchId: string; starsYear: number; rows: ParsedPlanPreviewMeasureScore[] }
): Promise<void> {
  const inserts: MeasureScoreInsert[] = input.rows.map((row) => ({
    batch_id: input.batchId,
    stars_year: input.starsYear,
    contract_id: row.contractId,
    organization_marketing_name: row.organizationMarketingName,
    contract_name: row.contractName,
    parent_organization: row.parentOrganization,
    measure_code: row.measureCode,
    measure_name: row.measureName,
    measure_display_name: row.measureDisplayName,
    measure_normalized: row.measureNormalized,
    metric_category: row.metricCategory,
    raw_value: row.rawValue,
    score: row.score,
    status: row.status,
  }));

  for (let offset = 0; offset < inserts.length; offset += INSERT_BATCH_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any)
      .from("plan_preview_measure_scores")
      .upsert(inserts.slice(offset, offset + INSERT_BATCH_SIZE), {
        onConflict: "stars_year,contract_id,measure_code",
      });
    if (error) throw new Error(error.message);
  }
}

export async function upsertPlanPreviewCai(
  client: ServiceClient,
  input: { batchId: string; starsYear: number; rows: ParsedPlanPreviewCaiRow[] }
): Promise<void> {
  const inserts: CaiInsert[] = input.rows.map((row) => ({
    batch_id: input.batchId,
    stars_year: input.starsYear,
    contract_id: row.contractId,
    organization_marketing_name: row.organizationMarketingName,
    contract_name: row.contractName,
    parent_organization: row.parentOrganization,
    puerto_rico_only: row.puertoRicoOnly,
    contract_type: row.contractType,
    part_d_offered: row.partDOffered,
    enrolled: row.enrolled,
    num_lis_de: row.numLisDe,
    num_disabled: row.numDisabled,
    pct_lis_de: row.pctLisDe,
    pct_disabled: row.pctDisabled,
    part_c_lis_de_group: row.partCLisDeGroup,
    part_c_disabled_quintile: row.partCDisabledQuintile,
    part_c_fac: row.partCFac,
    part_c_cai: row.partCCai,
    part_d_mapd_lis_de_group: row.partDMapdLisDeGroup,
    part_d_mapd_disabled_quintile: row.partDMapdDisabledQuintile,
    part_d_mapd_fac: row.partDMapdFac,
    part_d_mapd_cai: row.partDMapdCai,
    part_d_pdp_lis_de_quartile: row.partDPdpLisDeQuartile,
    part_d_pdp_disabled_quartile: row.partDPdpDisabledQuartile,
    part_d_pdp_fac: row.partDPdpFac,
    part_d_pdp_cai: row.partDPdpCai,
    overall_lis_de_group: row.overallLisDeGroup,
    overall_disabled_quintile: row.overallDisabledQuintile,
    overall_fac: row.overallFac,
    overall_cai: row.overallCai,
  }));

  for (let offset = 0; offset < inserts.length; offset += INSERT_BATCH_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any)
      .from("plan_preview_cai")
      .upsert(inserts.slice(offset, offset + INSERT_BATCH_SIZE), {
        onConflict: "stars_year,contract_id",
      });
    if (error) throw new Error(error.message);
  }
}

export async function listPlanPreviewBatches(
  client: ServiceClient,
  starsYear?: number
): Promise<PlanPreviewBatchRecord[]> {
  let query = client
    .from("plan_preview_upload_batches")
    .select()
    .order("created_at", { ascending: false });
  if (starsYear !== undefined) {
    query = query.eq("stars_year", starsYear);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBatchRow);
}

export async function listPlanPreviewStarsYears(client: ServiceClient): Promise<number[]> {
  const { data, error } = await client
    .from("plan_preview_upload_batches")
    .select("stars_year");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ stars_year: number }>;
  return [...new Set(rows.map((row) => row.stars_year))].sort((a, b) => b - a);
}

export type PlanPreviewScoredRow = {
  contractId: string;
  contractName: string | null;
  organizationMarketingName: string | null;
  parentOrganization: string | null;
  measureCode: string;
  measureDisplayName: string;
  measureNormalized: string;
  score: number;
};

export async function getPlanPreviewScoredRows(
  client: ServiceClient,
  starsYear: number
): Promise<PlanPreviewScoredRow[]> {
  const pageSize = 1000;
  const rows: PlanPreviewScoredRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from("plan_preview_measure_scores")
      .select(
        "contract_id, contract_name, organization_marketing_name, parent_organization, measure_code, measure_display_name, measure_normalized, score"
      )
      .eq("stars_year", starsYear)
      .eq("status", "scored")
      .order("contract_id", { ascending: true })
      .order("measure_code", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as Array<{
      contract_id: string;
      contract_name: string | null;
      organization_marketing_name: string | null;
      parent_organization: string | null;
      measure_code: string;
      measure_display_name: string;
      measure_normalized: string;
      score: number | null;
    }>;
    for (const row of page) {
      if (row.score === null) continue;
      rows.push({
        contractId: row.contract_id,
        contractName: row.contract_name,
        organizationMarketingName: row.organization_marketing_name,
        parentOrganization: row.parent_organization,
        measureCode: row.measure_code,
        measureDisplayName: row.measure_display_name,
        measureNormalized: row.measure_normalized,
        score: Number(row.score),
      });
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

/** Overall MA-PD and Part C CAI per contract from the uploaded CAI file. */
export async function getPlanPreviewCaiByContract(
  client: ServiceClient,
  starsYear: number
): Promise<{ overall: Record<string, number>; partC: Record<string, number> }> {
  const { data, error } = await client
    .from("plan_preview_cai")
    .select("contract_id, overall_cai, part_c_cai")
    .eq("stars_year", starsYear);

  if (error) throw new Error(error.message);
  const overall: Record<string, number> = {};
  const partC: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{
    contract_id: string;
    overall_cai: number | null;
    part_c_cai: number | null;
  }>) {
    if (row.overall_cai !== null) overall[row.contract_id] = Number(row.overall_cai);
    if (row.part_c_cai !== null) partC[row.contract_id] = Number(row.part_c_cai);
  }
  return { overall, partC };
}

export async function getPlanPreviewAccrualSummary(
  client: ServiceClient,
  starsYear: number
): Promise<PlanPreviewAccrualSummary> {
  const year = Math.round(starsYear);
  const query = `
    SELECT
      (SELECT COUNT(DISTINCT contract_id) FROM plan_preview_measure_scores WHERE stars_year = ${year})::int AS contract_count,
      (SELECT COUNT(DISTINCT measure_code) FROM plan_preview_measure_scores WHERE stars_year = ${year})::int AS measure_count,
      (SELECT COUNT(*) FROM plan_preview_measure_scores WHERE stars_year = ${year} AND status = 'scored')::int AS scored_value_count,
      (SELECT COUNT(DISTINCT contract_id) FROM plan_preview_cai WHERE stars_year = ${year})::int AS cai_contract_count
  `;

  const { data, error } = await (client.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("exec_raw_sql", { query });
  if (error) throw new Error(error.message);

  const row = (Array.isArray(data) ? data[0] : null) as {
    contract_count: number;
    measure_count: number;
    scored_value_count: number;
    cai_contract_count: number;
  } | null;

  const batches = await listPlanPreviewBatches(client, year);

  return {
    starsYear: year,
    contractCount: row?.contract_count ?? 0,
    measureCount: row?.measure_count ?? 0,
    scoredValueCount: row?.scored_value_count ?? 0,
    caiContractCount: row?.cai_contract_count ?? 0,
    batchCount: batches.length,
    lastUploadAt: batches[0]?.createdAt ?? null,
  };
}
