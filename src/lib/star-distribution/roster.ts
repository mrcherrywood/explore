import { isEligibleOverlayContract } from "@/lib/cutpoint-forecast/pp1-overlay";
import type { createServiceRoleClient } from "@/lib/supabase/server";

import type { BookRosterInventory, RosterMode } from "./types";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type BookRoster = {
  forecast: Set<string>;
  pp1: Set<string>;
  combined: Set<string>;
  inventory: BookRosterInventory;
  parentById: Map<string, string>;
};

function rememberParent(map: Map<string, string>, contractId: string, org: string | null) {
  const name = (org ?? "").trim();
  if (name && !map.has(contractId)) map.set(contractId, name);
}

async function listForecastContractIds(client: ServiceClient): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from("forecast_year_end_projections")
      .select("contract_id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      const id = (row.contract_id ?? "").trim().toUpperCase();
      if (isEligibleOverlayContract(id)) ids.add(id);
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function listPp1Contracts(
  client: ServiceClient
): Promise<{ ids: Set<string>; parentById: Map<string, string> }> {
  const ids = new Set<string>();
  const parentById = new Map<string, string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from("plan_preview_measure_scores")
      .select("contract_id, parent_organization")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      const id = (row.contract_id ?? "").trim().toUpperCase();
      if (!isEligibleOverlayContract(id)) continue;
      ids.add(id);
      rememberParent(parentById, id, row.parent_organization);
    }
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return { ids, parentById };
}

async function loadMaContractParents(
  client: ServiceClient,
  contractIds: string[]
): Promise<Map<string, string>> {
  const parentById = new Map<string, string>();
  const pageSize = 100;
  for (let i = 0; i < contractIds.length; i += pageSize) {
    const chunk = contractIds.slice(i, i + pageSize);
    const { data, error } = await client
      .from("ma_contracts")
      .select("contract_id, parent_organization, year")
      .in("contract_id", chunk)
      .order("year", { ascending: false });
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = (row.contract_id ?? "").trim().toUpperCase();
      rememberParent(parentById, id, row.parent_organization);
    }
  }
  return parentById;
}

export async function loadBookRoster(client: ServiceClient): Promise<BookRoster> {
  const [forecast, pp1] = await Promise.all([
    listForecastContractIds(client),
    listPp1Contracts(client),
  ]);

  const combined = new Set<string>([...forecast, ...pp1.ids]);
  let both = 0;
  for (const id of forecast) {
    if (pp1.ids.has(id)) both += 1;
  }

  const parentById = new Map(pp1.parentById);
  const stillMissing = [...combined].filter((id) => !parentById.has(id));
  if (stillMissing.length > 0) {
    const fromContracts = await loadMaContractParents(client, stillMissing);
    for (const [id, org] of fromContracts) {
      rememberParent(parentById, id, org);
    }
  }

  return {
    forecast,
    pp1: pp1.ids,
    combined,
    parentById,
    inventory: {
      forecast: forecast.size,
      pp1: pp1.ids.size,
      combined: combined.size,
      both,
    },
  };
}

export function rosterIdsForMode(roster: BookRoster, mode: RosterMode): Set<string> {
  if (mode === "forecast") return roster.forecast;
  if (mode === "pp1") return roster.pp1;
  return roster.combined;
}
