import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { hasOfficialTechNotesCutPoints } from "./official-cut-points";
import { uniqueContractOptions } from "./store";
import type { OfficialStarRow, OfficialSummaryRow } from "./official-row-types";
import type {
  ParsedPlanPreviewImprovement,
  ParsedPlanPreviewOfficialStar,
  ParsedPlanPreviewOfficialSummary,
  PlanPreviewContractOption,
  PlanPreviewOfficialAccrual,
  PlanPreviewOfficialRatingType,
  PlanPreviewOfficialStarStatus,
} from "./types";

export type { OfficialStarRow, OfficialSummaryRow } from "./official-row-types";

type ServiceClient = SupabaseClient<Database>;

const INSERT_BATCH_SIZE = 500;

async function upsertChunks(
  client: ServiceClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any).from(table).upsert(rows.slice(offset, offset + INSERT_BATCH_SIZE), {
      onConflict,
    });
    if (error) throw new Error(error.message);
  }
}

export async function upsertPlanPreviewOfficialStars(
  client: ServiceClient,
  input: { batchId: string; starsYear: number; rows: ParsedPlanPreviewOfficialStar[] }
): Promise<void> {
  await upsertChunks(
    client,
    "plan_preview_official_stars",
    input.rows.map((row) => ({
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
      star: row.star,
      status: row.status,
    })),
    "stars_year,contract_id,measure_code"
  );
}

export async function overlayPlanPreviewQiSignificance(
  client: ServiceClient,
  input: { batchId: string; starsYear: number; rows: ParsedPlanPreviewImprovement[] }
): Promise<void> {
  const contractIds = [...new Set(input.rows.map((row) => row.contractId))];
  const existing = new Map<string, { raw_value: string; star: number | null; status: string }>();
  if (contractIds.length > 0) {
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await client
        .from("plan_preview_official_stars")
        .select("contract_id, measure_code, raw_value, star, status")
        .eq("stars_year", input.starsYear)
        .in("contract_id", contractIds)
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      const page = (data ?? []) as Array<{
        contract_id: string;
        measure_code: string;
        raw_value: string;
        star: number | null;
        status: string;
      }>;
      for (const row of page) {
        existing.set(`${row.contract_id}|${row.measure_code}`, {
          raw_value: row.raw_value,
          star: row.star,
          status: row.status,
        });
      }
      if (page.length < pageSize) break;
      from += pageSize;
    }
  }

  await upsertChunks(
    client,
    "plan_preview_official_stars",
    input.rows.map((row) => {
      const prior = existing.get(`${row.contractId}|${row.measureCode}`);
      return {
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
        raw_value: prior?.raw_value ?? row.qiSignificance,
        star: prior?.star ?? null,
        status: prior?.status ?? "other",
        qi_significance: row.qiSignificance,
      };
    }),
    "stars_year,contract_id,measure_code"
  );
}

export function officialSummaryKey(contractId: string, ratingType: string): string {
  return `${contractId}|${ratingType}`;
}

export function withPreservedImprovementScore<T extends Record<string, unknown>>(
  row: T,
  contractId: string,
  ratingType: string,
  existing: Map<string, number>
): T {
  const preserved = existing.get(officialSummaryKey(contractId, ratingType));
  return preserved == null ? row : { ...row, improvement_score: preserved };
}

async function loadExistingImprovementScores(
  client: ServiceClient,
  starsYear: number,
  contractIds: string[]
): Promise<Map<string, number>> {
  const existing = new Map<string, number>();
  const unique = [...new Set(contractIds.filter(Boolean))];
  const pageSize = 200;
  for (let offset = 0; offset < unique.length; offset += pageSize) {
    const { data, error } = await client
      .from("plan_preview_official_summary")
      .select("contract_id, rating_type, improvement_score")
      .eq("stars_year", starsYear)
      .in("contract_id", unique.slice(offset, offset + pageSize))
      .not("improvement_score", "is", null);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{
      contract_id: string;
      rating_type: string;
      improvement_score: number | null;
    }>) {
      if (row.improvement_score == null) continue;
      existing.set(officialSummaryKey(row.contract_id, row.rating_type), Number(row.improvement_score));
    }
  }
  return existing;
}

