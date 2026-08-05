import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import type { ParsedPlanPreviewCahpsAdjustedStar } from "./types";

type ServiceClient = SupabaseClient<Database>;

const INSERT_BATCH_SIZE = 500;

export type PlanPreviewCahpsAdjustedStarRow = {
  contractId: string;
  measureNormalized: string;
  measureCode: string;
  measureDisplayName: string;
  adjustedBaseStar: number;
};

export async function upsertPlanPreviewCahpsAdjustedStars(
  client: ServiceClient,
  input: {
    batchId: string;
    starsYear: number;
    rows: ParsedPlanPreviewCahpsAdjustedStar[];
  }
): Promise<void> {
  const inserts = input.rows.map((row) => ({
    batch_id: input.batchId,
    stars_year: input.starsYear,
    contract_id: row.contractId,
    organization_marketing_name: row.organizationMarketingName,
    parent_organization: row.parentOrganization,
    variable: row.variable,
    variable_name: row.variableName,
    measure_code: row.measureCode,
    measure_display_name: row.measureDisplayName,
    measure_normalized: row.measureNormalized,
    adjusted_base_star: row.adjustedBaseStar,
    unadjusted_base_star: row.unadjustedBaseStar,
    adjusted_final_star: row.adjustedFinalStar,
    case_mix_adjustment: row.caseMixAdjustment,
    plan_reliability: row.planReliability,
    plan_significance: row.planSignificance,
  }));

  for (let offset = 0; offset < inserts.length; offset += INSERT_BATCH_SIZE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (client as any)
      .from("plan_preview_cahps_adjusted_stars")
      .upsert(inserts.slice(offset, offset + INSERT_BATCH_SIZE), {
        onConflict: "stars_year,contract_id,measure_normalized",
      });
    if (error) throw new Error(error.message);
  }
}

export async function getPlanPreviewCahpsAdjustedStars(
  client: ServiceClient,
  starsYear: number
): Promise<PlanPreviewCahpsAdjustedStarRow[]> {
  const pageSize = 1000;
  const rows: PlanPreviewCahpsAdjustedStarRow[] = [];
  let from = 0;

  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any)
      .from("plan_preview_cahps_adjusted_stars")
      .select(
        "contract_id, measure_normalized, measure_code, measure_display_name, adjusted_base_star"
      )
      .eq("stars_year", starsYear)
      .order("contract_id", { ascending: true })
      .order("measure_normalized", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as Array<{
      contract_id: string;
      measure_normalized: string;
      measure_code: string;
      measure_display_name: string;
      adjusted_base_star: number;
    }>;
    for (const row of page) {
      rows.push({
        contractId: row.contract_id,
        measureNormalized: row.measure_normalized,
        measureCode: row.measure_code,
        measureDisplayName: row.measure_display_name,
        adjustedBaseStar: Number(row.adjusted_base_star),
      });
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}
