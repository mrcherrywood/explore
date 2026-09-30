import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { overlayOfficialMeasureWeights } from "./official-cut-points";

type ServiceClient = SupabaseClient<Database>;

/** Last-year ma_measures plus official Tech Notes weight overlays. */
export async function loadOfficialMeasureCatalog(
  client: ServiceClient,
  starsYear: number,
): Promise<{
  domainByCode: Map<string, string>;
  weightByCode: Map<string, number>;
}> {
  const domainByCode = new Map<string, string>();
  const weightByCode = new Map<string, number>();
  const { data: measureRows } = await client
    .from("ma_measures")
    .select("code, domain, weight")
    .eq("year", starsYear - 1);
  for (const row of (measureRows ?? []) as {
    code: string;
    domain: string | null;
    weight: number | null;
  }[]) {
    const code = row.code.toUpperCase();
    if (row.domain) domainByCode.set(code, row.domain);
    if (row.weight !== null && Number.isFinite(Number(row.weight))) {
      weightByCode.set(code, Number(row.weight));
    }
  }
  overlayOfficialMeasureWeights(starsYear, weightByCode);
  return { domainByCode, weightByCode };
}
