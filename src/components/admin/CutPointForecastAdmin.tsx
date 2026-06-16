"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Save, ShieldCheck, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ForecastMeasureDetailPanel } from "@/components/admin/ForecastMeasureDetailPanel";
import { ForecastMethodologyPanel } from "@/components/admin/ForecastMethodologyPanel";
import type { ForecastProjectionDetailRecord } from "@/lib/cutpoint-forecast/types";

type ProjectionRun = {
  id: string;
  forecastYear: number;
  status: "draft" | "approved";
  datasetType: "non_cahps" | "cahps";
  asOfYear: number | null;
  asOfMonth: number | null;
  projectionCount: number;
  createdAt: string;
  approvedAt: string | null;
};

type ProjectionRow = {
  id: string;
  runId: string;
  forecastYear: number;
  contractId: string;
  measureName: string;
  measureDisplayName: string;
  measureNormalized: string;
  measureCode: string | null;
  hlCode: string | null;
  metricCategory: "Part C" | "Part D" | "Other";
  priorYearScore: number | null;
  priorYearScoreYear: number | null;
  priorYearScoreMonth: number | null;
  modelScore: number;
  manualScore: number | null;
  finalScore: number;
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  trendSlope: number | null;
  seasonalityDelta: number | null;
  lastObservedYear: number | null;
  lastObservedMonth: number | null;
  lastObservedScore: number | null;
  supportingPoints: number;
  notes: string[];
};

type ProjectionResponse = {
  runs: ProjectionRun[];
  selectedRun: ProjectionRun | null;
  measureApprovals: Array<{
    id: string;
    runId: string;
    measureNormalized: string;
    measureDisplayName: string;
    approvedBy: string | null;
    approvedAt: string;
  }>;
  measureSummary: {
    contractCount: number;
    withPriorYearCount: number;
    averagePriorYearScore: number | null;
    averageModelScore: number | null;
    averageFinalScore: number | null;
    averageFinalDelta: number | null;
    averageModelDelta: number | null;
    improvedCount: number;
    heldCount: number;
    declinedCount: number;
  } | null;
  projections: ProjectionRow[];
  totalCount: number;
  page: number;
  pageSize: number;
};

type ImportResponse = {
  runs: ProjectionRun[];
  summary: {
    forecastYears: number[];
    runCount: number;
    projectionCount: number;
  };
};

type ForecastFilterOptionsResponse = {
  parentOrgs: string[];
  contracts: Array<{
    contractId: string;
    contractName: string;
    parentOrg: string;
  }>;
  measures: Array<{
    normalized: string;
    displayName: string;
  }>;
};

async function fetchProjectionState(input?: {
  runId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  contractIds?: string[];
  measure?: string;
}): Promise<ProjectionResponse> {
  const params = new URLSearchParams();
  if (input?.runId) params.set("runId", input.runId);
  if (input?.page) params.set("page", String(input.page));
  if (input?.pageSize) params.set("pageSize", String(input.pageSize));
  if (input?.search?.trim()) params.set("search", input.search.trim());
  if (input?.contractIds?.length) params.set("contractIds", input.contractIds.join(","));
  if (input?.measure) params.set("measure", input.measure);
  const response = await fetch(`/api/admin/forecast/projections?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Failed to load forecast projections");
  }
  return response.json();
}

async function fetchForecastFilterOptions(runId: string): Promise<ForecastFilterOptionsResponse> {
  const params = new URLSearchParams({ runId });
  const response = await fetch(`/api/admin/forecast/filters?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Failed to load forecast filter options");
  }
  return response.json();
}

