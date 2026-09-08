"use client";

import { useEffect, useMemo, useState } from "react";

import type { PlanPreviewContractOption } from "@/lib/plan-preview/types";

const UNKNOWN_PARENT_ORG = "Unknown parent organization";

export function PlanPreviewReportPicker({
  starsYear,
  contracts,
  hrefBase = "/admin/plan-preview/report",
  title = "Contract report",
  description = "Open a presentation report for any accrued contract. Filter by parent organization when more than one book is loaded.",
  buttonLabel = "Open contract report →",
}: {
  starsYear: number;
  contracts: PlanPreviewContractOption[];
  hrefBase?: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
}) {
  const [selectedParentOrg, setSelectedParentOrg] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");

  const parentOptions = useMemo(() => {
    const orgs = new Set<string>();
    for (const contract of contracts) {
      orgs.add(contract.parentOrganization?.trim() || UNKNOWN_PARENT_ORG);
    }
    return [...orgs].sort((left, right) => left.localeCompare(right));
  }, [contracts]);

  const filteredContracts = useMemo(() => {
    if (!selectedParentOrg) return contracts;
    return contracts.filter(
      (contract) =>
        (contract.parentOrganization?.trim() || UNKNOWN_PARENT_ORG) === selectedParentOrg
    );
  }, [contracts, selectedParentOrg]);

  useEffect(() => {
    if (selectedParentOrg && !parentOptions.includes(selectedParentOrg)) {
      setSelectedParentOrg("");
    }
  }, [parentOptions, selectedParentOrg]);

  useEffect(() => {
    if (filteredContracts.length === 0) {
      setSelectedContractId("");
      return;
    }
    if (!filteredContracts.some((contract) => contract.contractId === selectedContractId)) {
      setSelectedContractId(filteredContracts[0].contractId);
    }
  }, [filteredContracts, selectedContractId]);

  if (contracts.length === 0) return null;

  return (
    <section className="fep-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-[12rem] flex-1">
          <p className="fep-label">{title}</p>
          <p className="fep-subtitle" style={{ marginTop: 4 }}>
            {description}
          </p>
        </div>
        <select
          className="fep-select"
          value={selectedParentOrg}
          onChange={(event) => setSelectedParentOrg(event.target.value)}
          aria-label="Parent organization"
        >
          <option value="">All parent organizations</option>
          {parentOptions.map((parentOrg) => (
            <option key={parentOrg} value={parentOrg}>
              {parentOrg}
            </option>
          ))}
        </select>
        <select
          className="fep-select"
          value={selectedContractId}
          onChange={(event) => setSelectedContractId(event.target.value)}
          disabled={filteredContracts.length === 0}
          aria-label="Contract"
        >
          {filteredContracts.map((contract) => (
            <option key={contract.contractId} value={contract.contractId}>
              {contract.contractId}
              {contract.contractName ? ` — ${contract.contractName}` : ""}
            </option>
          ))}
        </select>
        {selectedContractId ? (
          <a
            className="fep-btn"
            href={`${hrefBase}?starsYear=${starsYear}&contractId=${encodeURIComponent(selectedContractId)}`}
            target="_blank"
            rel="noreferrer"
          >
            {buttonLabel}
          </a>
        ) : null}
      </div>
    </section>
  );
}
