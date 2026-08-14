import type { MeasureScoreSample } from "@/lib/band-movement/analysis";
import { getPlanPreviewScoredRows } from "@/lib/plan-preview/store";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type MergedOverlaySamples = {
  samples: MeasureScoreSample[];
  primaryCount: number;
  pp1FillCount: number;
};

type Pp1YearCache = {
  byMeasure: Map<string, MeasureScoreSample[]>;
};

const pp1YearCache = new Map<number, Promise<Pp1YearCache>>();

/**
 * Prefer primary (forecast Projected Final) scores; fill remaining contracts
 * from secondary (PP1 accrued scores) so non-client PP1 contracts like BCBS SC
 * enter the full-market overlay.
 */
export function mergeOverlaySamplesPreferPrimary(
  primary: MeasureScoreSample[],
  secondary: MeasureScoreSample[]
): MergedOverlaySamples {
  const byContract = new Map<string, MeasureScoreSample>();
  for (const sample of primary) {
    byContract.set(sample.contractId, sample);
  }
  const primaryCount = byContract.size;
  let pp1FillCount = 0;
  for (const sample of secondary) {
    if (byContract.has(sample.contractId)) continue;
    byContract.set(sample.contractId, sample);
    pp1FillCount += 1;
  }
  return {
    samples: [...byContract.values()],
    primaryCount,
    pp1FillCount,
  };
}

async function loadPp1YearCache(
  serviceClient: ServiceClient,
  starsYear: number
): Promise<Pp1YearCache> {
  const existing = pp1YearCache.get(starsYear);
  if (existing) return existing;

  const pending = (async () => {
    const rows = await getPlanPreviewScoredRows(serviceClient, starsYear);
    const byMeasure = new Map<string, MeasureScoreSample[]>();
    for (const row of rows) {
      if (row.cmsDataIssue || row.score === null) continue;
      const list = byMeasure.get(row.measureNormalized) ?? [];
      list.push({ contractId: row.contractId, score: row.score });
      byMeasure.set(row.measureNormalized, list);
    }
    return { byMeasure };
  })();

  pp1YearCache.set(starsYear, pending);
  try {
    return await pending;
  } catch (error) {
    pp1YearCache.delete(starsYear);
    throw error;
  }
}

/** Accrued PP1 scored rows for one measure (caller applies eligibility filters). */
export async function loadPp1SamplesForMeasure(
  serviceClient: ServiceClient,
  starsYear: number,
  measureNormalized: string
): Promise<MeasureScoreSample[]> {
  const cache = await loadPp1YearCache(serviceClient, starsYear);
  return cache.byMeasure.get(measureNormalized) ?? [];
}

/** Test helper — clear process-local PP1 year cache. */
export function clearPp1OverlayCacheForTests(): void {
  pp1YearCache.clear();
}