async function fetchProjectionDetail(input: {
  runId: string;
  contractId: string;
  measureNormalized: string;
}): Promise<ForecastProjectionDetailRecord> {
  const params = new URLSearchParams(input);
  const response = await fetch(`/api/admin/forecast/detail?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? "Failed to load projection detail");
  }
  return response.json();
}

export function CutPointForecastAdmin() {
  const [data, setData] = useState<ProjectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [datasetType, setDatasetType] = useState<"non_cahps" | "cahps">("non_cahps");
  const [draftScores, setDraftScores] = useState<Record<string, string>>({});
  const [draftOriginalManualScores, setDraftOriginalManualScores] = useState<Record<string, number | null>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [filterOptions, setFilterOptions] = useState<ForecastFilterOptionsResponse | null>(null);
  const [selectedParentOrg, setSelectedParentOrg] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [selectedMeasure, setSelectedMeasure] = useState("");
  const [selectedProjection, setSelectedProjection] = useState<ProjectionRow | null>(null);
  const [detail, setDetail] = useState<ForecastProjectionDetailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  const filteredContractOptions = useMemo(() => {
    const contracts = filterOptions?.contracts ?? [];
    if (!selectedParentOrg) return contracts;
    return contracts.filter((contract) => contract.parentOrg === selectedParentOrg);
  }, [filterOptions?.contracts, selectedParentOrg]);

  const contractMetadataById = useMemo(
    () => new Map((filterOptions?.contracts ?? []).map((contract) => [contract.contractId, contract] as const)),
    [filterOptions?.contracts]
  );

  const selectedContractIds = useMemo(() => {
    if (selectedContractId) return [selectedContractId];
    if (selectedParentOrg) {
      return filteredContractOptions.map((contract) => contract.contractId);
    }
    return [];
  }, [filteredContractOptions, selectedContractId, selectedParentOrg]);

  const load = useCallback(async (runId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchProjectionState({
        runId,
        page,
        pageSize,
        search,
        contractIds: selectedContractIds,
        measure: selectedMeasure,
      });
      setData(response);
      setSelectedRunId((current) => current ?? response.selectedRun?.id ?? undefined);
      setSelectedProjection((current) =>
        current ? response.projections.find((row) => row.id === current.id) ?? null : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projections");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, selectedContractIds, selectedMeasure]);

  useEffect(() => {
    load(selectedRunId);
  }, [load, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) {
      setFilterOptions(null);
      return;
    }

    let cancelled = false;
    fetchForecastFilterOptions(selectedRunId)
      .then((response) => {
        if (!cancelled) setFilterOptions(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setFilterOptions(null);
          setError(err instanceof Error ? err.message : "Failed to load forecast filter options");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  useEffect(() => {
    if (!selectedProjection) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setError(null);

    fetchProjectionDetail({
      runId: selectedProjection.runId,
      contractId: selectedProjection.contractId,
      measureNormalized: selectedProjection.measureNormalized,
    })
      .then((response) => {
        if (!cancelled) setDetail(response);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail(null);
          setError(err instanceof Error ? err.message : "Failed to load projection detail");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjection]);

  const selectedRun = data?.selectedRun ?? null;
  const selectedMeasureDisplayName = useMemo(() => {
    if (!selectedMeasure) return "";
    return filterOptions?.measures.find((measure) => measure.normalized === selectedMeasure)?.displayName ?? selectedMeasure;
  }, [filterOptions?.measures, selectedMeasure]);
  const approvedMeasureNames = useMemo(
    () => new Set((data?.measureApprovals ?? []).map((approval) => approval.measureNormalized)),
    [data?.measureApprovals]
  );
  const selectedMeasureApproval = useMemo(() => {
    if (!selectedMeasure) return null;
    return data?.measureApprovals.find((approval) => approval.measureNormalized === selectedMeasure) ?? null;
  }, [data?.measureApprovals, selectedMeasure]);

  const filteredRows = useMemo(() => {
    const rows = data?.projections ?? [];
    return rows.filter((row) => {
      const draftValue = draftScores[row.id];
      const effectiveManual =
        draftValue !== undefined
          ? draftValue === ""
            ? null
            : Number(draftValue)
          : row.manualScore;
      const normalizedManual =
        row.manualScore === null && effectiveManual === row.modelScore
          ? null
          : effectiveManual;
      return !changedOnly || normalizedManual !== row.manualScore;
    });
  }, [changedOnly, data?.projections, draftScores]);

  const dirtyUpdates = useMemo(() => {
    const rowsById = new Map((data?.projections ?? []).map((row) => [row.id, row] as const));
    return Object.entries(draftScores)
      .map(([id, draftValue]) => {
        const parsed = draftValue === "" ? null : Number(draftValue);
        const originalManualScore = draftOriginalManualScores[id] ?? null;
        const row = rowsById.get(id);
        const manualScore =
          parsed === null || Number.isFinite(parsed) ? parsed : originalManualScore;
        const normalizedManualScore =
          row && originalManualScore === null && manualScore === row.modelScore
            ? null
            : manualScore;
        if (normalizedManualScore === originalManualScore) return null;
        return { id, manualScore: normalizedManualScore };
      })
      .filter((value): value is { id: string; manualScore: number | null } => Boolean(value));
  }, [data?.projections, draftOriginalManualScores, draftScores]);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("datasetType", datasetType);

      const response = await fetch("/api/admin/forecast/import", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to import workbook");
      }
      const payload = (await response.json()) as ImportResponse;
      const firstRunId = payload.runs[0]?.id;
      setSelectedRunId(firstRunId);
      setPage(1);
      setDraftScores({});
      setDraftOriginalManualScores({});
      setSelectedParentOrg("");
      setSelectedContractId("");
      setSelectedMeasure("");
      setSelectedProjection(null);
      setDetail(null);
      await load(firstRunId);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import workbook");
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedRun || dirtyUpdates.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/forecast/projections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateProjections",
          runId: selectedRun.id,
          updates: dirtyUpdates,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to save overrides");
      }
      setDraftScores({});
      setDraftOriginalManualScores({});
      await load(selectedRun.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save overrides");
    } finally {
      setSaving(false);
    }
  };

  const handleApproveRun = async () => {
    if (!selectedRun) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/forecast/projections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approveRun",
          runId: selectedRun.id,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to approve run");
      }
      await load(selectedRun.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve run");
    } finally {
      setSaving(false);
    }
  };

  const handleApproveMeasure = async () => {
    if (!selectedRun || !selectedMeasure) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/forecast/projections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approveMeasure",
          runId: selectedRun.id,
          measureNormalized: selectedMeasure,
          measureDisplayName: selectedMeasureDisplayName,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to approve measure");
      }
      await load(selectedRun.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve measure");
    } finally {
      setSaving(false);
    }
  };

  const handleRerunProjections = async () => {
    if (!selectedRun) return;
    setRerunning(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/forecast/projections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rerunProjections",
          runId: selectedRun.id,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to re-run projections");
      }
      setDraftScores({});
      setDraftOriginalManualScores({});
      setSelectedProjection(null);
      setDetail(null);
      await load(selectedRun.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-run projections");
    } finally {
      setRerunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Projected Year-End Scores</CardTitle>
              <CardDescription>
                Import monthly client history, review glidepath suggestions, and approve a forecast run for simulation.
              </CardDescription>
            </div>
            <Button asChild variant="outline">
              <Link href="/admin/users">User Management</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Data Type</label>
              <select
                value={datasetType}
                onChange={(event) => setDatasetType(event.target.value as "non_cahps" | "cahps")}
                className="w-56 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="non_cahps">Non-CAHPS (HL-coded monthly)</option>
                <option value="cahps">CAHPS survey (in-progress)</option>
              </select>
            </div>
            <div className="min-w-[260px] flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">
                {datasetType === "cahps" ? "CAHPS survey file" : "Workbook"}
              </label>
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <Button onClick={handleImport} disabled={!file || importing}>
              {importing ? <Loader2 className="animate-spin" /> : <Upload />}
              {importing ? "Importing..." : "Import Workbook"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {datasetType === "cahps"
              ? "CAHPS surveys are collected between weeks 10–22. The current cumulative rate is used directly as the projected score (no glidepath modeling); confidence rises as the latest survey week approaches week 22. The stars year is derived from the file's reporting year (stars year = reporting year + 1)."
              : "A separate forecast run is generated for each unpublished stars year in the file (e.g. SY2027, SY2028); years CMS has already published (SY2026 and earlier) are skipped. Non-CAHPS measures use the file's stars year directly and are projected to year-end via glidepath with guardrails (±2 points HEDIS, ±1 point Pharmacy from prior-year final)."}
          </p>

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRun && (
        <ForecastMethodologyPanel runId={selectedRun.id} forecastYear={selectedRun.forecastYear} />
      )}

      <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Run Selection</CardTitle>
              <CardDescription>
                Choose the imported run you want to review or approve.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleRerunProjections}
                disabled={!selectedRun || rerunning || selectedRun.datasetType === "cahps"}
                title={
                  selectedRun?.datasetType === "cahps"
                    ? "CAHPS runs use current survey rates; re-import the file to refresh."
                    : undefined
                }
              >
                {rerunning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {rerunning ? "Re-running..." : "Re-run Projections"}
              </Button>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={!selectedRun || dirtyUpdates.length === 0 || saving}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save Overrides
              </Button>
              <Button
                variant="outline"
                onClick={handleApproveMeasure}
                disabled={
                  !selectedRun ||
                  !selectedMeasure ||
                  Boolean(selectedMeasureApproval) ||
                  saving ||
                  dirtyUpdates.length > 0
                }
                title={
                  !selectedMeasure
                    ? "Select one measure to approve it."
                    : dirtyUpdates.length > 0
                      ? "Save overrides before approving this measure."
                      : undefined
                }
              >
                <ShieldCheck />
                {selectedMeasureApproval ? "Measure Approved" : "Approve Measure"}
              </Button>
              <Button
                onClick={handleApproveRun}
                disabled={!selectedRun || selectedRun.status === "approved" || saving || dirtyUpdates.length > 0}
              >
                <ShieldCheck />
                {selectedRun?.status === "approved" ? "Approved" : "Approve Run"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            value={selectedRun?.id ?? ""}
            onChange={(event) => {
              const nextRunId = event.target.value || undefined;
              setSelectedRunId(nextRunId);
              setPage(1);
              setDraftScores({});
              setDraftOriginalManualScores({});
              setSelectedParentOrg("");
              setSelectedContractId("");
              setSelectedMeasure("");
              setSelectedProjection(null);
              setDetail(null);
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a forecast run</option>
            {(data?.runs ?? []).map((run) => (
              <option key={run.id} value={run.id}>
                {run.forecastYear} · {run.datasetType === "cahps" ? "CAHPS" : "Non-CAHPS"} · {run.status} · {new Date(run.createdAt).toLocaleString()}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[220px]">
              <label className="mb-1 block text-xs text-muted-foreground">Parent Organization</label>
              <select
                value={selectedParentOrg}
                onChange={(event) => {
                  const nextParentOrg = event.target.value;
                  setSelectedParentOrg(nextParentOrg);
                  setSelectedContractId("");
                  setPage(1);
                  setSelectedProjection(null);
                  setDetail(null);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All parent organizations</option>
                {(filterOptions?.parentOrgs ?? []).map((parentOrg) => (
                  <option key={parentOrg} value={parentOrg}>
                    {parentOrg}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[220px]">
              <label className="mb-1 block text-xs text-muted-foreground">Contract</label>
              <select
                value={selectedContractId}
                onChange={(event) => {
                  setSelectedContractId(event.target.value);
                  setPage(1);
                  setSelectedProjection(null);
                  setDetail(null);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  {selectedParentOrg ? "All contracts in selected parent org" : "All contracts"}
                </option>
                {filteredContractOptions.map((contract) => (
                  <option key={contract.contractId} value={contract.contractId}>
                    {contract.contractId}
                    {contract.contractName ? ` · ${contract.contractName}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[240px]">
              <label className="mb-1 block text-xs text-muted-foreground">Measure</label>
              <select
                value={selectedMeasure}
                onChange={(event) => {
                  setSelectedMeasure(event.target.value);
                  setPage(1);
                  setSelectedProjection(null);
                  setDetail(null);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All measures</option>
                {(filterOptions?.measures ?? []).map((measure) => (
                  <option key={measure.normalized} value={measure.normalized}>
                    {measure.displayName}
                    {approvedMeasureNames.has(measure.normalized) ? " (approved)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Search</label>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                  setSelectedProjection(null);
                  setDetail(null);
                }}
                placeholder="Filter by contract or measure"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Rows Per Page</label>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                  setSelectedProjection(null);
                  setDetail(null);
                }}
                className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {[50, 100, 250, 500].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={changedOnly}
                onChange={(event) => setChangedOnly(event.target.checked)}
              />
              Show unsaved edits only
            </label>
          </div>

          {loading ? (
            <div className="py-10 text-sm text-muted-foreground">Loading projections...</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <div>
                  Showing {data?.totalCount ? ((page - 1) * pageSize) + 1 : 0}
                  –
                  {Math.min(page * pageSize, data?.totalCount ?? 0)} of {data?.totalCount ?? 0}
                  {selectedParentOrg ? ` in ${selectedParentOrg}` : ""}
                  {selectedContractId ? ` for ${selectedContractId}` : ""}
                  {selectedMeasureDisplayName ? ` for ${selectedMeasureDisplayName}` : ""}
                  {selectedMeasureApproval
                    ? ` · approved ${new Date(selectedMeasureApproval.approvedAt).toLocaleString()}`
                    : ""}
                  {search.trim() ? ` matches for "${search.trim()}"` : ""}
                </div>
                <div>
                  Page {page} of {Math.max(1, Math.ceil((data?.totalCount ?? 0) / pageSize))}
                </div>
              </div>
              {selectedMeasure && data?.measureSummary && (
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Year-over-year summary for {selectedMeasureDisplayName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Based on saved final projections
                        {selectedParentOrg ? ` in ${selectedParentOrg}` : ""}
                        {selectedContractId ? ` for ${selectedContractId}` : ""}
                        {search.trim() ? ` matching "${search.trim()}"` : ""}.
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Prior-year match: {data.measureSummary.withPriorYearCount} of {data.measureSummary.contractCount} contracts
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <SummaryMetric
                      label="Contracts"
                      value={String(data.measureSummary.contractCount)}
                      helper={`${data.measureSummary.withPriorYearCount} with prior-year score`}
                    />
                    <SummaryMetric
                      label="Avg Prior Year"
                      value={formatSummaryScore(data.measureSummary.averagePriorYearScore)}
                    />
                    <SummaryMetric
                      label="Avg Projected"
                      value={formatSummaryScore(data.measureSummary.averageFinalScore)}
                      helper={`Model avg ${formatSummaryScore(data.measureSummary.averageModelScore)}`}
                    />
                    <SummaryMetric
                      label="Avg YoY Change"
                      value={formatSummaryDelta(data.measureSummary.averageFinalDelta)}
                      accent={deltaAccent(data.measureSummary.averageFinalDelta)}
                      helper={`Model ${formatSummaryDelta(data.measureSummary.averageModelDelta)}`}
                    />
                    <SummaryMetric
                      label="Direction"
                      value={`${data.measureSummary.declinedCount} / ${data.measureSummary.heldCount} / ${data.measureSummary.improvedCount}`}
                      helper="Declined / held / improved"
                    />
                  </div>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#c7d7e8]/70 hover:bg-[#c7d7e8]/70">
                    <TableHead>Contract</TableHead>
                    <TableHead>Measure</TableHead>
                    <TableHead>Prior Year</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Manual</TableHead>
                    <TableHead>Final</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Last Observed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => {
                    const draftValue = draftScores[row.id];
                    const effectiveManual =
                      draftValue === undefined
                        ? row.manualScore
                        : draftValue === ""
                          ? null
                          : Number(draftValue);
                    const normalizedManual =
                      row.manualScore === null && effectiveManual === row.modelScore
                        ? null
                        : effectiveManual;
                    const isEdited = normalizedManual !== row.manualScore;
                    const effectiveFinal = effectiveManual ?? row.modelScore;

                    return (
                      <Fragment key={row.id}>
                      <TableRow
                        className={`cursor-pointer ${selectedProjection?.id === row.id ? "bg-muted/40" : ""}`}
                        onClick={() =>
                          setSelectedProjection((current) =>
                            current?.id === row.id ? null : row
                          )
                        }
                      >
                        <TableCell className="font-medium">{row.contractId}</TableCell>
                        <TableCell>{row.measureDisplayName}</TableCell>
                        <TableCell
                          title={
                            row.priorYearScoreYear && row.priorYearScoreMonth
                              ? `${row.priorYearScoreYear}-${String(row.priorYearScoreMonth).padStart(2, "0")}`
                              : undefined
                          }
                        >
                          {row.priorYearScore === null ? "—" : row.priorYearScore.toFixed(2)}
                        </TableCell>
                        <TableCell>{row.modelScore.toFixed(2)}</TableCell>
                        <TableCell>
                          <input
                            type="number"
                            step="0.01"
                            value={draftValue ?? (row.manualScore?.toString() ?? row.modelScore.toFixed(2))}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              setDraftScores((current) => ({
                                ...current,
                                [row.id]: event.target.value,
                              }));
                              setDraftOriginalManualScores((current) =>
                                row.id in current ? current : { ...current, [row.id]: row.manualScore }
                              );
                            }}
                            className={`w-24 rounded-md border px-2 py-1 text-sm ${
                              isEdited
                                ? "border-amber-500 bg-amber-500/10 text-foreground ring-1 ring-amber-500/40"
                                : "border-input bg-background"
                            }`}
                          />
                          {isEdited && (
                            <span className="ml-2 align-middle text-[0.65rem] font-medium text-amber-600">
                              edited
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{Number(effectiveFinal).toFixed(2)}</TableCell>
                        <TableCell className="capitalize">{row.confidenceLabel}</TableCell>
                        <TableCell>
                          {row.lastObservedYear && row.lastObservedMonth
                            ? `${row.lastObservedYear}-${String(row.lastObservedMonth).padStart(2, "0")} · ${row.lastObservedScore?.toFixed(2) ?? "—"}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                      {selectedProjection?.id === row.id && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={8} className="bg-muted/10 p-4">
                            {detailLoading ? (
                              <div className="py-6 text-sm text-muted-foreground">
                                Loading contract and measure history...
                              </div>
                            ) : detail ? (
                              <ForecastMeasureDetailPanel
                                detail={detail}
                                contractMetadata={contractMetadataById.get(row.contractId) ?? null}
                                manualTargetScore={
                                  draftScores[row.id] === undefined
                                    ? row.manualScore
                                    : draftScores[row.id] === ""
                                      ? null
                                      : Number(draftScores[row.id])
                                }
                                onClose={() => {
                                  setSelectedProjection(null);
                                  setDetail(null);
                                }}
                              />
                            ) : (
                              <div className="py-6 text-sm text-muted-foreground">
                                No monthly history is available for this row.
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                      </Fragment>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        No projection rows matched the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setPage((current) =>
                      Math.min(Math.max(1, Math.ceil((data?.totalCount ?? 0) / pageSize)), current + 1)
                    )
                  }
                  disabled={page >= Math.max(1, Math.ceil((data?.totalCount ?? 0) / pageSize))}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage(Math.max(1, Math.ceil((data?.totalCount ?? 0) / pageSize)))}
                  disabled={page >= Math.max(1, Math.ceil((data?.totalCount ?? 0) / pageSize))}
                >
                  Last
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function formatSummaryScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

function formatSummaryDelta(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function deltaAccent(value: number | null): string {
  if (value === null || value === 0) return "";
  return value > 0 ? "text-emerald-600" : "text-rose-600";
}

function SummaryMetric({
  label,
  value,
  helper,
  accent = "",
}: {
  label: string;
  value: string;
  helper?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${accent}`}>{value}</div>
      {helper && <div className="mt-1 text-xs text-muted-foreground">{helper}</div>}
    </div>
  );
}

