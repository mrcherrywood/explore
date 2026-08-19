import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ParsedPlanPreviewCaiRow } from "./types";

/** Stars 2026 Technical Notes Table 12. */
const OVERALL_CAI_BY_FAC_2026 = new Map<number, number>([
  [1, -0.063262],
  [2, -0.040422],
  [3, -0.017803],
  [4, 0.003256],
  [5, 0.01879],
  [6, 0.045683],
  [7, 0.058145],
  [8, 0.101257],
  [9, 0.145515],
]);

/** Stars 2026 Technical Notes Table 15. */
const PART_C_CAI_BY_FAC_2026 = new Map<number, number>([
  [1, -0.058259],
  [2, -0.036927],
  [3, -0.013699],
  [4, 0.004022],
  [5, 0.032302],
  [6, 0.059788],
  [7, 0.080451],
  [8, 0.10237],
]);

/** Stars 2026 Technical Notes Table 18. */
const PART_D_MAPD_CAI_BY_FAC_2026 = new Map<number, number>([
  [1, -0.033144],
  [2, -0.014987],
  [3, -0.002688],
  [4, 0.046282],
  [5, 0.072332],
  [6, 0.128476],
]);

type RawPriorCaiRow = {
  CONTRACT_ID?: string;
  "Organization Marketing Name"?: string;
  "Contract Name"?: string;
  "Parent Organization"?: string;
  "Puerto Rico Only"?: string;
  "Part C FAC"?: string | number | null;
  "Part D MA-PD FAC"?: string | number | null;
  "Overall FAC"?: string | number | null;
};

function cleanCell(value: unknown): string {
  return String(value ?? "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFac(value: unknown): number | null {
  const cleaned = cleanCell(value);
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
  const parsed = Number(cleaned);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseYesNoCell(value: unknown): boolean | null {
  const cleaned = cleanCell(value).toLowerCase();
  if (cleaned === "yes") return true;
  if (cleaned === "no") return false;
  return null;
}

/** Map published prior-year FAC to Technical Notes CAI values. Skip contracts with no FAC. */
export function buildPriorYearCaiRows(
  contractIds: string[],
  priorYear = 2026
): ParsedPlanPreviewCaiRow[] {
  const filePath = path.join(process.cwd(), "data", String(priorYear), `cai_${priorYear}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Published CAI file not found for ${priorYear}: ${filePath}`);
  }
  const rawRows: RawPriorCaiRow[] = JSON.parse(readFileSync(filePath, "utf-8"));
  const byId = new Map<string, RawPriorCaiRow>();
  for (const row of rawRows) {
    const id = cleanCell(row.CONTRACT_ID).toUpperCase();
    if (id) byId.set(id, row);
  }

  const rows: ParsedPlanPreviewCaiRow[] = [];
  for (const contractId of contractIds) {
    const raw = byId.get(contractId);
    if (!raw) continue;
    const overallFac = parseFac(raw["Overall FAC"]);
    const partCFac = parseFac(raw["Part C FAC"]);
    const partDFac = parseFac(raw["Part D MA-PD FAC"]);
    const overallCai = overallFac !== null ? (OVERALL_CAI_BY_FAC_2026.get(overallFac) ?? null) : null;
    const partCCai = partCFac !== null ? (PART_C_CAI_BY_FAC_2026.get(partCFac) ?? null) : null;
    const partDCai = partDFac !== null ? (PART_D_MAPD_CAI_BY_FAC_2026.get(partDFac) ?? null) : null;
    if (overallCai === null && partCCai === null && partDCai === null) continue;

    rows.push({
      sourceRowNumber: rows.length + 1,
      contractId,
      organizationMarketingName: cleanCell(raw["Organization Marketing Name"]) || null,
      contractName: cleanCell(raw["Contract Name"]) || null,
      parentOrganization: cleanCell(raw["Parent Organization"]) || null,
      puertoRicoOnly: parseYesNoCell(raw["Puerto Rico Only"]),
      contractType: "CCP",
      partDOffered: true,
      enrolled: null,
      numLisDe: null,
      numDisabled: null,
      pctLisDe: null,
      pctDisabled: null,
      partCLisDeGroup: null,
      partCDisabledQuintile: null,
      partCFac: partCFac !== null ? String(partCFac) : null,
      partCCai,
      partDMapdLisDeGroup: null,
      partDMapdDisabledQuintile: null,
      partDMapdFac: partDFac !== null ? String(partDFac) : null,
      partDMapdCai: partDCai,
      partDPdpLisDeQuartile: null,
      partDPdpDisabledQuartile: null,
      partDPdpFac: null,
      partDPdpCai: null,
      overallLisDeGroup: null,
      overallDisabledQuintile: null,
      overallFac: overallFac !== null ? String(overallFac) : null,
      overallCai,
    });
  }
  return rows;
}