export async function upsertPlanPreviewOfficialSummary(
  client: ServiceClient,
  input: { batchId: string; starsYear: number; rows: ParsedPlanPreviewOfficialSummary[] }
): Promise<void> {
  const existingScores = await loadExistingImprovementScores(
    client,
    input.starsYear,
    input.rows.map((row) => row.contractId)
  );
  await upsertChunks(
    client,
    "plan_preview_official_summary",
    input.rows.map((row) =>
      withPreservedImprovementScore(
        {
          batch_id: input.batchId,
          stars_year: input.starsYear,
          contract_id: row.contractId,
          rating_type: row.ratingType,
          organization_marketing_name: row.organizationMarketingName,
          contract_name: row.contractName,
          parent_organization: row.parentOrganization,
          contract_type: row.contractType,
          snp_plans: row.snpPlans,
          disaster_year_1: row.disasterYear1,
          disaster_pct_1: row.disasterPct1,
          disaster_year_2: row.disasterYear2,
          disaster_pct_2: row.disasterPct2,
          measures_required: row.measuresRequired,
          measures_missing: row.measuresMissing,
          measures_rated: row.measuresRated,
          calculated_mean: row.calculatedMean,
          calculated_variance: row.calculatedVariance,
          score_percentile_rank: row.scorePercentileRank,
          variance_percentile_rank: row.variancePercentileRank,
          variance_category: row.varianceCategory,
          reward_factor: row.rewardFactor,
          interim_summary: row.interimSummary,
          fac: row.fac,
          cai_value: row.caiValue,
          final_summary: row.finalSummary,
          improvement_usage: row.improvementUsage,
          new_measure_usage: row.newMeasureUsage,
          final_rating: row.finalRating,
          part_c_summary_rating: row.partCSummaryRating,
          part_d_summary_rating: row.partDSummaryRating,
        },
        row.contractId,
        row.ratingType,
        existingScores
      )
    ),
    "stars_year,contract_id,rating_type"
  );
}

export async function overlayPlanPreviewImprovementScores(
  client: ServiceClient,
  input: { starsYear: number; rows: ParsedPlanPreviewImprovement[] }
): Promise<void> {
  const byContract = new Map<string, { ratingType: "part_c" | "part_d"; score: number }>();
  for (const row of input.rows) {
    if (row.improvementScore === null) continue;
    byContract.set(row.contractId, { ratingType: row.ratingType, score: row.improvementScore });
  }
  for (const [contractId, value] of byContract) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any)
      .from("plan_preview_official_summary")
      .update({ improvement_score: value.score })
      .eq("stars_year", input.starsYear)
      .eq("contract_id", contractId)
      .eq("rating_type", value.ratingType);
    if (error) throw new Error(error.message);
  }
}

async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => Promise<T[]>
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const page = await loadPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function getPlanPreviewOfficialStars(
  client: ServiceClient,
  starsYear: number,
  contractId?: string
): Promise<OfficialStarRow[]> {
  const year = Math.round(starsYear);
  const raw = await fetchAllPages(async (from, to) => {
    let query = client
      .from("plan_preview_official_stars")
      .select(
        "contract_id, contract_name, organization_marketing_name, parent_organization, measure_code, measure_display_name, measure_normalized, metric_category, star, status, qi_significance"
      )
      .eq("stars_year", year)
      .order("contract_id", { ascending: true })
      .order("measure_code", { ascending: true })
      .range(from, to);
    if (contractId) query = query.eq("contract_id", contractId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      contract_id: string;
      contract_name: string | null;
      organization_marketing_name: string | null;
      parent_organization: string | null;
      measure_code: string;
      measure_display_name: string;
      measure_normalized: string;
      metric_category: string;
      star: number | null;
      status: string;
      qi_significance: string | null;
    }>;
  });

  return raw.map((row) => ({
    contractId: row.contract_id,
    contractName: row.contract_name,
    organizationMarketingName: row.organization_marketing_name,
    parentOrganization: row.parent_organization,
    measureCode: row.measure_code,
    measureDisplayName: row.measure_display_name,
    measureNormalized: row.measure_normalized,
    metricCategory: row.metric_category,
    star: row.star === null || row.star === undefined ? null : Number(row.star),
    status: row.status as PlanPreviewOfficialStarStatus,
    qiSignificance: row.qi_significance,
  }));
}

