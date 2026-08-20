import { getAvailableMeasureYears, getLatestContractRecords } from "@/lib/band-movement/analysis";
import { loadContractMetadata } from "@/lib/reward-factor/backtest";

import type { BookRosterOrg, BookRosterSources } from "./types";

export const UNRATED_ORG = "Not in published Star Ratings";

function parentOrgByContract(
  bookIds: Set<string>,
  overlay?: Map<string, string>
): Map<string, string> {
  const byId = new Map<string, string>();
  for (const record of getLatestContractRecords()) {
    const org = record.parentOrg.trim();
    if (bookIds.has(record.contractId) && org) {
      byId.set(record.contractId, org);
    }
  }

  const missing = () => [...bookIds].filter((id) => !byId.has(id));

  if (missing().length > 0) {
    const years = [...getAvailableMeasureYears()].sort((a, b) => b - a);
    for (const year of years) {
      const meta = loadContractMetadata(year);
      for (const id of missing()) {
        const org = meta.get(id)?.parentOrganization?.trim();
        if (org) byId.set(id, org);
      }
    }
  }

  if (overlay) {
    for (const id of missing()) {
      const org = overlay.get(id)?.trim();
      if (org) byId.set(id, org);
    }
  }

  return byId;
}

export function buildBookRosterOrgs(
  bookIds: Set<string>,
  sources: BookRosterSources
): BookRosterOrg[] {
  const parentById = parentOrgByContract(bookIds, sources.parentById);
  const groups = new Map<string, BookRosterOrg>();

  for (const contractId of bookIds) {
    const name = parentById.get(contractId) ?? UNRATED_ORG;
    const row = groups.get(name) ?? {
      name,
      contractCount: 0,
      forecast: 0,
      pp1: 0,
      both: 0,
      contracts: [],
    };
    const inForecast = sources.forecast.has(contractId);
    const inPp1 = sources.pp1.has(contractId);
    row.contractCount += 1;
    if (inForecast) row.forecast += 1;
    if (inPp1) row.pp1 += 1;
    if (inForecast && inPp1) row.both += 1;
    row.contracts.push(contractId);
    groups.set(name, row);
  }

  return [...groups.values()]
    .map((row) => ({
      ...row,
      contracts: [...row.contracts].sort((a, b) => a.localeCompare(b)),
    }))
    .sort(
      (a, b) =>
        b.contractCount - a.contractCount || a.name.localeCompare(b.name)
    );
}
