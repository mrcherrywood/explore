import type { SupabaseClient } from "@supabase/supabase-js";

import { getMeasureByNormalizedName } from "@/lib/band-movement/analysis";
import type { Database } from "@/lib/supabase/database.types";
import type {
  ParsedPlanPreviewDecimalScore,
  PlanPreviewExportRow,
  PlanPreviewMeasureStatus,
} from "./types";

type ServiceClient = SupabaseClient<Database>;
type MeasureScoreInsert = Database["public"]["Tables"]["plan_preview_measure_scores"]["Insert"];

const INSERT_BATCH_SIZE = 500;

function formatDecimalRawValue(score: number): string {
  return score.toFixed(8).replace(/\.?0+$/, "");
}

async function fetchExistingMeasureKeys(
  client: ServiceClient,
  starsYear: number,
  rows: ParsedPlanPreviewDecimalScore[]
): Promise<
  Map<
    string,
    {
      raw_value: string;
      score: number | null;
      status: string;
      measure_name: string;
      measure_display_name: string;
      measure_normalized: string;
      metric_category: string;
    }
  >
> {
  const contractIds = [...new Set(rows.map((row) => row.contractId))];
  const existing = new Map<
    string,
    {
      raw_value: string;
      score: number | null;
      status: string;
      measure_name: string;
      measure_display_name: string;
      measure_normalized: string;
      metric_category: string;
    }
  >();
  if (contractIds.length === 0) return existing;

  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from("plan_preview_measure_scores")
      .select(
        "contract_id, measure_code, raw_value, score, status, measure_name, measure_display_name, measure_normalized, metric_category"
      )
      .eq("stars_year", starsYear)
      .in("contract_id", contractIds)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as Array<{
      contract_id: string;
      measure_code: string;
      raw_value: string;
      score: number | null;
      status: string;
      measure_name: string;
      measure_display_name: string;
      measure_normalized: string;
      metric_category: string;
    }>;
    for (const row of page) {
      existing.set(`${row.contract_id}|${row.measure_code}`, {
        raw_value: row.raw_value,
        score: row.score,
        status: row.status,
        measure_name: row.measure_name,
        measure_display_name: row.measure_display_name,
        measure_normalized: row.measure_normalized,
        metric_category: row.metric_category,
      });
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return existing;
}

/**
 * Overlay printed decimal scores from a domain workbook onto accrued measure
 * rows. Preserves existing raw_value/score/status when a measure_data row
 * already exists; inserts a scored stub when it does not.
 */
export async function upsertPlanPreviewDecimalScores(
  client: ServiceClient,
  input: { batchId: string; starsYear: number; rows: ParsedPlanPreviewDecimalScore[] }
): Promise<void> {
  const existing = await fetchExistingMeasureKeys(client, input.starsYear, input.rows);

  const inserts: MeasureScoreInsert[] = input.rows.map((row) => {
    const planStar =
      row.decimalSource === "cahps"
        ? row.planStar !== undefined && row.planStar !== null
          ? row.planStar
          : null
        : null;
    const prior = existing.get(`${row.contractId}|${row.measureCode}`);
    if (prior) {
      // Prefer the incoming resolved identity when the prior row still carries
      // an unmatched VariableName stub (e.g. gnc_comp) from an earlier CAHPS
      // upload; otherwise keep the measure_data names.
      const incomingInUniverse = getMeasureByNormalizedName(row.measureNormalized) !== null;
      const priorInUniverse = getMeasureByNormalizedName(prior.measure_normalized) !== null;
      const useIncomingNames = incomingInUniverse && !priorInUniverse;
      return {
        batch_id: input.batchId,
        stars_year: input.starsYear,
        contract_id: row.contractId,
        organization_marketing_name: row.organizationMarketingName,
        contract_name: row.contractName,
        parent_organization: row.parentOrganization,
        measure_code: row.measureCode,
        measure_name: useIncomingNames ? row.measureName : prior.measure_name,
        measure_display_name: useIncomingNames
          ? row.measureDisplayName
          : prior.measure_display_name,
        measure_normalized: useIncomingNames
          ? row.measureNormalized
          : prior.measure_normalized,
        metric_category: useIncomingNames ? row.metricCategory : prior.metric_category,
        raw_value: prior.raw_value,
        score: prior.score,
        status: prior.status,
        decimal_score: row.decimalScore,
        decimal_source: row.decimalSource,
        plan_star: planStar,
      };
    }

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
      raw_value: formatDecimalRawValue(row.decimalScore),
      score: row.decimalScore,
      status: "scored",
      decimal_score: row.decimalScore,
      decimal_source: row.decimalSource,
      plan_star: planStar,
    };
  });

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

/** All accrued measure rows (including sentinel statuses) for measure_data export. */
export async function getPlanPreviewExportRows(
  client: ServiceClient,
  starsYear: number
): Promise<PlanPreviewExportRow[]> {
  const pageSize = 1000;
  const rows: PlanPreviewExportRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from("plan_preview_measure_scores")
      .select(
        "contract_id, organization_marketing_name, contract_name, parent_organization, measure_code, measure_display_name, raw_value, score, status, decimal_score, decimal_source"
      )
      .eq("stars_year", starsYear)
      .order("contract_id", { ascending: true })
      .order("measure_code", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as Array<{
      contract_id: string;
      organization_marketing_name: string | null;
      contract_name: string | null;
      parent_organization: string | null;
      measure_code: string;
      measure_display_name: string;
      raw_value: string;
      score: number | null;
      status: string;
      decimal_score: number | null;
      decimal_source: string | null;
    }>;
    for (const row of page) {
      rows.push({
        contractId: row.contract_id,
        organizationMarketingName: row.organization_marketing_name,
        contractName: row.contract_name,
        parentOrganization: row.parent_organization,
        measureCode: row.measure_code,
        measureDisplayName: row.measure_display_name,
        rawValue: row.raw_value,
        score: row.score === null ? null : Number(row.score),
        status: row.status as PlanPreviewMeasureStatus,
        decimalScore: row.decimal_score === null ? null : Number(row.decimal_score),
        decimalSource: row.decimal_source,
      });
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}