export async function getPlanPreviewOfficialSummaries(
  client: ServiceClient,
  starsYear: number,
  contractId?: string
): Promise<OfficialSummaryRow[]> {
  let query = client
    .from("plan_preview_official_summary")
    .select()
    .eq("stars_year", Math.round(starsYear));
  if (contractId) query = query.eq("contract_id", contractId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    contractId: String(row.contract_id),
    contractName: (row.contract_name as string | null) ?? null,
    organizationMarketingName: (row.organization_marketing_name as string | null) ?? null,
    parentOrganization: (row.parent_organization as string | null) ?? null,
    ratingType: row.rating_type as PlanPreviewOfficialRatingType,
    contractType: (row.contract_type as string | null) ?? null,
    snpPlans: (row.snp_plans as string | null) ?? null,
    disasterYear1: row.disaster_year_1 == null ? null : Number(row.disaster_year_1),
    disasterPct1: row.disaster_pct_1 == null ? null : Number(row.disaster_pct_1),
    disasterYear2: row.disaster_year_2 == null ? null : Number(row.disaster_year_2),
    disasterPct2: row.disaster_pct_2 == null ? null : Number(row.disaster_pct_2),
    measuresRequired: (row.measures_required as string | null) ?? null,
    measuresMissing: row.measures_missing == null ? null : Number(row.measures_missing),
    measuresRated: row.measures_rated == null ? null : Number(row.measures_rated),
    calculatedMean: row.calculated_mean == null ? null : Number(row.calculated_mean),
    calculatedVariance: row.calculated_variance == null ? null : Number(row.calculated_variance),
    scorePercentileRank: row.score_percentile_rank == null ? null : Number(row.score_percentile_rank),
    variancePercentileRank:
      row.variance_percentile_rank == null ? null : Number(row.variance_percentile_rank),
    varianceCategory: (row.variance_category as string | null) ?? null,
    rewardFactor: row.reward_factor == null ? null : Number(row.reward_factor),
    interimSummary: row.interim_summary == null ? null : Number(row.interim_summary),
    fac: (row.fac as string | null) ?? null,
    caiValue: row.cai_value == null ? null : Number(row.cai_value),
    finalSummary: row.final_summary == null ? null : Number(row.final_summary),
    improvementUsage: (row.improvement_usage as string | null) ?? null,
    newMeasureUsage: (row.new_measure_usage as string | null) ?? null,
    finalRating: row.final_rating == null ? null : Number(row.final_rating),
    partCSummaryRating: row.part_c_summary_rating == null ? null : Number(row.part_c_summary_rating),
    partDSummaryRating: row.part_d_summary_rating == null ? null : Number(row.part_d_summary_rating),
    improvementScore: row.improvement_score == null ? null : Number(row.improvement_score),
  }));
}

export async function listPlanPreviewOfficialContracts(
  client: ServiceClient,
  starsYear: number
): Promise<PlanPreviewContractOption[]> {
  const rows = await getPlanPreviewOfficialStars(client, starsYear);
  return uniqueContractOptions(
    rows.map((row) => ({
      contract_id: row.contractId,
      contract_name: row.contractName,
      organization_marketing_name: row.organizationMarketingName,
      parent_organization: row.parentOrganization,
    }))
  );
}

export async function getPlanPreviewOfficialAccrual(
  client: ServiceClient,
  starsYear: number
): Promise<PlanPreviewOfficialAccrual> {
  const year = Math.round(starsYear);
  const query = `
    SELECT
      (SELECT COUNT(DISTINCT contract_id) FROM plan_preview_official_stars WHERE stars_year = ${year})::int AS star_contract_count,
      (SELECT COUNT(DISTINCT measure_code) FROM plan_preview_official_stars WHERE stars_year = ${year})::int AS star_measure_count,
      (SELECT COUNT(DISTINCT contract_id) FROM plan_preview_official_summary WHERE stars_year = ${year})::int AS summary_contract_count,
      (SELECT COUNT(DISTINCT contract_id) FROM plan_preview_official_stars WHERE stars_year = ${year} AND qi_significance IS NOT NULL)::int AS qi_contract_count
  `;
  const { data, error } = await (client.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>)("exec_raw_sql", { query });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : null) as {
    star_contract_count: number;
    star_measure_count: number;
    summary_contract_count: number;
    qi_contract_count: number;
  } | null;
  return {
    starContractCount: row?.star_contract_count ?? 0,
    starMeasureCount: row?.star_measure_count ?? 0,
    summaryContractCount: row?.summary_contract_count ?? 0,
    qiContractCount: row?.qi_contract_count ?? 0,
    officialCutPointsLoaded: hasOfficialTechNotesCutPoints(year),
  };
}
