import type { MeasureScoreSample } from "@/lib/band-movement/analysis";
import { getPlanPreviewScoredRows } from "@/lib/plan-preview/store";
import type { createServiceRoleClient } from "@/lib/supabase/server";

import {
  getAllForecastProjectionsForRun,
  getLatestForecastRunForYear,
} from "./store";

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

const MA_CONTRACT_PATTERN = /^[HR]\d{4}$/;
const DUMMY_CONTRACT_PATTERN = /^H(\d)\1{3}$/;

export type ForecastYearEndOverlay = {
  byMeasureNormalized: Map<string, MeasureScoreSample[]>;
  byMeasureCode: Map<string, MeasureScoreSample[]>;
  runIds: string[];
};

export function isEligibleOverlayContract(contractId: string): boolean {
  const id = contractId.trim().toUpperCase();
  return MA_CONTRACT_PATTERN.test(id) && !DUMMY_CONTRACT_PATTERN.test(id);
}

function pushSample(
  index: Map<string, MeasureScoreSample[]>,
  key: string,
  sample: MeasureScoreSample
) {
  const list = index.get(key) ?? [];
  list.push(sample);
  index.set(key, list);
}

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

export function emptyForecastYearEndOverlay(): ForecastYearEndOverlay {
  return {
    byMeasureNormalized: new Map(),
    byMeasureCode: new Map(),
    runIds: [],
  };
}

/**
 * Approved forecast year-end scores for a stars year. Used to fill contracts
 * that have a Projected Final / glidepath rate but no accrued PP1 row.
 */
export async function loadApprovedForecastSamplesForYear(
  serviceClient: ServiceClient,
  starsYear: number
): Promise<ForecastYearEndOverlay> {
  const overlay = emptyForecastYearEndOverlay();
  const year = Math.round(starsYear);

  const runs = await Promise.all([
    getLatestForecastRunForYear(serviceClient, year, "approved", "non_cahps"),
    getLatestForecastRunForYear(serviceClient, year, "approved", "cahps"),
  ]);

  for (const run of runs) {
    if (!run) continue;
    overlay.runIds.push(run.id);
    const projections = await getAllForecastProjectionsForRun(serviceClient, run.id);
    for (const projection of projections) {
      const contractId = projection.contractId.trim().toUpperCase();
      if (!isEligibleOverlayContract(contractId)) continue;
      if (!Number.isFinite(projection.finalScore)) continue;
      const sample = { contractId, score: projection.finalScore };
      if (projection.measureNormalized) {
        pushSample(overlay.byMeasureNormalized, projection.measureNormalized, sample);
      }
      if (projection.measureCode) {
        pushSample(overlay.byMeasureCode, projection.measureCode.toUpperCase(), sample);
      }
    }
  }

  return overlay;
}

export function lookupForecastYearEndSamples(
  overlay: ForecastYearEndOverlay | undefined,
  measureNormalized: string,
  measureCode: string | null
): MeasureScoreSample[] {
  if (!overlay) return [];
  const exact = overlay.byMeasureNormalized.get(measureNormalized);
  if (exact?.length) return exact;
  if (measureCode) {
    const byCode = overlay.byMeasureCode.get(measureCode.toUpperCase());
    if (byCode?.length) return byCode;
  }
  const stripped = measureNormalized.replace(/\s*part\s*[cd]$/i, "").trim();
  if (stripped !== measureNormalized) {
    return overlay.byMeasureNormalized.get(stripped) ?? [];
  }
  return [];
}
