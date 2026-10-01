import { QI_MEASURE_CODES } from "@/lib/clover-impact/scenarios";
import type { PercentileThresholds } from "@/lib/reward-factor";

import {
  evaluateCloverRemoval,
  FOUR_STAR_CUTOFF,
  type CloverContractSearchInput,
} from "./clover-min-removal";
import { MIN_RATED_MEASURES, removalDropsPartDQi } from "./clover-removal-constants";

/** Domains that can be dropped. Quality Improvement stays in every scenario. */
export const DOMAIN_REMOVAL_DOMAINS = ["HEDIS", "HOS", "CAHPS", "Operations", "Pharmacy"] as const;

export type DomainRemovalScenario = {
  id: string;
  domains: string[];
  label: string;
};

export type DomainRemovalScore = {
  removedCount: number;
  finalScoreRaw: number | null;
  finalRating: number | null;
  atFour: boolean;
  unrated: boolean;
};

export type CloverDomainRemoval = {
  scenarios: DomainRemovalScenario[];
  contracts: Array<{
    contractId: string;
    scores: DomainRemovalScore[];
  }>;
};

export function domainRemovalScenarios(): DomainRemovalScenario[] {
  const domains = [...DOMAIN_REMOVAL_DOMAINS];
  const scenarios: DomainRemovalScenario[] = [];
  for (let mask = 1; mask < 1 << domains.length; mask += 1) {
    const picked = domains.filter((_, index) => (mask & (1 << index)) !== 0);
    scenarios.push({
      id: picked.join("+"),
      domains: picked,
      label: picked.join(" + "),
    });
  }
  return scenarios.sort((left, right) => {
    if (left.domains.length !== right.domains.length) return left.domains.length - right.domains.length;
    return left.label.localeCompare(right.label);
  });
}

function codesInDomains(
  input: CloverContractSearchInput,
  domains: readonly string[],
  domainByCode: ReadonlyMap<string, string>,
): string[] {
  const wanted = new Set(domains.map((domain) => domain.toLowerCase()));
  const codes: string[] = [];
  for (const measure of input.measures) {
    const code = measure.code.toUpperCase();
    if (QI_MEASURE_CODES.has(code) || measure.weight <= 0 || measure.starValue <= 0) continue;
    const domain = (domainByCode.get(code) ?? "").trim().toLowerCase();
    if (wanted.has(domain)) codes.push(code);
  }
  return codes;
}

function keepsRating(input: CloverContractSearchInput, removed: readonly string[]): boolean {
  const removedSet = new Set(removed.map((code) => code.toUpperCase()));
  if (removalDropsPartDQi(input.measures.map((measure) => measure.code), removedSet)) {
    removedSet.add("D04");
  }
  let count = 0;
  let partC = false;
  let partD = false;
  for (const measure of input.measures) {
    const code = measure.code.toUpperCase();
    if (measure.weight <= 0 || measure.starValue <= 0 || removedSet.has(code)) continue;
    count += 1;
    if (code.startsWith("D")) partD = true;
    else partC = true;
  }
  return count >= MIN_RATED_MEASURES && partC && partD;
}

export function scoreDomainRemovals(
  contracts: readonly CloverContractSearchInput[],
  domainByCode: ReadonlyMap<string, string>,
  withQi: PercentileThresholds,
  withoutQi: PercentileThresholds,
): CloverDomainRemoval {
  const scenarios = domainRemovalScenarios();
  return {
    scenarios,
    contracts: contracts.map((contract) => ({
      contractId: contract.contractId,
      scores: scenarios.map((scenario) => {
        const removed = codesInDomains(contract, scenario.domains, domainByCode);
        if (!keepsRating(contract, removed)) {
          return {
            removedCount: removed.length,
            finalScoreRaw: null,
            finalRating: null,
            atFour: false,
            unrated: true,
          };
        }
        const score = evaluateCloverRemoval(contract, removed, withQi, withoutQi);
        return {
          removedCount: removed.length,
          finalScoreRaw: score?.finalScoreRaw ?? null,
          finalRating: score?.finalRating ?? null,
          atFour: (score?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF,
          unrated: score == null,
        };
      }),
    })),
  };
}
